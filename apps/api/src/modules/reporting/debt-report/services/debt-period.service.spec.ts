import {
  closeLedger,
  DebtPeriodService,
  mergeLedgerDeltas,
  mergeLedgerSides,
  PartyLedgerDelta,
} from './debt-period.service';

const ORG = 'org-1';

function makeRepo(rawRows: Array<{ partyId: string; opening: string; period: string }>) {
  const qb: any = {
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    groupBy: jest.fn(() => qb),
    setParameters: jest.fn(() => qb),
    innerJoin: jest.fn(() => qb),
    getRawMany: jest.fn(async () => rawRows),
  };
  return { createQueryBuilder: jest.fn(() => qb), __qb: qb } as any;
}

describe('DebtPeriodService.getPeriodLedger', () => {
  it('merges increase-side and decrease-side aggregates per party', async () => {
    const service = new DebtPeriodService();
    const increaseRepo = makeRepo([
      { partyId: 'p1', opening: '100000', period: '50000' },
      { partyId: 'p2', opening: '0', period: '20000' },
    ]);
    const decreaseRepo = makeRepo([
      { partyId: 'p1', opening: '30000', period: '10000' },
    ]);

    const rows = await service.getPeriodLedger(
      { repo: increaseRepo, partyIdExpr: 't.customerId', amountExpr: 't.originalAmount', dateExpr: 't.issuedAt' },
      // Decrease side has no customerId of its own — reached via a join, like debt_payments -> invoice_debts.
      {
        repo: decreaseRepo,
        partyIdExpr: 'debt.customerId',
        amountExpr: 't.amount',
        dateExpr: 't.paidAt',
        join: (qb) => qb.innerJoin('invoice_debts', 'debt', 'debt.id = t.debtId'),
      },
      { organizationId: ORG, fromDate: '2026-07-01', toDate: '2026-07-31' },
    );

    const p1 = rows.find((r) => r.partyId === 'p1')!;
    expect(p1.opening).toBe(70000); // 100000 - 30000
    expect(p1.increase).toBe(50000);
    expect(p1.decrease).toBe(10000);

    const p2 = rows.find((r) => r.partyId === 'p2')!;
    expect(p2.opening).toBe(0);
    expect(p2.increase).toBe(20000);
    expect(p2.decrease).toBe(0); // no decrease-side row for p2

    expect(decreaseRepo.__qb.innerJoin).toHaveBeenCalledWith('invoice_debts', 'debt', 'debt.id = t.debtId');
    expect(increaseRepo.__qb.andWhere).not.toHaveBeenCalled(); // no branchIds passed
  });

  it('applies branch narrowing when branchIds + branchIdExpr are both present', async () => {
    const service = new DebtPeriodService();
    const increaseRepo = makeRepo([{ partyId: 'p1', opening: '0', period: '39200000' }]);
    const decreaseRepo = makeRepo([]);

    await service.getPeriodLedger(
      { repo: increaseRepo, partyIdExpr: 't.supplierId', amountExpr: 't.originalAmount', dateExpr: 't.issuedAt', branchIdExpr: 't.branchId' },
      { repo: decreaseRepo, partyIdExpr: 'debt.supplierId', amountExpr: 't.amount', dateExpr: 't.paidAt' },
      { organizationId: ORG, branchIds: ['b1'], fromDate: '2026-01-01', toDate: '2026-12-31' },
    );

    expect(increaseRepo.__qb.andWhere).toHaveBeenCalledWith(
      't.branchId IN (:...branchIds)',
      { branchIds: ['b1'] },
    );
  });

  it('applies an extra filter hook after the base where (e.g. excluding DRAFT/VOIDED receivables)', async () => {
    const service = new DebtPeriodService();
    const increaseRepo = makeRepo([{ partyId: 'p1', opening: '0', period: '1000' }]);
    const decreaseRepo = makeRepo([]);
    const filter = jest.fn((qb) => qb.andWhere('t.status NOT IN (:...excluded)', { excluded: ['DRAFT', 'VOIDED'] }));

    await service.getPeriodLedger(
      { repo: increaseRepo, partyIdExpr: 't.customerId', amountExpr: 't.amount', dateExpr: 't.postedAt', filter },
      { repo: decreaseRepo, partyIdExpr: 'rec.customerId', amountExpr: 't.amount', dateExpr: 't.settlementDate' },
      { organizationId: ORG, fromDate: '2026-07-01', toDate: '2026-07-31' },
    );

    expect(filter).toHaveBeenCalledWith(increaseRepo.__qb);
    expect(increaseRepo.__qb.andWhere).toHaveBeenCalledWith('t.status NOT IN (:...excluded)', {
      excluded: ['DRAFT', 'VOIDED'],
    });
  });

  it('drops rows with a null party id (e.g. orphaned payment row)', async () => {
    const service = new DebtPeriodService();
    const increaseRepo = makeRepo([{ partyId: null as any, opening: '0', period: '5000' }]);
    const decreaseRepo = makeRepo([]);

    const rows = await service.getPeriodLedger(
      { repo: increaseRepo, partyIdExpr: 't.customerId', amountExpr: 't.originalAmount', dateExpr: 't.issuedAt' },
      { repo: decreaseRepo, partyIdExpr: 'debt.customerId', amountExpr: 't.amount', dateExpr: 't.paidAt' },
      { organizationId: ORG, fromDate: '2026-07-01', toDate: '2026-07-31' },
    );
    expect(rows).toHaveLength(0);
  });
});

describe('mergeLedgerSides', () => {
  it('produces one entry per party id even when only one side has data', () => {
    const rows = mergeLedgerSides(
      new Map([['p1', { opening: 10, period: 5 }]]),
      new Map([['p2', { opening: 0, period: 3 }]]),
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.partyId === 'p1')).toMatchObject({ opening: 10, increase: 5, decrease: 0 });
    expect(rows.find((r) => r.partyId === 'p2')).toMatchObject({ opening: 0, increase: 0, decrease: 3 });
  });
});

describe('mergeLedgerDeltas', () => {
  it('sums opening/increase/decrease across multiple sources for the customer-debts merge (POS + accounting)', () => {
    const posLedger: PartyLedgerDelta[] = [
      { partyId: 'c1', opening: 100, increase: 50, decrease: 20 },
    ];
    const arLedger: PartyLedgerDelta[] = [
      { partyId: 'c1', opening: 30, increase: 10, decrease: 5 },
      { partyId: 'c2', opening: 0, increase: 40, decrease: 0 },
    ];

    const merged = mergeLedgerDeltas([posLedger, arLedger]);
    expect(merged.find((r) => r.partyId === 'c1')).toEqual({
      partyId: 'c1',
      opening: 130,
      increase: 60,
      decrease: 25,
    });
    expect(merged.find((r) => r.partyId === 'c2')).toEqual({
      partyId: 'c2',
      opening: 0,
      increase: 40,
      decrease: 0,
    });
  });

  it('keeps consecutive periods consistent: period 2 opening should equal period 1 closing when driven by the same cumulative source', () => {
    // Period 1: [Jan 1, Jan 31] — Period 2: [Feb 1, Feb 28], same underlying data source.
    const period1: PartyLedgerDelta[] = [{ partyId: 'c1', opening: 0, increase: 100, decrease: 30 }];
    const period1Closing = closeLedger(period1[0]).closing; // 70

    // Period 2's "opening" is defined as everything strictly before Feb 1, which by
    // construction equals period 1's closing when there is no gap in the data.
    const period2: PartyLedgerDelta[] = [{ partyId: 'c1', opening: period1Closing, increase: 20, decrease: 10 }];
    const period2Row = closeLedger(period2[0]);

    expect(period2Row.opening).toBe(70);
    expect(period2Row.closing).toBe(80); // 70 + 20 - 10
  });
});

describe('closeLedger', () => {
  it('computes closing = opening + increase - decrease', () => {
    expect(closeLedger({ partyId: 'p1', opening: 10, increase: 5, decrease: 2 }).closing).toBe(13);
  });
});
