import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  DepositMovementSource,
  DepositMovementType,
  ReconStatus,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import {
  CompareOperator,
  StringOperator,
} from '../../../../common/filters/filter.dto';
import { DepositMovementEntity } from '../../deposit/deposit-movement.entity';
import { SearchDepositReconV2Handler } from './search-deposit-recon-v2.handler';
import { SearchDepositReconV2Query } from './search-deposit-recon-v2.query';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

const movement = {
  id: 'm-1',
  documentNumber: 'UNC000034',
  type: DepositMovementType.WITHDRAWAL,
  depositAccountId: 'acc-1',
  docDate: '2026-07-19',
  valueDate: null,
  amount: '222000.00',
  feeAmount: '0.00',
  netAmount: '222000.00',
  reconStatus: ReconStatus.CHUA,
  reconciledBy: null,
  reconciledAt: null,
  createdAt: new Date('2026-07-19T13:46:00.000Z'),
  source: DepositMovementSource.MANUAL,
  sourceRefId: null,
};

/**
 * buildQuery() is called three times per execute (rows, totals, stale), so the
 * mock returns a fresh recording builder each time and the assertions inspect
 * whichever call matters.
 */
function makeQb(overrides: Record<string, unknown> = {}) {
  const qb: any = {
    leftJoin: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    offset: jest.fn(() => qb),
    limit: jest.fn(() => qb),
    getRawAndEntities: jest.fn().mockResolvedValue({
      entities: [movement],
      raw: [
        {
          depositAccountName: 'Lam Hoang An',
          depositAccountNo: '199118899',
          reconciledByName: '',
          bankPaymentId: 'bp-1',
          bankReceiptId: null,
        },
      ],
    }),
    getRawOne: jest.fn().mockResolvedValue({ total: '21', totalAmount: '137248600' }),
    getCount: jest.fn().mockResolvedValue(0),
    ...overrides,
  };
  return qb;
}

describe('SearchDepositReconV2Handler', () => {
  let handler: SearchDepositReconV2Handler;
  let builders: ReturnType<typeof makeQb>[];

  beforeEach(async () => {
    builders = [];
    const repo = {
      createQueryBuilder: jest.fn(() => {
        const qb = makeQb();
        builders.push(qb);
        return qb;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchDepositReconV2Handler,
        { provide: getRepositoryToken(DepositMovementEntity), useValue: repo },
      ],
    }).compile();

    handler = module.get(SearchDepositReconV2Handler);
  });

  const run = (dto: Record<string, unknown> = {}) =>
    handler.execute(new SearchDepositReconV2Query(dto, actor));

  /** Every andWhere SQL fragment across every builder built this request. */
  const allClauses = () =>
    builders.flatMap((qb) =>
      (qb.andWhere.mock.calls as unknown[][]).map((c) => String(c[0])),
    );

  it('scopes by organizationId and branchId', async () => {
    await run();

    expect(builders[0].where).toHaveBeenCalledWith('m.organizationId = :org', {
      org: 'org-1',
    });
    expect(builders[0].andWhere).toHaveBeenCalledWith('m.branchId = :branch', {
      branch: 'branch-1',
    });
  });

  it('omits branch scoping when the actor has no branch', async () => {
    await handler.execute(
      new SearchDepositReconV2Query({}, { ...actor, branchId: undefined }),
    );
    expect(allClauses()).not.toContain('m.branchId = :branch');
  });

  it('inlines the account and reconciler onto each row and returns the envelope', async () => {
    const res = await run({ page: 2, limit: 20 });

    expect(builders[0].offset).toHaveBeenCalledWith(20); // (2-1)*20
    expect(builders[0].limit).toHaveBeenCalledWith(20);
    expect(res.data).toEqual([
      {
        id: 'm-1',
        documentNumber: 'UNC000034',
        type: DepositMovementType.WITHDRAWAL,
        depositAccountId: 'acc-1',
        depositAccountName: 'Lam Hoang An',
        depositAccountNo: '199118899',
        docDate: '2026-07-19',
        valueDate: null,
        amount: 222000,
        feeAmount: 0,
        netAmount: 222000,
        reconStatus: ReconStatus.CHUA,
        reconciledBy: null,
        reconciledByName: '',
        reconciledAt: null,
        createdAt: '2026-07-19T13:46:00.000Z',
        source: DepositMovementSource.MANUAL,
        sourceRefId: null,
        bankPaymentId: 'bp-1',
        bankReceiptId: null,
      },
    ]);
    expect(res.total).toBe(21);
    expect(res.totalAmount).toBe(137248600);
    expect(res.page).toBe(2);
    expect(res.limit).toBe(20);
    expect(res.hasStaleUnreconciled).toBe(false);
  });

  it('orders by createdAt DESC with id as the tiebreaker', async () => {
    await run();
    expect(builders[0].orderBy).toHaveBeenCalledWith('m.createdAt', 'DESC');
    expect(builders[0].addOrderBy).toHaveBeenCalledWith('m.id', 'DESC');
  });

  it('sums net_amount over the whole filtered set, not just the page', async () => {
    await run();
    // builders[1] is the totals query: no pagination, aggregate select.
    expect(builders[1].select).toHaveBeenCalledWith('COUNT(*)', 'total');
    expect(builders[1].addSelect).toHaveBeenCalledWith(
      `COALESCE(SUM(m.net_amount), 0)`,
      'totalAmount',
    );
    expect(builders[1].offset).not.toHaveBeenCalled();
    expect(builders[1].limit).not.toHaveBeenCalled();
  });

  it('defaults reconStatus to CHUA when no status filter is supplied', async () => {
    await run();
    expect(allClauses().some((c) => c.startsWith('m.reconStatus ='))).toBe(true);
  });

  it('applies the transaction type filter server-side', async () => {
    await run({ type: { value: DepositMovementType.TRANSFER } });
    expect(allClauses().some((c) => c.startsWith('m.type ='))).toBe(true);
  });

  it('matches the date range on COALESCE(value_date, doc_date) per R2', async () => {
    await run({ docDate: { from: '2026-07-01', to: '2026-07-31' } });
    const clauses = allClauses();
    expect(
      clauses.some((c) => c.includes('COALESCE(m.value_date, m.doc_date) >=')),
    ).toBe(true);
    expect(
      clauses.some((c) => c.includes('COALESCE(m.value_date, m.doc_date) <')),
    ).toBe(true);
  });

  it('filters the account label and the resolved reconciler name', async () => {
    await run({
      accountLabel: { operator: StringOperator.CONTAINS, value: '199118899' },
      reconciledBy: { operator: StringOperator.CONTAINS, value: 'Kenzy' },
    });
    const clauses = allClauses();
    expect(clauses.some((c) => c.includes('a.account_no') && c.includes('ILIKE'))).toBe(true);
    expect(clauses.some((c) => c.includes('u.first_name') && c.includes('ILIKE'))).toBe(true);
  });

  it('applies numeric comparisons on the money columns', async () => {
    await run({
      netAmount: { operator: CompareOperator.GTE, value: 1000 },
      feeAmount: { operator: CompareOperator.EQUALS, value: 0 },
    });
    const clauses = allClauses();
    expect(clauses.some((c) => c.startsWith('m.netAmount >='))).toBe(true);
    expect(clauses.some((c) => c.startsWith('m.feeAmount ='))).toBe(true);
  });

  it('checks staleness against unreconciled rows only', async () => {
    await run({ reconStatus: { value: ReconStatus.DA } });
    // builders[2] is the stale query — forced back to CHUA and date-capped.
    const staleClauses = (builders[2].andWhere.mock.calls as unknown[][]).map((c) =>
      String(c[0]),
    );
    expect(staleClauses).toContain('m.docDate <= :cutoff');
    expect(staleClauses.some((c) => c.startsWith('m.reconStatus ='))).toBe(true);
  });

  it('resolves the linked voucher with scalar subqueries, not joins', async () => {
    // A join on deposit_movement_id (non-unique index) could duplicate a row and
    // inflate the SUM behind the footer total; a scalar subquery cannot.
    await run();
    const selects = (builders[0].addSelect.mock.calls as unknown[][]).map((c) =>
      String(c[0]),
    );
    const paymentSelect = selects.find((sel) => sel.includes('bank_payments'));
    expect(paymentSelect).toContain('SELECT bp.id FROM bank_payments bp');
    expect(paymentSelect).toContain('bp.deleted_at IS NULL');
    expect(paymentSelect).toContain('LIMIT 1');
    expect(builders[0].leftJoin).not.toHaveBeenCalledWith(
      expect.anything(),
      'bp',
      expect.anything(),
    );
  });

  it('keeps the linked-document selects off the totals query', async () => {
    await run();
    const totalsSelects = (builders[1].addSelect.mock.calls as unknown[][]).map((c) =>
      String(c[0]),
    );
    expect(totalsSelects.some((sel) => sel.includes('bank_payments'))).toBe(false);
    expect(totalsSelects.some((sel) => sel.includes('bank_receipts'))).toBe(false);
  });
});
