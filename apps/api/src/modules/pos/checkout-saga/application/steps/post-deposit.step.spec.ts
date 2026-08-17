import { PostDepositStep } from './post-deposit.step';
import { DepositAccountEntity } from '../../../../accounting/deposit/deposit-account.entity';
import { DepositMovementEntity } from '../../../../accounting/deposit/deposit-movement.entity';
import {
  DocumentNumberRuleEntity,
  ResetPolicy,
} from '../../../../document-numbering/document-number-rule.entity';
import { DocumentNumberCounterEntity } from '../../../../document-numbering/document-number-counter.entity';
import { BankVoucherPartnerType } from '../../../../accounting/deposit-vouchers/enums';
import { CheckoutContext } from '../checkout-step';

const PARTY_ROW = {
  customer_id: 'cust-1',
  staff_id: 'user-cashier',
  salesperson_id: 'profile-1',
  customer_name: 'Nguyễn Văn A',
  customer_address: '12 Lê Lợi',
  branch_address: '45 Nguyễn Huệ',
  salesperson_user_id: 'user-salesperson',
};

/** The Phiếu thu tiền gửi writer, stubbed. */
function bankReceiptsStub() {
  return {
    createVoucherForMovement: jest
      .fn()
      .mockResolvedValue({ voucherId: 'nttk-1', voucherNumber: 'NTTK000001' }),
    createAndPostInternal: jest.fn(),
  };
}

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] },
    input: {
      invoiceId: 'inv-1',
      payments: [{ paymentMethod: 'bank_transfer' as any, amount: 200 }],
    },
    correlationId: 'corr-1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    invoice: { id: 'inv-1', branchId: 'b1' } as any,
    documentNumber: 'INV-202608-00001',
    accounts: {
      revenueAccountId: 'acc-revenue',
      perPayment: [{ accountId: 'acc-bank', depositAccountId: 'dep-acc-1' }],
    },
    savedPayments: [{ id: 'pay-1' } as any],
    journalEntryId: 'jnl-entry-1',
    ...overrides,
  };
}

function withManager(
  opts: {
    depositAccount?: Partial<DepositAccountEntity> | null;
    partyRows?: unknown[];
  } = {},
) {
  const depositRepo = { save: jest.fn((x: unknown) => x) };
  let movementSeq = 0;
  const movementRepo = {
    create: jest.fn((x: unknown) => x),
    // Real save() returns the row with its generated id; the voucher links it.
    save: jest.fn((row: any) => Promise.resolve({ ...row, id: `dmv-${++movementSeq}` })),
  };
  const ruleRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: 'rule-nttk',
      prefix: 'NTTK',
      includeDate: false,
      sequenceLength: 6,
      resetPolicy: ResetPolicy.NEVER,
    }),
    create: jest.fn((x: unknown) => x),
    save: jest.fn((x: unknown) => x),
  };
  const counterRepo = { create: jest.fn((x: unknown) => x), save: jest.fn((x: unknown) => x) };
  const depositQb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest
      .fn()
      .mockResolvedValue(
        opts.depositAccount === undefined
          ? { id: 'dep-acc-1', balance: 1000 }
          : opts.depositAccount,
      ),
  };
  const counterQb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue({ currentValue: 0 }),
  };
  const periodGuard = { assertNotLocked: jest.fn().mockResolvedValue(undefined) };
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === DepositAccountEntity) return depositRepo;
      if (entity === DepositMovementEntity) return movementRepo;
      if (entity === DocumentNumberRuleEntity) return ruleRepo;
      if (entity === DocumentNumberCounterEntity) return counterRepo;
      return movementRepo;
    }),
    createQueryBuilder: jest.fn((entity: unknown) =>
      entity === DocumentNumberCounterEntity ? counterQb : depositQb,
    ),
    query: jest.fn().mockResolvedValue(opts.partyRows ?? [PARTY_ROW]),
  } as any;
  return { manager, depositRepo, movementRepo, qb: depositQb, periodGuard };
}

describe('PostDepositStep', () => {
  it('throws a plain Error when run outside a transaction', async () => {
    const { periodGuard } = withManager();
    await expect(new PostDepositStep(periodGuard as any, bankReceiptsStub() as any).execute(ctx())).rejects.toThrow(
      'post-deposit ran outside a transaction',
    );
  });

  it('throws a plain Error when invoice/accounts/savedPayments are missing', async () => {
    const { manager, periodGuard } = withManager();
    await expect(
      new PostDepositStep(periodGuard as any, bankReceiptsStub() as any).execute(ctx({ manager, savedPayments: undefined })),
    ).rejects.toThrow('post-deposit ran before its prerequisite steps populated the context');
  });

  it('is a no-op on a replayed run', async () => {
    const { manager, movementRepo, periodGuard } = withManager();
    await new PostDepositStep(periodGuard as any, bankReceiptsStub() as any).execute(ctx({ replayed: true, manager }));
    expect(movementRepo.save).not.toHaveBeenCalled();
    expect(periodGuard.assertNotLocked).not.toHaveBeenCalled();
  });

  it('skips a CASH payment line entirely', async () => {
    const { manager, movementRepo, qb, periodGuard } = withManager();
    const c = ctx({
      manager,
      input: { invoiceId: 'inv-1', payments: [{ paymentMethod: 'cash' as any, amount: 200 }] },
      accounts: { revenueAccountId: 'acc-revenue', perPayment: [{ accountId: 'acc-cash' }] },
    });
    await new PostDepositStep(periodGuard as any, bankReceiptsStub() as any).execute(c);
    expect(movementRepo.save).not.toHaveBeenCalled();
    expect(qb.getOne).not.toHaveBeenCalled();
  });

  it('skips a line whose resolved COA maps to no deposit fund (no depositAccountId)', async () => {
    const { manager, movementRepo, qb, periodGuard } = withManager();
    const c = ctx({
      manager,
      accounts: { revenueAccountId: 'acc-revenue', perPayment: [{ accountId: 'acc-bank' }] }, // no depositAccountId
    });
    await new PostDepositStep(periodGuard as any, bankReceiptsStub() as any).execute(c);
    expect(movementRepo.save).not.toHaveBeenCalled();
    expect(qb.getOne).not.toHaveBeenCalled();
  });

  it('checks the deposit period lock before touching the account, using the checkout branch and today as docDate', async () => {
    const { manager, periodGuard } = withManager();
    await new PostDepositStep(periodGuard as any, bankReceiptsStub() as any).execute(ctx({ manager }));
    expect(periodGuard.assertNotLocked).toHaveBeenCalledWith(
      'b1',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      manager,
    );
  });

  it('propagates a locked-period ConflictException unchanged, rolling back the checkout', async () => {
    const { manager, periodGuard } = withManager();
    const boom = new Error('Period 2026-08 is locked for this branch (BR-LOCK-01)');
    periodGuard.assertNotLocked.mockRejectedValue(boom);
    await expect(new PostDepositStep(periodGuard as any, bankReceiptsStub() as any).execute(ctx({ manager }))).rejects.toBe(boom);
  });

  it('throws a plain Error when the locked deposit account is not found', async () => {
    const { manager, periodGuard } = withManager({ depositAccount: null });
    await expect(new PostDepositStep(periodGuard as any, bankReceiptsStub() as any).execute(ctx({ manager }))).rejects.toThrow(
      'post-deposit: deposit account dep-acc-1 not found',
    );
  });

  it('records one deposit_movements row, increases the fund balance, and carries no fee/settlement delay', async () => {
    const { manager, depositRepo, movementRepo, periodGuard } = withManager({
      depositAccount: { id: 'dep-acc-1', balance: 1000 },
    });
    const c = ctx({ manager });

    await new PostDepositStep(periodGuard as any, bankReceiptsStub() as any).execute(c);

    expect(depositRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dep-acc-1', balance: 1200 }),
    );
    expect(movementRepo.save).toHaveBeenCalledTimes(1);
    const saved = movementRepo.save.mock.calls[0][0];
    expect(saved).toMatchObject({
      organizationId: 'o1',
      branchId: 'b1',
      depositAccountId: 'dep-acc-1',
      type: 'DEPOSIT',
      amount: 200,
      feeAmount: 0,
      netAmount: 200,
      source: 'POS_INVOICE',
      sourceRefId: 'inv-1',
      sourceRefLineId: 'pay-1',
      documentNumber: 'INV-202608-00001',
    });
    expect(saved.docDate).toBe(saved.valueDate); // no settlement delay (A-27)
  });

  it('handles multiple non-CASH lines, skipping CASH and no-deposit-fund lines, index-aligned with savedPayments', async () => {
    const { manager, movementRepo, periodGuard } = withManager({
      depositAccount: { id: 'dep-acc-1', balance: 0 },
    });
    const c = ctx({
      manager,
      input: {
        invoiceId: 'inv-1',
        payments: [
          { paymentMethod: 'cash' as any, amount: 50 }, // skipped: CASH
          { paymentMethod: 'bank_transfer' as any, amount: 100 },
          { paymentMethod: 'card' as any, amount: 75 }, // skipped: no depositAccountId
          { paymentMethod: 'bank_transfer' as any, amount: 60 },
        ],
      },
      accounts: {
        revenueAccountId: 'acc-revenue',
        perPayment: [
          { accountId: 'acc-cash' },
          { accountId: 'acc-bank', depositAccountId: 'dep-acc-1' },
          { accountId: 'acc-card' },
          { accountId: 'acc-bank', depositAccountId: 'dep-acc-1' },
        ],
      },
      savedPayments: [{ id: 'pay-1' }, { id: 'pay-2' }, { id: 'pay-3' }, { id: 'pay-4' }] as any,
    });

    await new PostDepositStep(periodGuard as any, bankReceiptsStub() as any).execute(c);

    expect(movementRepo.save).toHaveBeenCalledTimes(2);
    expect(movementRepo.save.mock.calls[0][0]).toMatchObject({ amount: 100, sourceRefLineId: 'pay-2' });
    expect(movementRepo.save.mock.calls[1][0]).toMatchObject({ amount: 60, sourceRefLineId: 'pay-4' });
  });

  describe('Phiếu thu tiền gửi (AC-13)', () => {
    it('issues one receipt per non-CASH line, each linked to its own movement', async () => {
      // Unlike the cash side, which sums every CASH line into one document (ADR-05): two
      // deposit lines can land in two different funds, so they get two vouchers.
      const { manager, periodGuard } = withManager();
      const receipts = bankReceiptsStub();
      const c = ctx({
        manager,
        input: {
          invoiceId: 'inv-1',
          payments: [
            { paymentMethod: 'bank_transfer' as any, amount: 200 },
            { paymentMethod: 'e_wallet' as any, amount: 50 },
          ],
        },
        accounts: {
          revenueAccountId: 'acc-revenue',
          perPayment: [
            { accountId: 'acc-bank', depositAccountId: 'dep-acc-1' },
            { accountId: 'acc-wallet', depositAccountId: 'dep-acc-1' },
          ],
        },
        savedPayments: [{ id: 'pay-1' } as any, { id: 'pay-2' } as any],
      });

      await new PostDepositStep(periodGuard as any, receipts as any).execute(c);

      expect(receipts.createVoucherForMovement).toHaveBeenCalledTimes(2);
      const [first] = receipts.createVoucherForMovement.mock.calls[0];
      const [second] = receipts.createVoucherForMovement.mock.calls[1];
      expect(first.amount).toBe(200);
      expect(second.amount).toBe(50);
      // Distinct movements — the dedupe key T-04-01 switched to.
      expect(first.depositMovementId).toBe('dmv-1');
      expect(second.depositMovementId).toBe('dmv-2');
    });

    it('carries the customer and puts the staff member in collectedBy (AC-13)', async () => {
      const { manager, periodGuard } = withManager();
      const receipts = bankReceiptsStub();

      await new PostDepositStep(periodGuard as any, receipts as any).execute(ctx({ manager }));

      const [args, passedManager] = receipts.createVoucherForMovement.mock.calls[0];
      expect(args).toEqual(
        expect.objectContaining({
          partnerType: BankVoucherPartnerType.CUSTOMER,
          partnerId: 'cust-1',
          partnerName: 'Nguyễn Văn A',
          partnerAddress: '12 Lê Lợi',
          payerName: 'Nguyễn Văn A',
          collectedBy: 'user-salesperson',
          referenceId: 'inv-1',
          journalEntryId: 'jnl-entry-1',
        }),
      );
      // bank_receipts has no staff_id column.
      expect(args.staffId).toBeUndefined();
      expect(passedManager).toBe(manager);
    });

    it('never posts a second movement or journal entry (AC-10)', async () => {
      const { manager, periodGuard } = withManager();
      const receipts = bankReceiptsStub();

      await new PostDepositStep(periodGuard as any, receipts as any).execute(ctx({ manager }));

      expect(receipts.createAndPostInternal).not.toHaveBeenCalled();
    });

    it('looks the party up once for the whole invoice, not once per line', async () => {
      const { manager, periodGuard } = withManager();
      const receipts = bankReceiptsStub();
      const c = ctx({
        manager,
        input: {
          invoiceId: 'inv-1',
          payments: [
            { paymentMethod: 'bank_transfer' as any, amount: 200 },
            { paymentMethod: 'e_wallet' as any, amount: 50 },
          ],
        },
        accounts: {
          revenueAccountId: 'acc-revenue',
          perPayment: [
            { accountId: 'acc-bank', depositAccountId: 'dep-acc-1' },
            { accountId: 'acc-wallet', depositAccountId: 'dep-acc-1' },
          ],
        },
        savedPayments: [{ id: 'pay-1' } as any, { id: 'pay-2' } as any],
      });

      await new PostDepositStep(periodGuard as any, receipts as any).execute(c);

      expect(manager.query).toHaveBeenCalledTimes(1);
    });

    it('still issues the receipt when the party lookup resolves nothing (AC-14)', async () => {
      const { manager, periodGuard } = withManager({ partyRows: [] });
      const receipts = bankReceiptsStub();

      await new PostDepositStep(periodGuard as any, receipts as any).execute(ctx({ manager }));

      const [args] = receipts.createVoucherForMovement.mock.calls[0];
      expect(args.amount).toBe(200);
      expect(args.partnerId).toBeUndefined();
      expect(args.collectedBy).toBeUndefined();
    });
  });
});
