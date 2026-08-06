import { PostDepositStep } from './post-deposit.step';
import { DepositAccountEntity } from '../../../../accounting/deposit/deposit-account.entity';
import { DepositMovementEntity } from '../../../../accounting/deposit/deposit-movement.entity';
import { CheckoutContext } from '../checkout-step';

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
    ...overrides,
  };
}

function withManager(opts: { depositAccount?: Partial<DepositAccountEntity> | null } = {}) {
  const depositRepo = { save: jest.fn((x: unknown) => x) };
  const movementRepo = { create: jest.fn((x: unknown) => x), save: jest.fn().mockResolvedValue({}) };
  const qb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest
      .fn()
      .mockResolvedValue(
        opts.depositAccount === undefined
          ? { id: 'dep-acc-1', balance: 1000 }
          : opts.depositAccount,
      ),
  };
  const periodGuard = { assertNotLocked: jest.fn().mockResolvedValue(undefined) };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === DepositAccountEntity ? depositRepo : movementRepo,
    ),
    createQueryBuilder: jest.fn(() => qb),
  } as any;
  return { manager, depositRepo, movementRepo, qb, periodGuard };
}

describe('PostDepositStep', () => {
  it('throws a plain Error when run outside a transaction', async () => {
    const { periodGuard } = withManager();
    await expect(new PostDepositStep(periodGuard as any).execute(ctx())).rejects.toThrow(
      'post-deposit ran outside a transaction',
    );
  });

  it('throws a plain Error when invoice/accounts/savedPayments are missing', async () => {
    const { manager, periodGuard } = withManager();
    await expect(
      new PostDepositStep(periodGuard as any).execute(ctx({ manager, savedPayments: undefined })),
    ).rejects.toThrow('post-deposit ran before its prerequisite steps populated the context');
  });

  it('is a no-op on a replayed run', async () => {
    const { manager, movementRepo, periodGuard } = withManager();
    await new PostDepositStep(periodGuard as any).execute(ctx({ replayed: true, manager }));
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
    await new PostDepositStep(periodGuard as any).execute(c);
    expect(movementRepo.save).not.toHaveBeenCalled();
    expect(qb.getOne).not.toHaveBeenCalled();
  });

  it('skips a line whose resolved COA maps to no deposit fund (no depositAccountId)', async () => {
    const { manager, movementRepo, qb, periodGuard } = withManager();
    const c = ctx({
      manager,
      accounts: { revenueAccountId: 'acc-revenue', perPayment: [{ accountId: 'acc-bank' }] }, // no depositAccountId
    });
    await new PostDepositStep(periodGuard as any).execute(c);
    expect(movementRepo.save).not.toHaveBeenCalled();
    expect(qb.getOne).not.toHaveBeenCalled();
  });

  it('checks the deposit period lock before touching the account, using the checkout branch and today as docDate', async () => {
    const { manager, periodGuard } = withManager();
    await new PostDepositStep(periodGuard as any).execute(ctx({ manager }));
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
    await expect(new PostDepositStep(periodGuard as any).execute(ctx({ manager }))).rejects.toBe(boom);
  });

  it('throws a plain Error when the locked deposit account is not found', async () => {
    const { manager, periodGuard } = withManager({ depositAccount: null });
    await expect(new PostDepositStep(periodGuard as any).execute(ctx({ manager }))).rejects.toThrow(
      'post-deposit: deposit account dep-acc-1 not found',
    );
  });

  it('records one deposit_movements row, increases the fund balance, and carries no fee/settlement delay', async () => {
    const { manager, depositRepo, movementRepo, periodGuard } = withManager({
      depositAccount: { id: 'dep-acc-1', balance: 1000 },
    });
    const c = ctx({ manager });

    await new PostDepositStep(periodGuard as any).execute(c);

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

    await new PostDepositStep(periodGuard as any).execute(c);

    expect(movementRepo.save).toHaveBeenCalledTimes(2);
    expect(movementRepo.save.mock.calls[0][0]).toMatchObject({ amount: 100, sourceRefLineId: 'pay-2' });
    expect(movementRepo.save.mock.calls[1][0]).toMatchObject({ amount: 60, sourceRefLineId: 'pay-4' });
  });
});
