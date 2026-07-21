import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CashLedgerService } from './cash-ledger.service';
import { CashFundResolverService } from '../../cash/cash-fund-resolver.service';
import { CashMovementEntity } from '../../cash/cash-movement.entity';
import { CashAccountEntity } from '../../cash/cash-account.entity';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import {
  CompareOperator,
  StringOperator,
} from '../../../../common/filters/filter.dto';

const actor: ActorContext = {
  userId: 'u-1',
  organizationId: 'org-1',
  branchId: 'b-1',
  roles: [],
};
const ACC = 'acc-1';

/** A page row as the SQL row stream now returns it (signed + voucher columns). */
function row(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    type: 'DEPOSIT',
    amount: '200',
    cash_account_id: ACC,
    to_account_id: null,
    created_at: new Date('2026-05-01T08:00:00Z'),
    signed: '200',
    receipt_id: null,
    payment_id: null,
    voucher_number: null,
    description: null,
    counterparty: null,
    staff: null,
    ...over,
  };
}

// search() issues scalar queries in this order:
//   1) opening   2) closing   3) debit/credit   4) count
//   5) sumSignedBeforeOffset (ONLY when offset > 0)   then page rows.
describe('CashLedgerService', () => {
  let service: CashLedgerService;
  let movementRepo: { query: jest.Mock };
  let accountRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    movementRepo = { query: jest.fn() };
    accountRepo = { findOne: jest.fn().mockResolvedValue({ id: ACC }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashLedgerService,
        { provide: getRepositoryToken(CashMovementEntity), useValue: movementRepo },
        { provide: getRepositoryToken(CashAccountEntity), useValue: accountRepo },
        {
          provide: CashFundResolverService,
          useValue: {
            resolveBranchCashFund: jest.fn().mockResolvedValue(ACC),
          },
        },
      ],
    }).compile();

    service = module.get(CashLedgerService);
  });

  /** Stub the five scalar queries, then the page rows. */
  const stub = (
    scalars: unknown[][],
    rows: unknown[] = [],
  ): void => {
    for (const s of scalars) movementRepo.query.mockResolvedValueOnce(s);
    movementRepo.query.mockResolvedValueOnce(rows);
  };

  const pageRowsCall = () =>
    movementRepo.query.mock.calls[movementRepo.query.mock.calls.length - 1] as [
      string,
      unknown[],
    ];

  it('computes running balance from pageOpeningBalance over deposit/withdrawal rows', async () => {
    stub(
      [
        [{ sum: 1000 }], // opening
        [{ sum: 1150 }], // closing
        [{ debit: 200, credit: 50 }], // totals
        [{ total: 2 }], // count
      ],
      [
        row({ id: 'm1', signed: '200' }),
        row({
          id: 'm2',
          type: 'WITHDRAWAL',
          amount: '50',
          signed: '-50',
          created_at: new Date('2026-05-01T09:00:00Z'),
        }),
      ],
    );

    const res = await service.getLedger({ cashAccountId: ACC }, actor);

    expect(res.openingBalance).toBe(1000);
    expect(res.pageOpeningBalance).toBe(1000); // page 1 → no preceding rows
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toMatchObject({ debit: 200, credit: 0, balance: 1200 });
    expect(res.rows[1]).toMatchObject({ debit: 0, credit: 50, balance: 1150 });
    expect(res.pageClosingBalance).toBe(1150);
    expect(res.closingBalance).toBe(1150);
    expect(res.totalDebit).toBe(200);
    expect(res.totalCredit).toBe(50);
    expect(res.total).toBe(2);
    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(50);
    // Movements without a voucher carry no number; the placeholder is a display
    // concern and now lives in the frontend.
    expect(res.rows[0].voucherNumber).toBeNull();
    expect(res.rows[0].kind).toBe('Khác');
  });

  it('signs TRANSFER by direction: +amount when destination, -amount when source', async () => {
    stub(
      [[{ sum: 0 }], [{ sum: 100 }], [{ debit: 300, credit: 200 }], [{ total: 2 }]],
      [
        row({
          id: 't-in',
          type: 'TRANSFER',
          amount: '300',
          cash_account_id: 'other',
          to_account_id: ACC,
          signed: '300', // money received
        }),
        row({
          id: 't-out',
          type: 'TRANSFER',
          amount: '200',
          to_account_id: 'other',
          signed: '-200', // money sent
          created_at: new Date('2026-05-01T09:00:00Z'),
        }),
      ],
    );

    const res = await service.getLedger({ cashAccountId: ACC }, actor);

    expect(res.rows[0]).toMatchObject({ debit: 300, credit: 0, balance: 300 });
    expect(res.rows[1]).toMatchObject({ debit: 0, credit: 200, balance: 100 });
  });

  it('signs a TRANSFER from the queried account perspective via $1', async () => {
    stub([[{ sum: 0 }], [{ sum: 0 }], [{ debit: 0, credit: 0 }], [{ total: 0 }]]);
    await service.getLedger({ cashAccountId: ACC }, actor);

    const [sql, params] = pageRowsCall();
    expect(params[0]).toBe(ACC); // $1 = the account the ledger is for
    expect(sql).toContain("WHEN m.type = 'TRANSFER' AND m.cash_account_id = $1 THEN -m.amount");
    expect(sql).toContain("WHEN m.type = 'TRANSFER' AND m.to_account_id = $1 THEN m.amount");
    // transfers must surface in both the source and destination ledgers
    expect(sql).toContain('(m.cash_account_id = $1 OR m.to_account_id = $1)');
  });

  it('offset paging: page 2 opens from opening + signed sum of preceding rows', async () => {
    stub(
      [
        [{ sum: 0 }], // opening
        [{ sum: 20 }], // closing
        [{ debit: 20, credit: 0 }], // totals
        [{ total: 2 }], // count
        [{ sum: 10 }], // sumSignedBeforeOffset (page-1 row)
      ],
      [
        row({
          id: 'm2',
          amount: '10',
          signed: '10',
          created_at: new Date('2026-05-01T09:00:00Z'),
        }),
      ],
    );

    const res = await service.getLedger(
      { cashAccountId: ACC, page: 2, pageSize: 1 },
      actor,
    );

    expect(res.page).toBe(2);
    expect(res.pageSize).toBe(1);
    expect(res.total).toBe(2);
    expect(res.pageOpeningBalance).toBe(10); // opening(0) + preceding(10)
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ debit: 10, credit: 0, balance: 20 });
    expect(res.pageClosingBalance).toBe(20);
  });

  it('inlines voucher metadata per row (no root id map)', async () => {
    stub(
      [[{ sum: 0 }], [{ sum: 200 }], [{ debit: 200, credit: 0 }], [{ total: 1 }]],
      [
        row({
          receipt_id: 'r-1',
          voucher_number: 'PT-26-00001',
          description: 'Thu bán hàng',
          counterparty: 'Khách A',
          staff: 'Nguyen An',
        }),
      ],
    );

    const res = await service.getLedger({ cashAccountId: ACC }, actor);

    expect(res.rows[0]).toMatchObject({
      voucherId: 'r-1',
      voucherNumber: 'PT-26-00001',
      kind: 'PT',
      description: 'Thu bán hàng',
      partnerName: 'Khách A',
      staffName: 'Nguyen An',
    });
  });

  it('marks a row PC when the movement resolves to a payment', async () => {
    stub(
      [[{ sum: 0 }], [{ sum: 0 }], [{ debit: 0, credit: 50 }], [{ total: 1 }]],
      [
        row({
          type: 'WITHDRAWAL',
          signed: '-50',
          payment_id: 'p-1',
          voucher_number: 'PC-26-00001',
        }),
      ],
    );

    const res = await service.getLedger({ cashAccountId: ACC }, actor);
    expect(res.rows[0]).toMatchObject({ kind: 'PC', voucherId: 'p-1' });
  });

  it('resolves vouchers and staff in SQL, skipping soft-deleted vouchers', async () => {
    stub([[{ sum: 0 }], [{ sum: 0 }], [{ debit: 0, credit: 0 }], [{ total: 0 }]]);
    await service.getLedger({ cashAccountId: ACC }, actor);

    const [sql] = pageRowsCall();
    expect(sql).toContain('LEFT JOIN LATERAL');
    expect(sql).toContain('r.cash_movement_id = m.id AND r.deleted_at IS NULL');
    expect(sql).toContain('p.cash_movement_id = m.id AND p.deleted_at IS NULL');
    // users.organization_id is uuid while cash_movements.organization_id is varchar
    expect(sql).toContain('su.organization_id::text = m.organization_id');
  });

  it('orders ascending so the running balance accumulates forward', async () => {
    stub([[{ sum: 0 }], [{ sum: 0 }], [{ debit: 0, credit: 0 }], [{ total: 0 }]]);
    await service.getLedger({ cashAccountId: ACC }, actor);

    const [sql] = pageRowsCall();
    expect(sql).toContain('ORDER BY created_at ASC, id ASC');
  });

  it('filters on derived columns outside the base query', async () => {
    stub([[{ sum: 0 }], [{ sum: 0 }], [{ debit: 0, credit: 0 }], [{ total: 0 }]]);
    await service.search(
      {
        cashAccountId: ACC,
        description: { operator: StringOperator.CONTAINS, value: 'thu' },
        counterparty: { operator: StringOperator.EQUALS, value: 'Khách A' },
        documentNumber: { operator: StringOperator.STARTS_WITH, value: 'PT' },
        staff: { operator: StringOperator.CONTAINS, value: 'An' },
      },
      actor,
    );

    const [sql, params] = pageRowsCall();
    expect(sql).toContain('FROM (SELECT m.id');
    expect(sql).toContain("COALESCE(description, '') ILIKE");
    expect(sql).toContain("lower(COALESCE(counterparty, '')) = lower(");
    expect(sql).toContain("COALESCE(voucher_number, '') ILIKE");
    expect(sql).toContain("COALESCE(staff, '') ILIKE");
    expect(params).toContain('%thu%');
    expect(params).toContain('Khách A');
    expect(params).toContain('PT%');
  });

  it('escapes wildcards in string filter values', async () => {
    stub([[{ sum: 0 }], [{ sum: 0 }], [{ debit: 0, credit: 0 }], [{ total: 0 }]]);
    await service.search(
      {
        cashAccountId: ACC,
        description: { operator: StringOperator.CONTAINS, value: '50%_off' },
      },
      actor,
    );

    const [, params] = pageRowsCall();
    expect(params).toContain('%50\\%\\_off%');
  });

  it('constrains direction when filtering amountIn / amountOut', async () => {
    stub([[{ sum: 0 }], [{ sum: 0 }], [{ debit: 0, credit: 0 }], [{ total: 0 }]]);
    await service.search(
      {
        cashAccountId: ACC,
        amountIn: { operator: CompareOperator.GTE, value: 100 },
        amountOut: { operator: CompareOperator.LTE, value: 500 },
      },
      actor,
    );

    const [sql, params] = pageRowsCall();
    expect(sql).toMatch(/\(signed > 0 AND signed >= \$\d+\)/);
    expect(sql).toMatch(/\(signed < 0 AND \(-signed\) <= \$\d+\)/);
    expect(params).toContain(100);
    expect(params).toContain(500);
  });

  it('keeps the opening balance free of column filters', async () => {
    stub([[{ sum: 0 }], [{ sum: 0 }], [{ debit: 0, credit: 0 }], [{ total: 0 }]]);
    await service.search(
      {
        cashAccountId: ACC,
        createdAt: { from: '2026-05-01', to: '2026-05-31' },
        description: { operator: StringOperator.CONTAINS, value: 'thu' },
      },
      actor,
    );

    // call 0 = opening: date cutoff only, no derived-column predicate.
    const [openingSql, openingParams] = movementRepo.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(openingSql).toContain('m.created_at < $');
    expect(openingSql).not.toContain('COALESCE(description');
    expect(openingParams).not.toContain('%thu%');

    // the grid totals DO carry the filter, so footer and rows agree.
    const [totalsSql] = movementRepo.query.mock.calls[2] as [string, unknown[]];
    expect(totalsSql).toContain("COALESCE(description, '') ILIKE");
  });

  it('applies the period as an inclusive created_at range', async () => {
    stub([[{ sum: 0 }], [{ sum: 0 }], [{ debit: 0, credit: 0 }], [{ total: 0 }]]);
    await service.search(
      { cashAccountId: ACC, createdAt: { from: '2026-05-01', to: '2026-05-31' } },
      actor,
    );

    const [sql, params] = pageRowsCall();
    expect(sql).toContain('m.created_at >= $');
    expect(sql).toContain("m.created_at < ($");
    expect(sql).toContain("::date + INTERVAL '1 day')");
    expect(params).toContain('2026-05-01');
    expect(params).toContain('2026-05-31');
  });

  it('v2 rejects a cash account outside the actor branch', async () => {
    accountRepo.findOne.mockResolvedValue(null);
    await expect(
      service.search({ cashAccountId: 'other-branch-fund' }, actor),
    ).rejects.toThrow('not found for this branch');
    expect(accountRepo.findOne).toHaveBeenCalledWith({
      where: {
        id: 'other-branch-fund',
        organizationId: 'org-1',
        branchId: 'b-1',
      },
    });
    expect(movementRepo.query).not.toHaveBeenCalled();
  });

  it('v2 adds no branch predicate, so an inbound inter-branch transfer stays visible', async () => {
    // The movement row of an inter-branch transfer carries the SOURCE branch, so
    // filtering on m.branch_id would hide it from the destination's ledger.
    stub([[{ sum: 0 }], [{ sum: 0 }], [{ debit: 0, credit: 0 }], [{ total: 0 }]]);
    await service.search({ cashAccountId: ACC }, actor);

    const [sql] = pageRowsCall();
    expect(sql).not.toContain('m.branch_id');
  });

  it('scopes to the actor organization and the branch override', async () => {
    stub([[{ sum: 0 }], [{ sum: 0 }], [{ debit: 0, credit: 0 }], [{ total: 0 }]]);
    await service.getLedger({ cashAccountId: ACC, branchId: 'b-9' }, actor);

    const [sql, params] = pageRowsCall();
    expect(sql).toContain('m.organization_id = $2');
    expect(params[1]).toBe('org-1');
    expect(params[2]).toBe('b-9');
  });
});
