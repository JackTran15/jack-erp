import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DepositLedgerService } from './deposit-ledger.service';
import { DepositBalanceService } from './deposit-balance.service';
import { DepositAccountEntity } from '../deposit-account.entity';
import { DepositMovementEntity } from '../deposit-movement.entity';
import { BankReceiptEntity } from '../../deposit-vouchers/bank-receipts/bank-receipt.entity';
import { BankPaymentEntity } from '../../deposit-vouchers/bank-payments/bank-payment.entity';
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

const ZERO_SUMS: MockSums = {
  opening: 0,
  totalIn: 0,
  totalOut: 0,
  count: 0,
  beforeOffset: 0,
  rows: [],
};

function buildService(
  sums: MockSums,
  opts: {
    findOneResult?: Partial<DepositAccountEntity> | null;
    findResult?: Array<Partial<DepositAccountEntity>>;
    balances?: Record<
      string,
      { bookBalance: number; availableBalance: number; pendingClearingAmount: number }
    >;
    receipts?: Array<{ id: string; depositMovementId: string }>;
    payments?: Array<{ id: string; depositMovementId: string }>;
  } = {},
) {
  const query = jest.fn((sql: string) => {
    if (sql.includes('SELECT id, ledger_account_id')) return Promise.resolve(sums.rows);
    if (sql.includes('sub.s')) return Promise.resolve([{ sum: sums.beforeOffset }]);
    if (sql.includes('AS "in"')) return Promise.resolve([{ in: sums.totalIn, out: sums.totalOut }]);
    if (sql.includes('COUNT(*)')) return Promise.resolve([{ total: sums.count }]);
    return Promise.resolve([{ sum: sums.opening }]);
  });
  const accountRepo = {
    findOne: jest.fn().mockResolvedValue(
      opts.findOneResult === undefined
        ? ({ id: 'acc1', accountNo: '0011', openingBalance: 1000 } as DepositAccountEntity)
        : opts.findOneResult,
    ),
    find: jest.fn().mockResolvedValue(opts.findResult ?? []),
  };
  const defaultBalances = { bookBalance: 0, availableBalance: 0, pendingClearingAmount: 0 };
  const balanceService = {
    getBalances: jest.fn((id: string) =>
      Promise.resolve(opts.balances?.[id] ?? defaultBalances),
    ),
  };
  const bankReceiptRepo = {
    find: jest.fn().mockResolvedValue(opts.receipts ?? []),
  };
  const bankPaymentRepo = {
    find: jest.fn().mockResolvedValue(opts.payments ?? []),
  };
  const service = new DepositLedgerService(
    { query } as unknown as Repository<DepositMovementEntity>,
    accountRepo as unknown as Repository<DepositAccountEntity>,
    bankReceiptRepo as unknown as Repository<BankReceiptEntity>,
    bankPaymentRepo as unknown as Repository<BankPaymentEntity>,
    balanceService as unknown as DepositBalanceService,
  );
  return { service, accountRepo, balanceService, bankReceiptRepo, bankPaymentRepo, query };
}

describe('DepositLedgerService.getLedger — single account (BR-LEDG-03 regression)', () => {
  const q = { depositAccountId: 'acc1', dateFrom: '2026-05-01', dateTo: '2026-05-31' };

  it('opening = account opening_balance + signed sum before dateFrom; running continues from it (UAT-12)', async () => {
    const { service, accountRepo } = buildService({
      opening: 500,
      totalIn: 200,
      totalOut: 0,
      count: 1,
      beforeOffset: 0,
      rows: [
        {
          id: 'm1',
          ledger_account_id: 'acc1',
          type: 'DEPOSIT',
          amount: '200',
          doc_date: '2026-05-10',
          document_number: 'HD1',
          recon_status: 'CHUA',
          signed: '200',
        },
      ],
    });
    const res = await service.getLedger(q, actor);
    expect(res.openingBalance).toBe('1500'); // 1000 + 500
    expect(res.rows[0].runningBalance).toBe('1700'); // 1500 + 200
    expect(res.closingBalance).toBe('1700'); // 1500 + 200 - 0
    expect(res.rows[0].amountIn).toBe('200');
    expect(res.rows[0].depositAccountNo).toBe('0011');
    // Explicit id → the single-account path, never the "all accounts" query.
    expect(accountRepo.find).not.toHaveBeenCalled();
  });

  it('derives receiptNo/paymentNo from document_number by sign, and joins receiptId/paymentId by depositMovementId', async () => {
    const { service, bankReceiptRepo, bankPaymentRepo } = buildService(
      {
        opening: 0,
        totalIn: 200,
        totalOut: 100,
        count: 2,
        beforeOffset: 0,
        rows: [
          {
            id: 'm-in',
            ledger_account_id: 'acc1',
            type: 'DEPOSIT',
            amount: '200',
            doc_date: '2026-05-10',
            document_number: 'PT000001',
            recon_status: 'CHUA',
            signed: '200',
          },
          {
            id: 'm-out',
            ledger_account_id: 'acc1',
            type: 'WITHDRAWAL',
            amount: '100',
            doc_date: '2026-05-11',
            document_number: 'UNC000001',
            recon_status: 'CHUA',
            signed: '-100',
          },
        ],
      },
      {
        receipts: [{ id: 'receipt-1', depositMovementId: 'm-in' }],
        payments: [{ id: 'payment-1', depositMovementId: 'm-out' }],
      },
    );

    const res = await service.getLedger(q, actor);

    expect(res.rows[0]).toMatchObject({
      receiptNo: 'PT000001',
      paymentNo: null,
      receiptId: 'receipt-1',
      paymentId: null,
    });
    expect(res.rows[1]).toMatchObject({
      receiptNo: null,
      paymentNo: 'UNC000001',
      receiptId: null,
      paymentId: 'payment-1',
    });
    expect(bankReceiptRepo.find).toHaveBeenCalledTimes(1);
    expect(bankPaymentRepo.find).toHaveBeenCalledTimes(1);
  });

  it('skips the bank_receipts/bank_payments lookup entirely when a page has no rows', async () => {
    const { service, bankReceiptRepo, bankPaymentRepo } = buildService({
      opening: 0,
      totalIn: 0,
      totalOut: 0,
      count: 0,
      beforeOffset: 0,
      rows: [],
    });

    await service.getLedger(q, actor);

    expect(bankReceiptRepo.find).not.toHaveBeenCalled();
    expect(bankPaymentRepo.find).not.toHaveBeenCalled();
  });

  it('does not miss a transfer received via to_account_id (+amountIn)', async () => {
    const { service } = buildService({
      opening: 0,
      totalIn: 300,
      totalOut: 0,
      count: 1,
      beforeOffset: 0,
      rows: [
        {
          id: 'm2',
          ledger_account_id: 'acc1',
          type: 'TRANSFER',
          amount: '300',
          doc_date: '2026-05-05',
          document_number: null,
          recon_status: 'CHUA',
          signed: '300',
        },
      ],
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
      rows: [
        {
          id: 'm3',
          ledger_account_id: 'acc1',
          type: 'WITHDRAWAL',
          amount: '100',
          doc_date: '2026-05-20',
          document_number: 'UNC1',
          recon_status: 'CHUA',
          signed: '-100',
        },
      ],
    });
    const res = await service.getLedger({ ...q, page: 2, pageSize: 1 }, actor);
    // page opening = 1000 + 0 + (-50) = 950; then -100 → 850
    expect(res.rows[0].runningBalance).toBe('850');
    expect(res.total).toBe(3); // count of real movements, opening row excluded
  });

  it('R2 (TKT-DFR-04): response exposes book/available balance and per-row valueDate/isCleared', async () => {
    const { service } = buildService(
      {
        opening: 0,
        totalIn: 200,
        totalOut: 0,
        count: 1,
        beforeOffset: 0,
        rows: [
          {
            id: 'm4',
            ledger_account_id: 'acc1',
            type: 'DEPOSIT',
            amount: '200',
            doc_date: '2026-05-10',
            document_number: 'HD1',
            recon_status: 'CHUA',
            value_date: '2099-01-01', // far future — not yet cleared
            signed: '200',
          },
        ],
      },
      { balances: { acc1: { bookBalance: 1200, availableBalance: 1000, pendingClearingAmount: 200 } } },
    );

    const res = await service.getLedger(q, actor);

    expect(res.bookBalance).toBe('1200');
    expect(res.availableBalance).toBe('1000');
    expect(res.pendingClearingAmount).toBe('200');
    expect(res.rows[0].valueDate).toBe('2099-01-01');
    expect(res.rows[0].isCleared).toBe(false);
  });

  it('throws when the account is not in the actor branch (BR-PERM-01)', async () => {
    const { service } = buildService(ZERO_SUMS, { findOneResult: null });
    await expect(service.getLedger(q, actor)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('DepositLedgerService.getLedger — all accounts of the branch (BR-LEDG-04)', () => {
  const q = { dateFrom: '2026-05-01', dateTo: '2026-05-31' };

  it('omitting depositAccountId queries every ACTIVE account of the branch, not one', async () => {
    const { service, accountRepo } = buildService(ZERO_SUMS, {
      findResult: [
        { id: 'acc1', accountNo: '0011', openingBalance: 1000 },
        { id: 'acc2', accountNo: '0022', openingBalance: 500 },
      ],
    });
    const res = await service.getLedger(q, actor);
    expect(accountRepo.findOne).not.toHaveBeenCalled();
    expect(accountRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org1', branchId: 'br1' }),
      }),
    );
    expect(res.openingBalance).toBe('1500'); // 1000 + 500, no movements yet
  });

  it('empty branch (no deposit accounts) short-circuits without querying movements', async () => {
    const { service, query } = buildService(ZERO_SUMS, { findResult: [] });
    const res = await service.getLedger(q, actor);
    expect(res).toEqual(
      expect.objectContaining({ openingBalance: '0', rows: [], total: 0, closingBalance: '0' }),
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('an internal transfer between two in-scope accounts renders as two rows that net to zero', async () => {
    const { service } = buildService(
      {
        opening: 0,
        totalIn: 200, // dest leg contributes +200
        totalOut: 200, // source leg contributes -200
        count: 2,
        beforeOffset: 0,
        rows: [
          {
            id: 'm5',
            ledger_account_id: 'acc1',
            type: 'TRANSFER',
            amount: '200',
            doc_date: '2026-05-12',
            document_number: 'CQ1',
            recon_status: 'CHUA',
            signed: '-200',
          },
          {
            id: 'm5',
            ledger_account_id: 'acc2',
            type: 'TRANSFER',
            amount: '200',
            doc_date: '2026-05-12',
            document_number: 'CQ1',
            recon_status: 'CHUA',
            signed: '200',
          },
        ],
      },
      {
        findResult: [
          { id: 'acc1', accountNo: '0011', openingBalance: 1000 },
          { id: 'acc2', accountNo: '0022', openingBalance: 500 },
        ],
      },
    );
    const res = await service.getLedger(q, actor);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].depositAccountNo).toBe('0011');
    expect(res.rows[0].amountOut).toBe('200');
    expect(res.rows[1].depositAccountNo).toBe('0022');
    expect(res.rows[1].amountIn).toBe('200');
    // opening 1500 -200 +200 = 1500 — internal transfer must not move the branch-wide closing balance.
    expect(res.closingBalance).toBe('1500');
  });

  it('a transfer with only one leg in scope (e.g. inter-branch) renders as a single row', async () => {
    const { service } = buildService(
      {
        opening: 0,
        totalIn: 0,
        totalOut: 200,
        count: 1,
        beforeOffset: 0,
        rows: [
          {
            id: 'm6',
            ledger_account_id: 'acc1',
            type: 'TRANSFER',
            amount: '200',
            doc_date: '2026-05-12',
            document_number: 'CQ2',
            recon_status: 'CHUA',
            signed: '-200',
          },
        ],
      },
      { findResult: [{ id: 'acc1', accountNo: '0011', openingBalance: 1000 }] },
    );
    const res = await service.getLedger(q, actor);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].amountOut).toBe('200');
    expect(res.closingBalance).toBe('800'); // opening 1000 (acc1 only) - 200
  });

  it('book/available balance is the sum of each scoped account’s own balance', async () => {
    const { service } = buildService(
      ZERO_SUMS,
      {
        findResult: [
          { id: 'acc1', accountNo: '0011', openingBalance: 0 },
          { id: 'acc2', accountNo: '0022', openingBalance: 0 },
        ],
        balances: {
          acc1: { bookBalance: 1000, availableBalance: 900, pendingClearingAmount: 100 },
          acc2: { bookBalance: 500, availableBalance: 500, pendingClearingAmount: 0 },
        },
      },
    );
    const res = await service.getLedger(q, actor);
    expect(res.bookBalance).toBe('1500');
    expect(res.availableBalance).toBe('1400');
    expect(res.pendingClearingAmount).toBe('100');
  });
});
