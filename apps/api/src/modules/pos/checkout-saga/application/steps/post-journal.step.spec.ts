import { PostJournalStep } from './post-journal.step';
import { JournalEntryEntity } from '../../../../accounting/journal/journal-entry.entity';
import { JournalLineEntity } from '../../../../accounting/journal/journal-line.entity';
import { DocumentNumberRuleEntity, ResetPolicy } from '../../../../document-numbering/document-number-rule.entity';
import { InvoiceStatus } from '../../../entities/invoice.entity';
import { CheckoutContext } from '../checkout-step';

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] },
    input: {
      invoiceId: 'inv-1',
      payments: [{ paymentMethod: 'cash' as any, amount: 200 }],
    },
    correlationId: 'corr-1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    invoice: { id: 'inv-1', branchId: 'b1' } as any,
    documentNumber: 'INV-202608-00001',
    accounts: {
      revenueAccountId: 'acc-revenue',
      perPayment: [{ accountId: 'acc-cash' }],
    },
    totals: {
      subtotal: 200,
      manualDiscountAmount: 0,
      promotionDiscount: 0,
      pointsDiscountAmount: 0,
      depositAmount: 0,
      amountDue: 200,
      totalPaid: 200,
      remainder: 0,
      keptChange: 0,
      pointsEarned: 0,
      newStatus: InvoiceStatus.PAID,
    },
    ...overrides,
  };
}

/** Mocks the manager surface post-journal.step.ts + mintDocumentNumber both touch. */
function withManager(opts: { rule?: Partial<DocumentNumberRuleEntity> | null } = {}) {
  const ruleRepo = {
    findOne: jest.fn().mockResolvedValue(
      opts.rule === undefined
        ? {
            id: 'rule-jnl',
            prefix: 'JNL',
            includeDate: true,
            dateFormat: 'YYYYMM',
            sequenceLength: 5,
            resetPolicy: ResetPolicy.MONTHLY,
          }
        : opts.rule,
    ),
  };
  const counterRepo = { create: jest.fn((x: unknown) => x), save: jest.fn((x: unknown) => x) };
  const qb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue({ currentValue: 0 }),
  };

  const savedEntry = { id: 'jnl-entry-1' };
  const entryRepo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn().mockResolvedValue(savedEntry),
  };
  const lineRepo = { create: jest.fn((x: unknown) => x), save: jest.fn().mockResolvedValue([]) };

  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === DocumentNumberRuleEntity) return ruleRepo;
      if (entity === JournalEntryEntity) return entryRepo;
      if (entity === JournalLineEntity) return lineRepo;
      return counterRepo; // DocumentNumberCounterEntity
    }),
    createQueryBuilder: jest.fn(() => qb),
  } as any;

  return { manager, entryRepo, lineRepo, ruleRepo };
}

describe('PostJournalStep', () => {
  it('throws a plain Error when run outside a transaction', async () => {
    await expect(new PostJournalStep().execute(ctx())).rejects.toThrow(
      'post-journal ran outside a transaction',
    );
  });

  it('throws a plain Error when invoice/accounts/totals are missing', async () => {
    const { manager } = withManager();
    await expect(
      new PostJournalStep().execute(ctx({ manager, accounts: undefined })),
    ).rejects.toThrow('post-journal ran before its prerequisite steps populated the context');
  });

  it('is a no-op on a replayed run', async () => {
    const { manager, entryRepo } = withManager();
    await new PostJournalStep().execute(ctx({ replayed: true, manager }));
    expect(entryRepo.save).not.toHaveBeenCalled();
  });

  it('a fully-paid cash sale posts one debit (cash) and one credit (revenue), balanced', async () => {
    const { manager, entryRepo, lineRepo } = withManager();
    const c = ctx({ manager });

    await new PostJournalStep().execute(c);

    expect(entryRepo.save).toHaveBeenCalledTimes(1);
    expect(entryRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'SALE',
        sourceReferenceId: 'inv-1',
        description: 'POS Invoice INV-202608-00001',
        status: 'POSTED',
      }),
    );
    expect(lineRepo.save).toHaveBeenCalledTimes(1);
    const savedLines = lineRepo.save.mock.calls[0][0];
    expect(savedLines).toEqual([
      expect.objectContaining({
        journalEntryId: 'jnl-entry-1',
        accountId: 'acc-cash',
        debitAmount: 200,
        creditAmount: 0,
        lineOrder: 1,
      }),
      expect.objectContaining({
        accountId: 'acc-revenue',
        debitAmount: 0,
        creditAmount: 200,
        lineOrder: 2,
      }),
    ]);
  });

  it('hands the entry id to later steps through the context', async () => {
    // post-cash links its Phiếu thu to this entry instead of posting a second one, so an
    // unset slot would push it into minting its own JE.
    const { manager } = withManager();
    const c = ctx({ manager });

    await new PostJournalStep().execute(c);

    expect(c.journalEntryId).toBe('jnl-entry-1');
  });

  it('a credit sale with a remainder adds a debit RECEIVABLE line for the remainder', async () => {
    const { manager, lineRepo } = withManager();
    const c = ctx({
      manager,
      input: { invoiceId: 'inv-1', payments: [{ paymentMethod: 'cash' as any, amount: 50 }] },
      accounts: {
        revenueAccountId: 'acc-revenue',
        receivableAccountId: 'acc-receivable',
        perPayment: [{ accountId: 'acc-cash' }],
      },
      totals: {
        ...ctx().totals!,
        totalPaid: 50,
        remainder: 150,
        newStatus: InvoiceStatus.PARTIAL_DEBT,
      },
    });

    await new PostJournalStep().execute(c);

    const savedLines = lineRepo.save.mock.calls[0][0];
    expect(savedLines).toEqual([
      expect.objectContaining({ accountId: 'acc-cash', debitAmount: 50, creditAmount: 0 }),
      expect.objectContaining({ accountId: 'acc-receivable', debitAmount: 150, creditAmount: 0 }),
      expect.objectContaining({ accountId: 'acc-revenue', debitAmount: 0, creditAmount: 200 }),
    ]);
  });

  it('throws a plain Error when remainder > 0 but no receivableAccountId was resolved (regressed guard, not a user error)', async () => {
    const { manager } = withManager();
    const c = ctx({
      manager,
      accounts: { revenueAccountId: 'acc-revenue', perPayment: [{ accountId: 'acc-cash' }] },
      totals: { ...ctx().totals!, remainder: 100 },
    });
    await expect(new PostJournalStep().execute(c)).rejects.toThrow(
      'post-journal: remainder > 0 but no receivableAccountId was resolved',
    );
  });

  it('throws a plain Error if the constructed lines are somehow unbalanced', async () => {
    const { manager } = withManager();
    // Force an inconsistency: amountDue disagrees with what payments+remainder actually sum to.
    const c = ctx({
      manager,
      totals: { ...ctx().totals!, amountDue: 999, remainder: 0 },
    });
    await expect(new PostJournalStep().execute(c)).rejects.toThrow(/unbalanced entry/);
  });

  it('propagates a mintDocumentNumber failure unchanged (e.g. missing JOURNAL rule), rolling back the checkout', async () => {
    const { manager } = withManager({ rule: null });
    await expect(new PostJournalStep().execute(ctx({ manager }))).rejects.toMatchObject({
      response: { code: 'DOC_NUMBER_RULE_MISSING' },
    });
  });
});
