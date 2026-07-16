import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DepositLedgerService } from './deposit-ledger.service';
import { DepositBalanceService } from './deposit-balance.service';
import { DepositAccountEntity } from '../deposit-account.entity';
import { DepositMovementEntity } from '../deposit-movement.entity';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actor = {
  userId: 'u1',
  organizationId: 'org1',
  branchId: 'br1',
  roles: [],
} as ActorContext;

interface MockSums {
  opening: number;
  totalIn: number;
  totalOut: number;
  count: number;
  beforeOffset: number;
  rows: Array<Record<string, unknown>>;
}

function buildService(sums: MockSums) {
  const query = jest.fn((sql: string) => {
    if (sql.includes('SELECT m.id, m.deposit_account_id')) return Promise.resolve(sums.rows);
    if (sql.includes('SUM(sub.s)')) return Promise.resolve([{ sum: sums.beforeOffset }]);
    if (sql.includes('AS "in"')) return Promise.resolve([{ in: sums.totalIn, out: sums.totalOut }]);
    if (sql.includes('COUNT(*)')) return Promise.resolve([{ total: sums.count }]);
    return Promise.resolve([{ sum: sums.opening }]);
  });
  const accountRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: 'acc1',
      accountNo: '0011',
      openingBalance: 1000,
    } as DepositAccountEntity),
  };
  const balanceService = {
    getBalances: jest.fn().mockResolvedValue({
      bookBalance: 0,
      availableBalance: 0,
      pendingClearingAmount: 0,
    }),
  };
  const service = new DepositLedgerService(
    { query } as unknown as Repository<DepositMovementEntity>,
    accountRepo as unknown as Repository<DepositAccountEntity>,
    balanceService as unknown as DepositBalanceService,
  );
  return { service, accountRepo, balanceService };
}

describe('DepositLedgerService.getLedger', () => {
  const q = { depositAccountId: 'acc1', dateFrom: '2026-05-01', dateTo: '2026-05-31' };

  it('opening = account opening_balance + signed sum before dateFrom; running continues from it (UAT-12)', async () => {
    const { service } = buildService({
      opening: 500,
      totalIn: 200,
      totalOut: 0,
      count: 1,
      beforeOffset: 0,
      rows: [{ id: 'm1', deposit_account_id: 'acc1', to_account_id: null, type: 'DEPOSIT', amount: '200', doc_date: '2026-05-10', document_number: 'HD1', recon_status: 'CHUA' }],
    });
    const res = await service.getLedger(q, actor);
    expect(res.openingBalance).toBe('1500'); // 1000 + 500
    expect(res.rows[0].runningBalance).toBe('1700'); // 1500 + 200
    expect(res.closingBalance).toBe('1700'); // 1500 + 200 - 0
    expect(res.rows[0].amountIn).toBe('200');
  });

  it('does not miss a transfer received via to_account_id (+amountIn)', async () => {
    const { service } = buildService({
      opening: 0,
      totalIn: 300,
      totalOut: 0,
      count: 1,
      beforeOffset: 0,
      rows: [{ id: 'm2', deposit_account_id: 'other', to_account_id: 'acc1', type: 'TRANSFER', amount: '300', doc_date: '2026-05-05', document_number: null, recon_status: 'CHUA' }],
    });
    const res = await service.getLedger(q, actor);
    expect(res.rows[0].amountIn).toBe('300');
    expect(res.rows[0].amountOut).toBe('0');
    expect(res.rows[0].runningBalance).toBe('1300'); // 1000 opening + 300
  });

  it('page 2 running continues from opening + signed sum before the offset', async () => {
    const { service } = buildService({
      opening: 0,
      totalIn: 0,
      totalOut: 100,
      count: 3,
      beforeOffset: -50, // one earlier withdrawal of 50
      rows: [{ id: 'm3', deposit_account_id: 'acc1', to_account_id: null, type: 'WITHDRAWAL', amount: '100', doc_date: '2026-05-20', document_number: 'UNC1', recon_status: 'CHUA' }],
    });
    const res = await service.getLedger({ ...q, page: 2, pageSize: 1 }, actor);
    // page opening = 1000 + 0 + (-50) = 950; then -100 → 850
    expect(res.rows[0].runningBalance).toBe('850');
    expect(res.total).toBe(3); // count of real movements, opening row excluded
  });

  it('R2 (TKT-DFR-04): response exposes book/available balance and per-row valueDate/isCleared', async () => {
    const { service, balanceService } = buildService({
      opening: 0,
      totalIn: 200,
      totalOut: 0,
      count: 1,
      beforeOffset: 0,
      rows: [
        {
          id: 'm4',
          deposit_account_id: 'acc1',
          to_account_id: null,
          type: 'DEPOSIT',
          amount: '200',
          doc_date: '2026-05-10',
          document_number: 'HD1',
          recon_status: 'CHUA',
          value_date: '2099-01-01', // far future — not yet cleared
        },
      ],
    });
    balanceService.getBalances.mockResolvedValueOnce({
      bookBalance: 1200,
      availableBalance: 1000,
      pendingClearingAmount: 200,
    });

    const res = await service.getLedger(q, actor);

    expect(res.bookBalance).toBe('1200');
    expect(res.availableBalance).toBe('1000');
    expect(res.pendingClearingAmount).toBe('200');
    expect(res.rows[0].valueDate).toBe('2099-01-01');
    expect(res.rows[0].isCleared).toBe(false);
  });

  it('throws when the account is not in the actor branch (BR-PERM-01)', async () => {
    const { service, accountRepo } = buildService({
      opening: 0,
      totalIn: 0,
      totalOut: 0,
      count: 0,
      beforeOffset: 0,
      rows: [],
    });
    accountRepo.findOne.mockResolvedValue(null);
    await expect(service.getLedger(q, actor)).rejects.toBeInstanceOf(NotFoundException);
  });
});
