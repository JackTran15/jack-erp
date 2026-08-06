import { PostCashStep } from './post-cash.step';
import { CashAccountEntity } from '../../../../accounting/cash/cash-account.entity';
import { CashMovementEntity } from '../../../../accounting/cash/cash-movement.entity';
import { CheckoutContext } from '../checkout-step';

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] },
    input: {
      invoiceId: 'inv-1',
      payments: [{ paymentMethod: 'cash' as any, amount: 100 }],
    },
    correlationId: 'corr-1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    invoice: { id: 'inv-1', branchId: 'b1' } as any,
    documentNumber: 'INV-202608-00001',
    funds: { cashAccountId: 'cash-acc-1' },
    ...overrides,
  };
}

function withManager(opts: { cashAccount?: Partial<CashAccountEntity> | null } = {}) {
  const cashAccountRepo = { save: jest.fn((x: unknown) => x) };
  const movementRepo = { create: jest.fn((x: unknown) => x), save: jest.fn().mockResolvedValue([]) };
  const qb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest
      .fn()
      .mockResolvedValue(
        opts.cashAccount === undefined
          ? { id: 'cash-acc-1', balance: 500 }
          : opts.cashAccount,
      ),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === CashAccountEntity ? cashAccountRepo : movementRepo,
    ),
    createQueryBuilder: jest.fn(() => qb),
  } as any;
  return { manager, cashAccountRepo, movementRepo, qb };
}

describe('PostCashStep', () => {
  it('throws a plain Error when run outside a transaction', async () => {
    await expect(new PostCashStep().execute(ctx())).rejects.toThrow(
      'post-cash ran outside a transaction',
    );
  });

  it('throws a plain Error when invoice/funds are missing', async () => {
    const { manager } = withManager();
    await expect(
      new PostCashStep().execute(ctx({ manager, funds: undefined })),
    ).rejects.toThrow('post-cash ran before its prerequisite steps populated the context');
  });

  it('is a no-op on a replayed run', async () => {
    const { manager, movementRepo } = withManager();
    await new PostCashStep().execute(ctx({ replayed: true, manager }));
    expect(movementRepo.save).not.toHaveBeenCalled();
  });

  it('is a no-op when there are no CASH payment lines', async () => {
    const { manager, movementRepo, qb } = withManager();
    await new PostCashStep().execute(
      ctx({ manager, input: { invoiceId: 'inv-1', payments: [{ paymentMethod: 'bank_transfer' as any, amount: 100 }] } }),
    );
    expect(movementRepo.save).not.toHaveBeenCalled();
    expect(qb.getOne).not.toHaveBeenCalled(); // never even locks a cash account
  });

  it('throws a plain Error when a CASH line exists but resolve-funds resolved no cashAccountId', async () => {
    const { manager } = withManager();
    await expect(
      new PostCashStep().execute(ctx({ manager, funds: {} })),
    ).rejects.toThrow('post-cash: a CASH payment exists but resolve-funds did not resolve a cashAccountId');
  });

  it('throws a plain Error when the locked cash account is not found', async () => {
    const { manager } = withManager({ cashAccount: null });
    await expect(new PostCashStep().execute(ctx({ manager }))).rejects.toThrow(
      'post-cash: cash account cash-acc-1 not found',
    );
  });

  it('records one cash_movements row for a single CASH line and increases the fund balance by the amount', async () => {
    const { manager, cashAccountRepo, movementRepo } = withManager({
      cashAccount: { id: 'cash-acc-1', balance: 500 },
    });
    const c = ctx({ manager });

    await new PostCashStep().execute(c);

    expect(cashAccountRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cash-acc-1', balance: 600 }),
    );
    expect(movementRepo.save).toHaveBeenCalledTimes(1);
    const savedMovements = movementRepo.save.mock.calls[0][0];
    expect(savedMovements).toEqual([
      expect.objectContaining({
        cashAccountId: 'cash-acc-1',
        type: 'DEPOSIT',
        amount: 100,
        reference: 'inv-1',
        notes: 'POS sale INV-202608-00001',
        organizationId: 'o1',
        branchId: 'b1',
      }),
    ]);
  });

  it('records one movement per CASH line — split cash payments — and sums the balance delta across all of them', async () => {
    const { manager, cashAccountRepo, movementRepo } = withManager({
      cashAccount: { id: 'cash-acc-1', balance: 500 },
    });
    const c = ctx({
      manager,
      input: {
        invoiceId: 'inv-1',
        payments: [
          { paymentMethod: 'cash' as any, amount: 60 },
          { paymentMethod: 'bank_transfer' as any, amount: 40 }, // ignored — not a CASH line
          { paymentMethod: 'cash' as any, amount: 30 },
        ],
      },
    });

    await new PostCashStep().execute(c);

    expect(cashAccountRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ balance: 590 }), // 500 + 60 + 30
    );
    const savedMovements = movementRepo.save.mock.calls[0][0];
    expect(savedMovements).toHaveLength(2);
    expect(savedMovements[0]).toMatchObject({ amount: 60 });
    expect(savedMovements[1]).toMatchObject({ amount: 30 });
  });

  it('locks the cash account with pessimistic_write before touching its balance', async () => {
    const { manager, qb } = withManager();
    await new PostCashStep().execute(ctx({ manager }));
    expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(qb.where).toHaveBeenCalledWith('ca.id = :id', { id: 'cash-acc-1' });
  });
});
