import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import {
  CompareOperator,
  StringOperator,
} from '../../../../common/filters/filter.dto';
import { ProductEntity } from '../product.entity';
import { SearchProductsV2Handler } from './search-products-v2.handler';
import { SearchProductsV2Query } from './search-products-v2.query';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

// Aggregation/filtering runs in SQL (variant grouping), so the unit test
// exercises query construction: org scoping is param $1, filters append
// parameterized WHERE clauses, pagination becomes LIMIT/OFFSET, and the raw
// rows + count pass straight through into the envelope.
describe('SearchProductsV2Handler', () => {
  let handler: SearchProductsV2Handler;
  let query: jest.Mock;

  // query() is called twice per execute (data, then count) via Promise.all.
  const stubRows = [{ id: 'p1', name: 'Giày Gelli' }];
  const stubCount = [{ total: 3 }];

  beforeEach(async () => {
    query = jest
      .fn()
      .mockResolvedValueOnce(stubRows) // dataSql
      .mockResolvedValueOnce(stubCount); // countSql
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchProductsV2Handler,
        {
          provide: getRepositoryToken(ProductEntity),
          useValue: { manager: { query } },
        },
      ],
    }).compile();
    handler = module.get(SearchProductsV2Handler);
  });

  const run = (dto: Record<string, unknown>) =>
    handler.execute(new SearchProductsV2Query(dto, actor));

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

    expect(res).toEqual({ data: stubRows, total: 3, page: 2, limit: 5 });
  });

  it('omits the WHERE clause when no filters are supplied', async () => {
    await run({});
    const [sql, params] = dataCall();
    expect(sql).not.toContain('WHERE name'); // no post-CTE filter clause
    // only orgId + limit + offset
    expect(params).toEqual(['org-1', 20, 0]);
  });

  it('builds a parameterized ILIKE clause for a CONTAINS string filter', async () => {
    await run({ name: { operator: StringOperator.CONTAINS, value: 'Gelli' } });
    const [sql, params] = dataCall();
    expect(sql).toMatch(/COALESCE\(name, ''\) ILIKE \$2/);
    expect(params).toContain('%Gelli%');
  });

  it('escapes wildcards in string filter values', async () => {
    await run({ name: { operator: StringOperator.CONTAINS, value: '50%_off' } });
    const [, params] = dataCall();
    expect(params).toContain('%50\\%\\_off%');
  });

  it('builds a numeric comparison clause for a compare filter', async () => {
    await run({
      sellingPrice: { operator: CompareOperator.LTE, value: 350000 },
    });
    const [sql, params] = dataCall();
    expect(sql).toMatch(/"sellingPrice" <= \$2/);
    expect(params).toContain(350000);
  });

  it('builds an equality clause for a boolean filter', async () => {
    await run({ isActive: false });
    const [sql, params] = dataCall();
    expect(sql).toMatch(/"isActive" = \$2/);
    expect(params).toContain(false);
  });
});
