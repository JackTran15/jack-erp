import { PostCashStep } from './post-cash.step';
import { CashAccountEntity } from '../../../../accounting/cash/cash-account.entity';
import { CashMovementEntity } from '../../../../accounting/cash/cash-movement.entity';
import { JournalEntryEntity } from '../../../../accounting/journal/journal-entry.entity';
import {
  DocumentNumberRuleEntity,
  ResetPolicy,
} from '../../../../document-numbering/document-number-rule.entity';
import { DocumentNumberCounterEntity } from '../../../../document-numbering/document-number-counter.entity';
import { CashVoucherPartnerType } from '../../../../accounting/cash-vouchers/enums';
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

/** The Phiếu thu writer, stubbed. `createAndPostInternal` is here only so a test can prove
 *  it is never the method this step reaches for — that one would post a second movement
 *  and a second journal entry (AC-10). */
function cashReceiptsStub() {
  return {
    createVoucherForMovement: jest
      .fn()
      .mockResolvedValue({ voucherId: 'pt-1', voucherNumber: 'PT000153' }),
    createAndPostInternal: jest.fn(),
  };
}

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
    accounts: { revenueAccountId: 'acc-revenue', perPayment: [{ accountId: 'acc-cash' }] },
    journalEntryId: 'jnl-entry-1',
    ...overrides,
  };
}

/**
 * Mocks the manager surface this step touches: the cash account + movements it always
 * wrote, plus (since the Phiếu thu landed) the numbering rule/counter `mintDocumentNumber`
 * locks and the party lookup's raw query.
 */
function withManager(
  opts: {
    cashAccount?: Partial<CashAccountEntity> | null;
    partyRows?: unknown[];
    rule?: Partial<DocumentNumberRuleEntity> | null;
  } = {},
) {
  const cashAccountRepo = { save: jest.fn((x: unknown) => x) };
  const movementRepo = {
    create: jest.fn((x: unknown) => x),
    // Real save() echoes the rows back with their generated ids; the voucher links the first.
    save: jest.fn((rows: any[]) =>
      Promise.resolve(rows.map((r, i) => ({ ...r, id: `mv-${i + 1}` }))),
    ),
  };
  const journalRepo = { create: jest.fn(), save: jest.fn() };
  const ruleRepo = {
    findOne: jest.fn().mockResolvedValue(
      opts.rule === undefined
        ? {
            id: 'rule-pt',
            prefix: 'PT',
            includeDate: false,
            sequenceLength: 6,
            resetPolicy: ResetPolicy.NEVER,
          }
        : opts.rule,
    ),
  };
  const counterRepo = { create: jest.fn((x: unknown) => x), save: jest.fn((x: unknown) => x) };

  const cashQb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest
      .fn()
      .mockResolvedValue(
        opts.cashAccount === undefined
          ? { id: 'cash-acc-1', balance: 500 }
          : opts.cashAccount,
      ),
  };
  const counterQb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue({ currentValue: 152 }),
  };

  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === CashAccountEntity) return cashAccountRepo;
      if (entity === CashMovementEntity) return movementRepo;
      if (entity === JournalEntryEntity) return journalRepo;
      if (entity === DocumentNumberRuleEntity) return ruleRepo;
      if (entity === DocumentNumberCounterEntity) return counterRepo;
      return movementRepo;
    }),
    createQueryBuilder: jest.fn((entity: unknown) =>
      entity === DocumentNumberCounterEntity ? counterQb : cashQb,
    ),
    query: jest.fn().mockResolvedValue(opts.partyRows ?? [PARTY_ROW]),
  } as any;
  return {
    manager,
    cashAccountRepo,
    movementRepo,
    journalRepo,
    counterQb,
    qb: cashQb,
  };
}

describe('PostCashStep', () => {
  it('throws a plain Error when run outside a transaction', async () => {
    await expect(new PostCashStep(cashReceiptsStub() as any).execute(ctx())).rejects.toThrow(
      'post-cash ran outside a transaction',
    );
  });

  it('throws a plain Error when invoice/funds are missing', async () => {
    const { manager } = withManager();
    await expect(
      new PostCashStep(cashReceiptsStub() as any).execute(ctx({ manager, funds: undefined })),
    ).rejects.toThrow('post-cash ran before its prerequisite steps populated the context');
  });

  it('is a no-op on a replayed run', async () => {
    const { manager, movementRepo } = withManager();
    await new PostCashStep(cashReceiptsStub() as any).execute(ctx({ replayed: true, manager }));
    expect(movementRepo.save).not.toHaveBeenCalled();
  });

  it('is a no-op when there are no CASH payment lines', async () => {
    const { manager, movementRepo, qb } = withManager();
    await new PostCashStep(cashReceiptsStub() as any).execute(
      ctx({ manager, input: { invoiceId: 'inv-1', payments: [{ paymentMethod: 'bank_transfer' as any, amount: 100 }] } }),
    );
    expect(movementRepo.save).not.toHaveBeenCalled();
    expect(qb.getOne).not.toHaveBeenCalled(); // never even locks a cash account
  });

  it('throws a plain Error when a CASH line exists but resolve-funds resolved no cashAccountId', async () => {
    const { manager } = withManager();
    await expect(
      new PostCashStep(cashReceiptsStub() as any).execute(ctx({ manager, funds: {} })),
    ).rejects.toThrow('post-cash: a CASH payment exists but resolve-funds did not resolve a cashAccountId');
  });

  it('throws a plain Error when the locked cash account is not found', async () => {
    const { manager } = withManager({ cashAccount: null });
    await expect(new PostCashStep(cashReceiptsStub() as any).execute(ctx({ manager }))).rejects.toThrow(
      'post-cash: cash account cash-acc-1 not found',
    );
  });

  it('records one cash_movements row for a single CASH line and increases the fund balance by the amount', async () => {
    const { manager, cashAccountRepo, movementRepo } = withManager({
      cashAccount: { id: 'cash-acc-1', balance: 500 },
    });
    const c = ctx({ manager });

    await new PostCashStep(cashReceiptsStub() as any).execute(c);

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

    await new PostCashStep(cashReceiptsStub() as any).execute(c);

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
    await new PostCashStep(cashReceiptsStub() as any).execute(ctx({ manager }));
    expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(qb.where).toHaveBeenCalledWith('ca.id = :id', { id: 'cash-acc-1' });
  });

  describe('Phiếu thu (AC-09, AC-10, AC-12, AC-14)', () => {
    it('writes one receipt for the summed CASH lines, linked to the movement and the sale entry', async () => {
      const { manager } = withManager();
      const receipts = cashReceiptsStub();
      const c = ctx({
        manager,
        input: {
          invoiceId: 'inv-1',
          payments: [
            { paymentMethod: 'cash' as any, amount: 60 },
            { paymentMethod: 'cash' as any, amount: 30 },
            { paymentMethod: 'bank_transfer' as any, amount: 40 },
          ],
        },
      });

      await new PostCashStep(receipts as any).execute(c);

      expect(receipts.createVoucherForMovement).toHaveBeenCalledTimes(1);
      const [args, passedManager] = receipts.createVoucherForMovement.mock.calls[0];
      expect(args).toEqual(
        expect.objectContaining({
          amount: 90, // the two CASH lines, not the transfer
          referenceId: 'inv-1',
          cashMovementId: 'mv-1',
          journalEntryId: 'jnl-entry-1',
          cashAccountId: 'cash-acc-1',
          contraAccountId: 'acc-revenue',
          reason: 'POS sale INV-202608-00001',
        }),
      );
      // Same manager as the rest of checkout — a rollback has to take the voucher with it.
      expect(passedManager).toBe(manager);
      expect(c.cashReceiptId).toBe('pt-1');
    });

    it('carries the invoice customer, address and salesperson onto the receipt (AC-09)', async () => {
      const { manager } = withManager();
      const receipts = cashReceiptsStub();

      await new PostCashStep(receipts as any).execute(ctx({ manager }));

      expect(receipts.createVoucherForMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          partnerType: CashVoucherPartnerType.CUSTOMER,
          partnerId: 'cust-1',
          partnerName: 'Nguyễn Văn A',
          partnerAddress: '12 Lê Lợi',
          payerName: 'Nguyễn Văn A',
          staffId: 'user-salesperson',
        }),
        expect.anything(),
      );
    });

    it('mints its number through the checkout transaction, never a second one (AC-11)', async () => {
      // `DocumentNumberingService.generate` would open its own SERIALIZABLE transaction and
      // hand back a number that outlives a rollback. Proof it went the other way: the
      // counter was locked on THIS manager, and the number reached the service ready-made.
      const { manager, counterQb } = withManager();
      const receipts = cashReceiptsStub();

      await new PostCashStep(receipts as any).execute(ctx({ manager }));

      expect(counterQb.setLock).toHaveBeenCalledWith('pessimistic_write');
      const [args] = receipts.createVoucherForMovement.mock.calls[0];
      expect(args.documentNumber).toBe('PT000153');
    });

    it('never posts a second movement or journal entry (AC-10)', async () => {
      const { manager, journalRepo } = withManager();
      const receipts = cashReceiptsStub();

      await new PostCashStep(receipts as any).execute(ctx({ manager }));

      // createAndPostInternal is the method that would write both again.
      expect(receipts.createAndPostInternal).not.toHaveBeenCalled();
      expect(journalRepo.save).not.toHaveBeenCalled();
    });

    it('writes nothing at all on a replayed run (AC-12)', async () => {
      const { manager } = withManager();
      const receipts = cashReceiptsStub();

      await new PostCashStep(receipts as any).execute(ctx({ replayed: true, manager }));

      expect(receipts.createVoucherForMovement).not.toHaveBeenCalled();
    });

    it('refuses to run before post-journal has populated journalEntryId', async () => {
      const { manager } = withManager();
      const receipts = cashReceiptsStub();

      await expect(
        new PostCashStep(receipts as any).execute(ctx({ manager, journalEntryId: undefined })),
      ).rejects.toThrow('post-cash ran before its prerequisite steps populated the context');
    });

    it('creates the default PT rule instead of failing the sale when none exists (ADR-06)', async () => {
      // Found by running checkout-saga-voucher.e2e: erp_test had no CASH_RECEIPT rule, and
      // every v2 cash checkout died with DOC_NUMBER_RULE_MISSING. v1 never hits this because
      // DocumentNumberingService.generate auto-creates the rule — so must this path.
      const { manager } = withManager({ rule: null });
      const receipts = cashReceiptsStub();
      const ruleRepo = manager.getRepository(DocumentNumberRuleEntity);
      ruleRepo.create = jest.fn((x: unknown) => x);
      ruleRepo.save = jest.fn().mockResolvedValue({
        id: 'rule-created',
        prefix: 'PT',
        includeDate: false,
        sequenceLength: 6,
        resetPolicy: ResetPolicy.NEVER,
      });

      await new PostCashStep(receipts as any).execute(ctx({ manager }));

      expect(ruleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ documentType: 'CASH_RECEIPT', prefix: 'PT', isActive: true }),
      );
      expect(receipts.createVoucherForMovement).toHaveBeenCalledTimes(1);
    });

    it('still writes the receipt when the party lookup resolves nothing (AC-14)', async () => {
      // A deleted customer must not cost the cashier the sale.
      const { manager } = withManager({ partyRows: [] });
      const receipts = cashReceiptsStub();

      await new PostCashStep(receipts as any).execute(ctx({ manager }));

      const [args] = receipts.createVoucherForMovement.mock.calls[0];
      expect(args.amount).toBe(100);
      expect(args.partnerId).toBeUndefined();
      expect(args.staffId).toBeUndefined();
    });
  });
});
