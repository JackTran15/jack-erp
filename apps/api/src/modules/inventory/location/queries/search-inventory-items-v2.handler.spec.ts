import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import {
  CompareOperator,
  StringOperator,
} from '../../../../common/filters/filter.dto';
import { ItemEntity } from '../item.entity';
import { SearchInventoryItemsV2Handler } from './search-inventory-items-v2.handler';
import { SearchInventoryItemsV2Query } from './search-inventory-items-v2.query';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

// Aggregation/filtering now runs in SQL (mirrors listProductGroups), so the
// unit test exercises the query construction: org scoping is param $1, filters
// append parameterized WHERE clauses, pagination becomes LIMIT/OFFSET, and the
// raw rows + count pass straight through into the envelope.
describe('SearchInventoryItemsV2Handler', () => {
  let handler: SearchInventoryItemsV2Handler;
  let query: jest.Mock;

  // query() is called twice per execute (data, then count) via Promise.all.
  const stubRows = [{ type: 'product', code: 'GELLI' }];
  const stubCount = [{ total: 7 }];

  beforeEach(async () => {
    query = jest
      .fn()
      .mockResolvedValueOnce(stubRows) // dataSql
      .mockResolvedValueOnce(stubCount); // countSql
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchInventoryItemsV2Handler,
        {
          provide: getRepositoryToken(ItemEntity),
          useValue: { manager: { query } },
        },
      ],
    }).compile();
    handler = module.get(SearchInventoryItemsV2Handler);
  });

  const run = (dto: Record<string, unknown>) =>
    handler.execute(new SearchInventoryItemsV2Query(dto, actor));

  /** The data query is the first call: [sql, params]. */
  const dataCall = () => query.mock.calls[0] as [string, unknown[]];

  it('scopes by organizationId ($1), paginates via LIMIT/OFFSET, passes rows + count through', async () => {
    const res = await run({ page: 2, limit: 5 });

    const [sql, params] = dataCall();
    expect(params[0]).toBe('org-1'); // $1 = orgId
    expect(sql).toContain('organization_id = $1');
    // last two params are limit, offset
    expect(params.slice(-2)).toEqual([5, 5]); // offset = (2-1)*5
    expect(sql).toContain('LIMIT');
    expect(sql).toContain('OFFSET');

    expect(res).toEqual({ data: stubRows, total: 7, page: 2, limit: 5 });
  });

  it('omits the WHERE clause when no filters are supplied', async () => {
    await run({});
    const [sql, params] = dataCall();
    expect(sql).not.toContain('WHERE combined'); // no post-CTE filter clause
    // only orgId + limit + offset
    expect(params).toEqual(['org-1', 20, 0]);
  });

  it('builds a parameterized ILIKE clause for a CONTAINS string filter', async () => {
    await run({ barcode: { operator: StringOperator.CONTAINS, value: 'B2' } });
    const [sql, params] = dataCall();
    expect(sql).toMatch(/COALESCE\(barcode, ''\) ILIKE \$2/);
    expect(params).toContain('%B2%');
  });

  it('escapes wildcards in string filter values', async () => {
    await run({ name: { operator: StringOperator.CONTAINS, value: '50%_off' } });
    const [, params] = dataCall();
    expect(params).toContain('%50\\%\\_off%');
  });

  it('builds a numeric comparison clause for a compare filter', async () => {
    await run({
      purchasePrice: { operator: CompareOperator.LTE, value: 350000 },
    });
    const [sql, params] = dataCall();
    expect(sql).toMatch(/"purchasePrice" <= \$2/);
    expect(params).toContain(350000);
  });

  it('builds an equality clause for a boolean filter', async () => {
    await run({ isActive: false });
    const [sql, params] = dataCall();
    expect(sql).toMatch(/"isActive" = \$2/);
    expect(params).toContain(false);
  });
});

// ─── Out-of-stock filter ──────────────────────────────────────────────────────
// SQL-level construction only. Whether the predicate is semantically right
// (-1 and +1 cancelling to 0, groups with no balance row counting as 0) is
// proven against a real database in inventory-item-search-v2.e2e-spec.ts —
// a mocked `query` cannot tell a correct SUM from an incorrect one.
describe('SearchInventoryItemsV2Handler — outOfStock', () => {
  let handler: SearchInventoryItemsV2Handler;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchInventoryItemsV2Handler,
        {
          provide: getRepositoryToken(ItemEntity),
          useValue: { manager: { query } },
        },
      ],
    }).compile();
    handler = module.get(SearchInventoryItemsV2Handler);
  });

  const run = (dto: Record<string, unknown>, withActor: ActorContext = actor) =>
    handler.execute(new SearchInventoryItemsV2Query(dto, withActor));
  const dataCall = () => query.mock.calls[0] as [string, unknown[]];

  it('adds no stock machinery at all when the flag is absent', async () => {
    await run({});
    const [sql, params] = dataCall();
    expect(sql).not.toContain('stockTotal');
    expect(sql).not.toContain('stock_balances');
    expect(params).toEqual(['org-1', 20, 0]);
  });

  it('adds no stock machinery when the flag is explicitly false', async () => {
    await run({ outOfStock: false });
    const [sql] = dataCall();
    expect(sql).not.toContain('stockTotal');
  });

  it('binds the branch as $2 and filters on the signed sum being <= 0', async () => {
    await run({ outOfStock: true });
    const [sql, params] = dataCall();

    expect(params[0]).toBe('org-1');
    expect(params[1]).toBe('branch-1');
    expect(sql).toContain('sb.branch_id = $2');
    expect(sql).toContain('"stockTotal" <= 0');
    // `<= 0`, deliberately wider than StockStateFilter.OUT_OF_STOCK (`= 0`).
    expect(sql).not.toContain('"stockTotal" = 0');
  });

  it('never clamps the sum — negative stock has to cancel positive stock', async () => {
    await run({ outOfStock: true });
    const [sql] = dataCall();
    expect(sql).not.toMatch(/GREATEST\s*\(\s*0/i);
    expect(sql).toContain('SUM(sb.quantity)');
  });

  it('defaults a group with no balance row to 0 rather than dropping it', async () => {
    await run({ outOfStock: true });
    const [sql] = dataCall();
    // COALESCE(..., 0) is what keeps never-stocked groups in the result set.
    expect(sql).toMatch(/COALESCE\(\(\s*SELECT SUM\(sb\.quantity\)/);
    expect(sql).toContain('), 0)');
  });

  it('compares branch id as text — casting it to ::uuid breaks the statement', async () => {
    await run({ outOfStock: true });
    const [sql] = dataCall();
    // stock_balances.branch_id is varchar while branches.id is uuid; a ::uuid
    // cast here makes Postgres infer two conflicting types for one parameter.
    expect(sql).not.toMatch(/branch_id\s*=\s*\$2::uuid/);
  });

  it('covers both the product and the orphan arm of the CTE', async () => {
    await run({ outOfStock: true });
    const [sql] = dataCall();
    expect(sql).toContain('WHERE i2.product_id = p.id');
    expect(sql).toContain('sb.item_id = i.id');
  });

  it('projects "stockTotal" away so the response shape is unchanged', async () => {
    await run({ outOfStock: true });
    const [sql] = dataCall();
    expect(sql).not.toMatch(/SELECT \* FROM combined/);
    expect(sql).toMatch(/SELECT type, id, code, name/);
  });

  it('applies the same predicate to the count query, so pagination matches', async () => {
    await run({ outOfStock: true });
    const [countSql] = query.mock.calls[1] as [string, unknown[]];
    expect(countSql).toContain('COUNT(*)');
    expect(countSql).toContain('"stockTotal" <= 0');
  });

  it('ANDs with the column filters instead of replacing them', async () => {
    await run({
      outOfStock: true,
      brand: { operator: StringOperator.CONTAINS, value: 'MT' },
    });
    const [sql, params] = dataCall();
    expect(sql).toContain('"stockTotal" <= 0');
    expect(sql).toContain('ILIKE');
    expect(sql).toMatch(/AND/);
    // branch took $2, so the brand filter must have shifted to $3.
    expect(params[1]).toBe('branch-1');
    expect(params[2]).toBe('%MT%');
    expect(sql).toContain('$3');
  });

  it('refuses the filter when no branch is selected, rather than reporting everything as out of stock', async () => {
    await expect(
      run({ outOfStock: true }, { ...actor, branchId: undefined }),
    ).rejects.toThrow(/branch/i);
    expect(query).not.toHaveBeenCalled();
  });
});
