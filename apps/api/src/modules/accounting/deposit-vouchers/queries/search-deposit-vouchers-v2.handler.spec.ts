import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import {
  CompareOperator,
  StringOperator,
} from '../../../../common/filters/filter.dto';
import { BankReceiptEntity } from '../bank-receipts/bank-receipt.entity';
import { BankVoucherStatus, DepositVoucherKind } from '../enums';
import { SearchDepositVouchersV2Handler } from './search-deposit-vouchers-v2.handler';
import { SearchDepositVouchersV2Query } from './search-deposit-vouchers-v2.query';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

// The merge, filtering, ordering and totals all run in SQL, so the unit test
// exercises query construction: scoping params come first, filters append
// parameterized WHERE clauses, pagination becomes LIMIT/OFFSET, and the raw rows
// + totals pass through into the envelope.
describe('SearchDepositVouchersV2Handler', () => {
  let handler: SearchDepositVouchersV2Handler;
  let query: jest.Mock;

  const stubRows = [{ kind: 'RECEIPT', id: 'v-1' }];
  const stubTotals = [{ total: 7, totalAmount: 137248600 }];

  const build = async (ctx: ActorContext = actor) => {
    query = jest
      .fn()
      .mockResolvedValueOnce(stubRows) // dataSql
      .mockResolvedValueOnce(stubTotals); // totalsSql
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchDepositVouchersV2Handler,
        {
          provide: getRepositoryToken(BankReceiptEntity),
          useValue: { manager: { query } },
        },
      ],
    }).compile();
    handler = module.get(SearchDepositVouchersV2Handler);
    return ctx;
  };

  beforeEach(() => build());

  const run = (dto: Record<string, unknown>, ctx: ActorContext = actor) =>
    handler.execute(new SearchDepositVouchersV2Query(dto, ctx));

  /** The data query is the first call: [sql, params]. */
  const dataCall = () => query.mock.calls[0] as [string, unknown[]];

  it('scopes by organizationId and branchId, paginates, and returns the envelope', async () => {
    const res = await run({ page: 2, limit: 5 });

    const [sql, params] = dataCall();
    expect(params[0]).toBe('org-1'); // $1 = orgId
    expect(params[1]).toBe('branch-1'); // $2 = branchId
    expect(sql).toContain('r.organization_id = $1');
    expect(sql).toContain('p.organization_id = $1');
    expect(sql).toContain('r.branch_id = $2');
    expect(sql).toContain('p.branch_id = $2');
    // last two params are limit, offset
    expect(params.slice(-2)).toEqual([5, 5]); // offset = (2-1)*5

    expect(res).toEqual({
      data: stubRows,
      total: 7,
      page: 2,
      limit: 5,
      totalAmount: 137248600,
    });
  });

  it('omits branch scoping when the actor has no branch', async () => {
    await build({ ...actor, branchId: undefined });
    await run({}, { ...actor, branchId: undefined });

    const [sql, params] = dataCall();
    expect(sql).not.toContain('branch_id');
    expect(params).toEqual(['org-1', 20, 0]);
  });

  it('keeps branch scoping when a depositAccountId is supplied', async () => {
    // The v1 list endpoints dropped the branch filter whenever an account was
    // given; both must apply here.
    await run({ depositAccountId: 'acc-1' });

    const [sql, params] = dataCall();
    expect(sql).toContain('r.branch_id = $2');
    expect(sql).toContain('r.deposit_account_id = $3');
    expect(sql).toContain('p.deposit_account_id = $3');
    expect(params.slice(0, 3)).toEqual(['org-1', 'branch-1', 'acc-1']);
  });

  it('excludes soft-deleted vouchers from both halves of the union', async () => {
    await run({});
    const [sql] = dataCall();
    expect(sql).toContain('r.deleted_at IS NULL');
    expect(sql).toContain('p.deleted_at IS NULL');
  });

  it('casts both reference_type enums to text so the union types match', async () => {
    await run({});
    const [sql] = dataCall();
    expect(sql).toContain('r.reference_type::text');
    expect(sql).toContain('p.reference_type::text');
  });

  it('orders by createdAt DESC with id as the tiebreaker', async () => {
    await run({});
    const [sql] = dataCall();
    expect(sql).toMatch(/ORDER BY "createdAt" DESC, id DESC/);
  });

  it('omits the WHERE clause when no filters are supplied', async () => {
    await run({});
    const [sql, params] = dataCall();
    expect(sql).not.toContain('WHERE rows');
    expect(params).toEqual(['org-1', 'branch-1', 20, 0]);
  });

  it('builds a parameterized ILIKE clause for a CONTAINS string filter', async () => {
    await run({
      documentNumber: { operator: StringOperator.CONTAINS, value: 'UNC' },
    });
    const [sql, params] = dataCall();
    expect(sql).toMatch(/COALESCE\("documentNumber", ''\) ILIKE \$3/);
    expect(params).toContain('%UNC%');
  });

  it('escapes wildcards in string filter values', async () => {
    await run({ reason: { operator: StringOperator.CONTAINS, value: '50%_off' } });
    const [, params] = dataCall();
    expect(params).toContain('%50\\%\\_off%');
  });

  it('filters the counterparty and account label columns', async () => {
    await run({
      counterparty: { operator: StringOperator.EQUALS, value: 'A CHINH' },
      accountLabel: { operator: StringOperator.CONTAINS, value: '199118899' },
    });
    const [sql, params] = dataCall();
    // accountLabel is applied before counterparty, so it claims $3.
    expect(sql).toMatch(/COALESCE\(account_label, ''\) ILIKE \$3/);
    expect(sql).toContain('lower(COALESCE(counterparty, \'\')) = lower($4)');
    expect(params).toContain('A CHINH');
    expect(params).toContain('%199118899%');
  });

  it('builds a numeric comparison clause for the total amount filter', async () => {
    await run({ totalAmount: { operator: CompareOperator.GTE, value: 100000 } });
    const [sql, params] = dataCall();
    expect(sql).toMatch(/"totalAmount" >= \$3/);
    expect(params).toContain(100000);
  });

  it('builds equality clauses for the kind and status enum filters', async () => {
    await run({
      kind: { value: DepositVoucherKind.PAYMENT },
      status: { value: BankVoucherStatus.POSTED },
    });
    const [sql, params] = dataCall();
    expect(sql).toMatch(/kind = \$3/);
    expect(sql).toMatch(/status = \$4/);
    expect(params).toContain('PAYMENT');
    expect(params).toContain('POSTED');
  });

  it('applies an inclusive date range on docDate', async () => {
    await run({ docDate: { from: '2026-07-01', to: '2026-07-31' } });
    const [sql, params] = dataCall();
    expect(sql).toMatch(/"docDate"::date >= \$3::date/);
    expect(sql).toMatch(/"docDate"::date <= \$4::date/);
    expect(params).toContain('2026-07-01');
    expect(params).toContain('2026-07-31');
  });

  it('applies the same filters to the totals query so the footer matches the grid', async () => {
    await run({ kind: { value: DepositVoucherKind.RECEIPT } });
    const [dataSql] = dataCall();
    const [totalsSql, totalsParams] = query.mock.calls[1] as [string, unknown[]];

    expect(totalsSql).toContain('kind = $3');
    expect(totalsSql).toContain('COALESCE(SUM("totalAmount"), 0)::float');
    // totals must not carry LIMIT/OFFSET params
    expect(totalsParams).toEqual(['org-1', 'branch-1', 'RECEIPT']);
    expect(dataSql).toContain('LIMIT');
    expect(totalsSql).not.toContain('LIMIT');
  });
});
