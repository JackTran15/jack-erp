import { BadRequestException } from '@nestjs/common';
import { CustomerDebtsReport } from './customer-debts.report';

const ORG = 'org-1';
const actor = { userId: 'u1', organizationId: ORG, branchId: 'b1', roles: [] } as any;

function makeReport(opts: {
  posLedger?: any[];
  arLedger?: any[];
  customers?: any[];
  groups?: any[];
  cards?: any[];
}) {
  const debtPeriod: any = {
    getPeriodLedger: jest
      .fn()
      .mockResolvedValueOnce(opts.posLedger ?? [])
      .mockResolvedValueOnce(opts.arLedger ?? []),
  };
  const customersRepo: any = { find: jest.fn(async () => opts.customers ?? []) };
  const customerGroupsRepo: any = { find: jest.fn(async () => opts.groups ?? []) };
  const cardsRepo: any = { find: jest.fn(async () => opts.cards ?? []) };
  const noop: any = {};

  return new CustomerDebtsReport(
    debtPeriod,
    noop,
    noop,
    noop,
    noop,
    customersRepo,
    customerGroupsRepo,
    cardsRepo,
  );
}

const period = { from: '2026-07-01', to: '2026-07-31' };

describe('CustomerDebtsReport.buildData', () => {
  it('throws when the period filter is missing', async () => {
    const report = makeReport({});
    await expect(
      report.buildData(
        { reportType: 'customer-debts', columns: ['customerCode'], filters: {} } as any,
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('merges the POS debt ledger and the accounting receivables ledger for the same customer', async () => {
    const report = makeReport({
      posLedger: [{ partyId: 'c1', opening: 100000, increase: 50000, decrease: 20000 }],
      arLedger: [{ partyId: 'c1', opening: 30000, increase: 10000, decrease: 5000 }],
      customers: [
        { id: 'c1', code: 'KH001', name: 'Nguyen Van A', groupId: null, phone: '090', email: 'a@x.com', address: 'HN' },
      ],
    });

    const result = await report.buildData(
      {
        reportType: 'customer-debts',
        columns: ['customerCode', 'customerName', 'debtOpening', 'debtIncrease', 'debtDecrease', 'debtClosing'],
        filters: { period },
      } as any,
      actor,
    );

    expect(result.total).toBe(1);
    expect(result.rows[0]).toMatchObject({
      customerCode: 'KH001',
      customerName: 'Nguyen Van A',
      debtOpening: 130000, // 100000 + 30000
      debtIncrease: 60000, // 50000 + 10000
      debtDecrease: 25000, // 20000 + 5000
      debtClosing: 165000, // 130000 + 60000 - 25000
    });
    expect(result.totals).toMatchObject({ debtClosing: 165000 });
  });

  it('resolves customer group name and membership card fields', async () => {
    const report = makeReport({
      posLedger: [{ partyId: 'c1', opening: 0, increase: 0, decrease: 0 }],
      customers: [{ id: 'c1', code: 'KH001', name: 'A', groupId: 'g1', phone: null, email: null, address: null }],
      groups: [{ id: 'g1', name: 'VIP' }],
      cards: [{ customerId: 'c1', cardNumber: 'TV001', tier: 'gold' }],
    });

    const result = await report.buildData(
      {
        reportType: 'customer-debts',
        columns: ['customerGroup', 'membershipCardNumber', 'membershipTier'],
        filters: { period },
      } as any,
      actor,
    );

    expect(result.rows[0]).toEqual({
      customerGroup: 'VIP',
      membershipCardNumber: 'TV001',
      membershipTier: 'gold',
    });
  });

  it('excludes customers filtered out by customerGroupId (applied at the DB query, not post-filter)', async () => {
    const report = makeReport({
      posLedger: [
        { partyId: 'c1', opening: 0, increase: 10, decrease: 0 },
        { partyId: 'c2', opening: 0, increase: 20, decrease: 0 },
      ],
      // Simulates the repo already scoping by groupId — only c1 comes back.
      customers: [{ id: 'c1', code: 'KH001', name: 'A', groupId: 'g1' }],
    });

    const result = await report.buildData(
      {
        reportType: 'customer-debts',
        columns: ['customerCode'],
        filters: { period, customerGroupId: 'g1' },
      } as any,
      actor,
    );

    expect(result.total).toBe(1);
    expect(result.rows[0].customerCode).toBe('KH001');
  });

  it('returns an empty result when no ledger rows exist for the period', async () => {
    const report = makeReport({});
    const result = await report.buildData(
      { reportType: 'customer-debts', columns: ['customerCode'], filters: { period } } as any,
      actor,
    );
    expect(result).toEqual({ rows: [], totals: null, total: 0 });
  });
});
