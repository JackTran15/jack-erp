import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import {
  CompareOperator,
  StringOperator,
} from '../../../../common/filters/filter.dto';
import { CashReceiptEntity } from '../cash-receipts/cash-receipt.entity';
import { CashVoucherDocumentKind, CashVoucherStatus } from '../enums';
import { SearchCashVouchersV2Handler } from './search-cash-vouchers-v2.handler';
import { SearchCashVouchersV2Query } from './search-cash-vouchers-v2.query';

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
describe('SearchCashVouchersV2Handler', () => {
  let handler: SearchCashVouchersV2Handler;
  let query: jest.Mock;

  const stubRows = [{ documentKind: 'CASH_RECEIPT', id: 'v-1' }];
  const stubTotals = [{ total: 7, totalAmount: 137248600 }];

  const build = async () => {
    query = jest
      .fn()
      .mockResolvedValueOnce(stubRows) // dataSql
      .mockResolvedValueOnce(stubTotals); // totalsSql
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchCashVouchersV2Handler,
        {
          provide: getRepositoryToken(CashReceiptEntity),
          useValue: { manager: { query } },
        },
      ],
    }).compile();
    handler = module.get(SearchCashVouchersV2Handler);
  };

  beforeEach(() => build());

  const run = (dto: Record<string, unknown>, ctx: ActorContext = actor) =>
    handler.execute(new SearchCashVouchersV2Query(dto, ctx));

  /** The data query is the first call: [sql, params]. */
  const dataCall = () => query.mock.calls[0] as [string, unknown[]];

  it('reads the party column from partner_name_snapshot alone', async () => {
    const [sql] = (await run({}), dataCall());

    // AC-02/AC-03. The two identities are two columns now (ADR-02): neither
    // expression may name the other's source, or one of them goes back to
    // hiding the other. Asserted per branch because a UNION ALL has two.
    expect(sql).toContain(
      "COALESCE(NULLIF(btrim(r.partner_name_snapshot), ''), '')\n                                                   AS counterparty",
    );
    expect(sql).toContain("COALESCE(NULLIF(btrim(p.partner_name_snapshot), ''), '')");
    // The old shape nested both sources in one COALESCE; it must be gone, not
    // merely reordered.
    expect(sql).not.toContain("NULLIF(btrim(r.payer_name), ''),\n          NULLIF");
  });

  it('reads the person column from payer_name / payee_name alone', async () => {
    const [sql] = (await run({}), dataCall());

    // AC-01. The receipt half names the column; the payment half is positional,
    // so the only thing that keeps them aligned is that both sides list party
    // before person. Assert that order on the payment half explicitly — swapping
    // the two lines there produces a query Postgres accepts and a grid that
    // shows each value under the other's heading.
    expect(sql).toContain(
      "COALESCE(NULLIF(btrim(r.payer_name), ''), '')\n                                                   AS \"personName\"",
    );
    const paymentHalf = sql.slice(sql.indexOf('FROM cash_receipts r'));
    expect(paymentHalf.indexOf('p.partner_name_snapshot')).toBeLessThan(
      paymentHalf.indexOf('p.payee_name'),
    );
  });

  it('projects personName in the outer select so the row reaches the grid', async () => {
    const [sql] = (await run({}), dataCall());
    // A column that exists in the CTE but not in the outer SELECT is invisible
    // with no error at all — the grid just renders an empty cell forever.
    const select = sql.slice(sql.lastIndexOf('SELECT', sql.indexOf('FROM combined')),
                             sql.indexOf('FROM combined'));
    expect(select).toContain('"personName"');
  });

  it('projects every field CashVoucherRowDto declares (AC-06)', async () => {
    const [sql] = (await run({}), dataCall());
    const projection = sql.slice(sql.indexOf('FROM combined'));
    const select = sql.slice(sql.lastIndexOf('SELECT', sql.indexOf('FROM combined')),
                             sql.indexOf('FROM combined'));

    // The whole list, not just the field of the day. `manager.query<RowDto[]>` is
    // a cast rather than a check, so a column the DTO promises and the SELECT
    // omits reaches the grid as `undefined` with tsc green and Postgres silent —
    // which is exactly how `revision` shipped broken.
    for (const field of [
      'documentKind', 'kind', 'id', 'createdAt', 'voucherDate', 'documentNumber',
      'status', 'totalAmount', 'cashAccountId', 'referenceType', 'revision',
      'counterparty', 'personName', 'reason',
    ]) {
      expect(select).toContain(field);
    }
    expect(projection).toBeTruthy();
  });

  it('keeps revision out of the totals query', async () => {
    await run({});
    const [totalsSql] = query.mock.calls[1] as [string, unknown[]];
    // totalsSql is a bare COUNT/SUM; a stray column there is a different bug.
    const totalsSelect = totalsSql.slice(totalsSql.lastIndexOf('SELECT COUNT'));
    expect(totalsSelect).not.toContain('revision');
  });

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
    await run({}, { ...actor, branchId: undefined });

    const [sql, params] = dataCall();
    expect(sql).not.toContain('branch_id');
    expect(params).toEqual(['org-1', 20, 0]);
  });

  it('keeps branch scoping when a cashAccountId is supplied', async () => {
    // The v1 list endpoints dropped the branch filter whenever an account was
    // given; both must apply here.
    await run({ cashAccountId: 'acc-1' });

    const [sql, params] = dataCall();
    expect(sql).toContain('r.branch_id = $2');
    expect(sql).toContain('r.cash_account_id = $3');
    expect(sql).toContain('p.cash_account_id = $3');
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

  it('derives GOODS_RECEIPT_PAYMENT from the payment reference type', async () => {
    await run({});
    const [sql] = dataCall();
    expect(sql).toContain(
      "WHEN p.reference_type::text = 'GOODS_RECEIPT' THEN 'GOODS_RECEIPT_PAYMENT'",
    );
    expect(sql).toContain("ELSE 'CASH_PAYMENT'");
  });

  it('orders by createdAt DESC with id as the tiebreaker', async () => {
    await run({});
    const [sql] = dataCall();
    expect(sql).toMatch(/ORDER BY "createdAt" DESC, id DESC/);
  });

  it('omits the WHERE clause when no filters are supplied', async () => {
    await run({});
    const [sql, params] = dataCall();
    expect(sql).not.toContain('WHERE COALESCE');
    expect(params).toEqual(['org-1', 'branch-1', 20, 0]);
  });

  it('builds a parameterized ILIKE clause for a CONTAINS string filter', async () => {
    await run({
      documentNumber: { operator: StringOperator.CONTAINS, value: 'PT0001' },
    });
    const [sql, params] = dataCall();
    expect(sql).toMatch(/COALESCE\("documentNumber", ''\) ILIKE \$3/);
    expect(params).toContain('%PT0001%');
  });

  it('escapes wildcards in string filter values', async () => {
    await run({ reason: { operator: StringOperator.CONTAINS, value: '50%_off' } });
    const [, params] = dataCall();
    expect(params).toContain('%50\\%\\_off%');
  });

  it('filters the counterparty column', async () => {
    await run({
      counterparty: { operator: StringOperator.EQUALS, value: 'A CHINH' },
    });
    const [sql, params] = dataCall();
    expect(sql).toContain("lower(COALESCE(counterparty, '')) = lower($3)");
    expect(params).toContain('A CHINH');
  });

  it('filters the personName column independently of counterparty', async () => {
    // AC-04/AC-05. Two filters, two predicates, two params — if they ever
    // collapsed onto one column, filtering by a name that exists only in the
    // other field would still return the row.
    await run({
      counterparty: { operator: StringOperator.CONTAINS, value: 'kkkk' },
      personName: { operator: StringOperator.CONTAINS, value: '123123' },
    });
    const [sql, params] = dataCall();
    expect(sql).toContain("COALESCE(counterparty, '') ILIKE $3");
    expect(sql).toContain('COALESCE("personName", \'\') ILIKE $4');
    expect(params).toEqual(['org-1', 'branch-1', '%kkkk%', '%123123%', 20, 0]);
  });

  it('builds a numeric comparison clause for the total amount filter', async () => {
    await run({ totalAmount: { operator: CompareOperator.GTE, value: 100000 } });
    const [sql, params] = dataCall();
    expect(sql).toMatch(/"totalAmount" >= \$3/);
    expect(params).toContain(100000);
  });

  it('builds equality clauses for the documentKind and status enum filters', async () => {
    await run({
      documentKind: { value: CashVoucherDocumentKind.GOODS_RECEIPT_PAYMENT },
      status: { value: CashVoucherStatus.POSTED },
    });
    const [sql, params] = dataCall();
    expect(sql).toMatch(/"documentKind" = \$3/);
    expect(sql).toMatch(/status = \$4/);
    expect(params).toContain('GOODS_RECEIPT_PAYMENT');
    expect(params).toContain('POSTED');
  });

  it('applies an inclusive date range on createdAt', async () => {
    await run({ createdAt: { from: '2026-07-01', to: '2026-07-31' } });
    const [sql, params] = dataCall();
    expect(sql).toMatch(/"createdAt"::date >= \$3::date/);
    expect(sql).toMatch(/"createdAt"::date <= \$4::date/);
    expect(params).toContain('2026-07-01');
    expect(params).toContain('2026-07-31');
  });

  it('applies the same filters to the totals query so the footer matches the grid', async () => {
    await run({ documentKind: { value: CashVoucherDocumentKind.CASH_RECEIPT } });
    const [dataSql] = dataCall();
    const [totalsSql, totalsParams] = query.mock.calls[1] as [string, unknown[]];

    expect(totalsSql).toContain('"documentKind" = $3');
    expect(totalsSql).toContain('COALESCE(SUM("totalAmount"), 0)::float');
    // totals must not carry LIMIT/OFFSET params
    expect(totalsParams).toEqual(['org-1', 'branch-1', 'CASH_RECEIPT']);
    expect(dataSql).toContain('LIMIT');
    expect(totalsSql).not.toContain('LIMIT');
  });
});
