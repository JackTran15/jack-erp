import { BadRequestException } from '@nestjs/common';
import { SupplierDebtsReport } from './supplier-debts.report';

const ORG = 'org-1';
const actor = { userId: 'u1', organizationId: ORG, branchId: 'b1', roles: [] } as any;
const period = { from: '2026-01-01', to: '2026-12-31' };

function makeReport(opts: { ledger?: any[]; providers?: any[] }) {
  const debtPeriod: any = { getPeriodLedger: jest.fn(async () => opts.ledger ?? []) };
  const providersRepo: any = { find: jest.fn(async () => opts.providers ?? []) };
  const noop: any = {};
  return { report: new SupplierDebtsReport(debtPeriod, noop, noop, providersRepo), debtPeriod };
}

describe('SupplierDebtsReport.buildData', () => {
  it('throws when the period filter is missing', async () => {
    const { report } = makeReport({});
    await expect(
      report.buildData(
        { reportType: 'supplier-debts', columns: ['supplierCode'], filters: {} } as any,
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('reproduces the confirmed mockup numbers: 1 supplier, all increase in the selected branch, no prior debt', async () => {
    const { report, debtPeriod } = makeReport({
      ledger: [{ partyId: 's1', opening: 0, increase: 39200000, decrease: 0 }],
      providers: [{ id: 's1', code: 'ABA', name: 'AN BA' }],
    });

    const result = await report.buildData(
      {
        reportType: 'supplier-debts',
        columns: ['supplierCode', 'supplierName', 'debtOpening', 'debtIncrease', 'debtDecrease', 'debtClosing'],
        filters: { period, branchId: 'br-danang' },
      } as any,
      actor,
    );

    expect(debtPeriod.getPeriodLedger).toHaveBeenCalledWith(
      expect.objectContaining({ partyIdExpr: 't.supplierId' }),
      expect.objectContaining({ partyIdExpr: 'debt.supplierId' }),
      expect.objectContaining({ branchIds: ['br-danang'] }),
    );
    expect(result.total).toBe(1);
    expect(result.rows[0]).toEqual({
      supplierCode: 'ABA',
      supplierName: 'AN BA',
      debtOpening: 0,
      debtIncrease: 39200000,
      debtDecrease: 0,
      debtClosing: 39200000,
    });
  });

  it('does not narrow by branch when no branchId filter is given (chain/org-wide default)', async () => {
    const { report, debtPeriod } = makeReport({
      ledger: [{ partyId: 's1', opening: 0, increase: 1000, decrease: 0 }],
      providers: [{ id: 's1', code: 'S1', name: 'Supplier 1' }],
    });

    await report.buildData(
      { reportType: 'supplier-debts', columns: ['supplierCode'], filters: { period } } as any,
      actor,
    );

    expect(debtPeriod.getPeriodLedger).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ branchIds: undefined }),
    );
  });

  it('returns an empty result when the ledger has no rows', async () => {
    const { report } = makeReport({});
    const result = await report.buildData(
      { reportType: 'supplier-debts', columns: ['supplierCode'], filters: { period } } as any,
      actor,
    );
    expect(result).toEqual({ rows: [], totals: null, total: 0 });
  });
});
