import { PersistPaymentsStep } from './persist-payments.step';
import { InvoicePaymentMethod } from '../../../entities/invoice.entity';
import { CheckoutContext } from '../checkout-step';

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] },
    input: { invoiceId: 'inv-1', payments: [] },
    correlationId: 'corr-1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    invoice: { id: 'inv-1' } as any,
    accounts: { revenueAccountId: 'acct-rev', receivableAccountId: undefined, perPayment: [] },
    ...overrides,
  };
}

function withManager(paymentRepo: any) {
  return { getRepository: jest.fn(() => paymentRepo) } as any;
}

describe('PersistPaymentsStep', () => {
  it('throws a plain Error when run outside a transaction', async () => {
    await expect(new PersistPaymentsStep().execute(ctx())).rejects.toThrow(
      'persist-payments ran outside a transaction',
    );
  });

  it('throws a plain Error when invoice/accounts are missing', async () => {
    const manager = withManager({ save: jest.fn() });
    await expect(
      new PersistPaymentsStep().execute(ctx({ manager, accounts: undefined })),
    ).rejects.toThrow('persist-payments ran before its prerequisite steps populated the context');
  });

  it('is a no-op on a replayed run', async () => {
    const paymentRepo = { create: jest.fn(), save: jest.fn() };
    await new PersistPaymentsStep().execute(
      ctx({ replayed: true, manager: withManager(paymentRepo) }),
    );
    expect(paymentRepo.save).not.toHaveBeenCalled();
  });

  it('sets ctx.savedPayments to an empty array for a fully-debt sale (no payment lines)', async () => {
    const paymentRepo = { create: jest.fn(), save: jest.fn() };
    const c = ctx({ manager: withManager(paymentRepo), input: { invoiceId: 'inv-1', payments: [] } });

    await new PersistPaymentsStep().execute(c);

    expect(paymentRepo.save).not.toHaveBeenCalled();
    expect(c.savedPayments).toEqual([]);
  });

  it('creates one row per payment line, index-aligned with resolve-accounts, never from client-supplied account ids', async () => {
    const paymentRepo = { create: jest.fn((x: unknown) => x), save: jest.fn((rows: unknown) => rows) };
    const c = ctx({
      manager: withManager(paymentRepo),
      input: {
        invoiceId: 'inv-1',
        payments: [
          { paymentMethod: InvoicePaymentMethod.CASH, amount: 100000, reference: undefined },
          { paymentMethod: InvoicePaymentMethod.BANK_TRANSFER, amount: 200000, reference: 'REF-1' },
        ],
      },
      accounts: {
        revenueAccountId: 'acct-rev',
        receivableAccountId: undefined,
        perPayment: [
          { accountId: 'acct-cash' },
          { accountId: 'acct-bank', depositAccountId: 'dep-1' },
        ],
      },
    });

    await new PersistPaymentsStep().execute(c);

    expect(paymentRepo.create).toHaveBeenCalledTimes(2);
    expect(paymentRepo.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        invoiceId: 'inv-1',
        paymentMethod: InvoicePaymentMethod.CASH,
        amount: 100000,
        accountId: 'acct-cash',
        depositAccountId: undefined,
      }),
    );
    expect(paymentRepo.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        paymentMethod: InvoicePaymentMethod.BANK_TRANSFER,
        amount: 200000,
        accountId: 'acct-bank',
        depositAccountId: 'dep-1',
        reference: 'REF-1',
      }),
    );
    expect(c.savedPayments).toHaveLength(2);
  });
});
