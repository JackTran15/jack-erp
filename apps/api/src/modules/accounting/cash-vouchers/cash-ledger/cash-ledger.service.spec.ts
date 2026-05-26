import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CashLedgerService } from './cash-ledger.service';
import { CashFundResolverService } from '../../cash/cash-fund-resolver.service';
import { CashMovementEntity } from '../../cash/cash-movement.entity';
import { CashReceiptEntity } from '../cash-receipts/cash-receipt.entity';
import { CashPaymentEntity } from '../cash-payments/cash-payment.entity';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'u-1',
  organizationId: 'org-1',
  branchId: 'b-1',
  roles: [],
};
const ACC = 'acc-1';

// getLedger issues scalar queries in this order:
//   1) opening   2) closing   3) totals   4) count
//   5) sumSignedBeforeOffset (ONLY when offset > 0)   then page rows.
describe('CashLedgerService', () => {
  let service: CashLedgerService;
  let movementRepo: { query: jest.Mock };
  let receiptRepo: { find: jest.Mock };
  let paymentRepo: { find: jest.Mock };

  beforeEach(async () => {
    movementRepo = { query: jest.fn() };
    receiptRepo = { find: jest.fn().mockResolvedValue([]) };
    paymentRepo = { find: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashLedgerService,
        { provide: getRepositoryToken(CashMovementEntity), useValue: movementRepo },
        { provide: getRepositoryToken(CashReceiptEntity), useValue: receiptRepo },
        { provide: getRepositoryToken(CashPaymentEntity), useValue: paymentRepo },
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

  it('computes running balance from pageOpeningBalance over deposit/withdrawal rows', async () => {
    movementRepo.query
      .mockResolvedValueOnce([{ sum: 1000 }]) // opening
      .mockResolvedValueOnce([{ sum: 1150 }]) // closing
      .mockResolvedValueOnce([{ debit: 200, credit: 50 }]) // totals
      .mockResolvedValueOnce([{ total: 2 }]) // count
      .mockResolvedValueOnce([
        {
          id: 'm1',
          type: 'DEPOSIT',
          amount: '200',
          cash_account_id: ACC,
          to_account_id: null,
          notes: 'sale',
          created_at: new Date('2026-05-01T08:00:00Z'),
        },
        {
          id: 'm2',
          type: 'WITHDRAWAL',
          amount: '50',
          cash_account_id: ACC,
          to_account_id: null,
          notes: 'expense',
          created_at: new Date('2026-05-01T09:00:00Z'),
        },
      ]); // page rows

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
    // movements without a voucher render the placeholder label.
    expect(res.rows[0].voucherNumber).toBe('(Chưa có chứng từ)');
  });

  it('signs TRANSFER by direction: +amount when destination, -amount when source', async () => {
    movementRepo.query
      .mockResolvedValueOnce([{ sum: 0 }]) // opening
      .mockResolvedValueOnce([{ sum: 100 }]) // closing
      .mockResolvedValueOnce([{ debit: 300, credit: 200 }]) // totals
      .mockResolvedValueOnce([{ total: 2 }]) // count
      .mockResolvedValueOnce([
        {
          id: 't-in',
          type: 'TRANSFER',
          amount: '300',
          cash_account_id: 'other',
          to_account_id: ACC, // money received → +300
          notes: null,
          created_at: new Date('2026-05-01T08:00:00Z'),
        },
        {
          id: 't-out',
          type: 'TRANSFER',
          amount: '200',
          cash_account_id: ACC, // money sent → -200
          to_account_id: 'other',
          notes: null,
          created_at: new Date('2026-05-01T09:00:00Z'),
        },
      ]);

    const res = await service.getLedger({ cashAccountId: ACC }, actor);

    expect(res.rows[0]).toMatchObject({ debit: 300, credit: 0, balance: 300 });
    expect(res.rows[1]).toMatchObject({ debit: 0, credit: 200, balance: 100 });
  });

  it('offset paging: page 2 opens from opening + signed sum of preceding rows', async () => {
    movementRepo.query
      .mockResolvedValueOnce([{ sum: 0 }]) // opening
      .mockResolvedValueOnce([{ sum: 20 }]) // closing
      .mockResolvedValueOnce([{ debit: 20, credit: 0 }]) // totals
      .mockResolvedValueOnce([{ total: 2 }]) // count
      .mockResolvedValueOnce([{ sum: 10 }]) // sumSignedBeforeOffset (page-1 row)
      .mockResolvedValueOnce([
        {
          id: 'm2',
          type: 'DEPOSIT',
          amount: '10',
          cash_account_id: ACC,
          to_account_id: null,
          notes: null,
          created_at: new Date('2026-05-01T09:00:00Z'),
        },
      ]); // page-2 rows

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
    movementRepo.query
      .mockResolvedValueOnce([{ sum: 0 }]) // opening
      .mockResolvedValueOnce([{ sum: 200 }]) // closing
      .mockResolvedValueOnce([{ debit: 200, credit: 0 }]) // totals
      .mockResolvedValueOnce([{ total: 1 }]) // count
      .mockResolvedValueOnce([
        {
          id: 'm1',
          type: 'DEPOSIT',
          amount: '200',
          cash_account_id: ACC,
          to_account_id: null,
          notes: null,
          created_at: new Date('2026-05-01T08:00:00Z'),
        },
      ]);
    receiptRepo.find.mockResolvedValue([
      {
        id: 'r-1',
        cashMovementId: 'm1',
        documentNumber: 'PT-26-00001',
        reason: 'Thu bán hàng',
        partnerNameSnapshot: 'Khách A',
        payerName: null,
      },
    ]);

    const res = await service.getLedger({ cashAccountId: ACC }, actor);

    expect(res.rows[0]).toMatchObject({
      voucherId: 'r-1',
      voucherNumber: 'PT-26-00001',
      kind: 'PT',
      description: 'Thu bán hàng',
      partnerName: 'Khách A',
    });
  });
});
