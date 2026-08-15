import { Injectable } from '@nestjs/common';
import { DocumentType } from '@erp/shared-interfaces';
import { InvoicePaymentMethod } from '../../../entities/invoice.entity';
import { CheckoutContext, CheckoutStep, requireManager } from '../checkout-step';
import { CashAccountEntity } from '../../../../accounting/cash/cash-account.entity';
import { CashMovementEntity, CashMovementType } from '../../../../accounting/cash/cash-movement.entity';
import { CashReceiptsService } from '../../../../accounting/cash-vouchers/cash-receipts/cash-receipts.service';
import {
  CashReceiptPurpose,
  CashReceiptReferenceType,
} from '../../../../accounting/cash-vouchers/enums';
import { buildPosInvoiceParty } from '../../../../accounting/cash-vouchers/shared/voucher-party';
import { mintDocumentNumber } from './mint-document-number';

/**
 * Records one `cash_movements` row per CASH payment line, inline, in the
 * checkout transaction. `cashAccountId` comes from `resolve-funds` (a
 * `cash_accounts.id` — the till) — never from `payment.accountId` (a COA id);
 * that exact mix-up has happened in this repo before.
 *
 * Deliberately does NOT call `CashService.recordMovement()`. Traced the real
 * chain the ticket pointed at (`CashService.recordMovement`, used by
 * `DebtCollectionSagaService`) all the way through: for a DEPOSIT it calls
 * `this.journalService.post(...)` internally (`buildJournalLines` → DR the
 * cash GL account, CR the contra/revenue account) — even when given
 * `manager`. That is A-25's bug again, one layer deeper: `JournalService.post`
 * still mints its number via a non-participating `SERIALIZABLE` transaction
 * and still publishes `JOURNAL_POSTED` before the outer transaction commits.
 *
 * Worse than A-25 here: those exact two lines (DR cash GL, CR revenue GL) are
 * *already* posted by `post-journal.step.ts` (T-03-02) as part of the sale's
 * own journal entry — calling `CashService.recordMovement` in addition would
 * double-post the cash side of the sale, not just reintroduce a numbering
 * bug. (v1 actually does post this twice, once from `JournalSaleConsumer` and
 * once from `PosCashSaleConsumer` → `CashReceiptsService.createAndPostInternal`
 * → `CashService.recordMovement` — a pre-existing, undocumented double-post in
 * v1 itself, out of scope for this epic; see A-26.) So the ledger side of this
 * step writes only the bare row: balance update + `CashMovementEntity` insert,
 * nothing that touches `journal_entries`.
 *
 * It does then write a Phiếu thu, but **voucher-only**: `createVoucherForMovement`
 * inserts the `cash_receipts` document and its line, linking the movement above and
 * the entry `post-journal` already posted. No second movement, no second journal
 * entry — the invariant "one sale, one journal entry" survives. Without this the
 * money lands in the till with no document behind it, which is what v2 did until
 * `checkout-voucher-party`.
 *
 * The number comes from `mintDocumentNumber(manager, ...)`, never
 * `DocumentNumberingService.generate`: that one opens its own SERIALIZABLE
 * transaction, so a checkout that later rolls back would still have burned a Phiếu
 * thu number.
 *
 * `allowNegative` guard is not checked here on purpose: every payment this
 * step processes is a CASH line already counted as `totalPaid` by
 * `compute-totals`, so it can only ever increase the fund's balance — a
 * deposit can never be the thing that drives a fund negative.
 */
@Injectable()
export class PostCashStep implements CheckoutStep {
  readonly name = 'post-cash';
  readonly phase = 'transactional' as const;

  constructor(private readonly cashReceipts: CashReceiptsService) {}

  async execute(ctx: CheckoutContext): Promise<void> {
    if (ctx.replayed) return;

    const manager = requireManager(ctx, this.name);
    const invoice = ctx.invoice;
    const funds = ctx.funds;
    const accounts = ctx.accounts;
    if (!invoice || !funds || !accounts) {
      throw new Error(
        'post-cash ran before its prerequisite steps populated the context',
      );
    }

    const cashPayments = ctx.input.payments.filter(
      (p) => p.paymentMethod === InvoicePaymentMethod.CASH,
    );
    if (cashPayments.length === 0) return;

    if (!funds.cashAccountId) {
      // resolve-funds resolves cashAccountId whenever a CASH line is present
      // (preflight) — reaching here would mean that guard regressed.
      throw new Error(
        'post-cash: a CASH payment exists but resolve-funds did not resolve a cashAccountId',
      );
    }

    const cashAccountRepo = manager.getRepository(CashAccountEntity);
    const cashAccount = await manager
      .createQueryBuilder(CashAccountEntity, 'ca')
      .setLock('pessimistic_write')
      .where('ca.id = :id', { id: funds.cashAccountId })
      .getOne();
    if (!cashAccount) {
      throw new Error(
        `post-cash: cash account ${funds.cashAccountId} not found`,
      );
    }

    const movementRepo = manager.getRepository(CashMovementEntity);
    const movements = cashPayments.map((payment) =>
      movementRepo.create({
        cashAccountId: cashAccount.id,
        type: CashMovementType.DEPOSIT,
        amount: Number(payment.amount),
        reference: invoice.id,
        notes: `POS sale ${ctx.documentNumber}`,
        organizationId: ctx.actor.organizationId,
        branchId: ctx.actor.branchId,
        createdBy: ctx.actor.userId,
      }),
    );

    const totalCash = cashPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    cashAccount.balance = Number(cashAccount.balance) + totalCash;

    await cashAccountRepo.save(cashAccount);
    const savedMovements = await movementRepo.save(movements);

    if (!ctx.journalEntryId) {
      throw new Error(
        'post-cash ran before its prerequisite steps populated the context',
      );
    }

    const documentNumber = await mintDocumentNumber(
      manager,
      DocumentType.CASH_RECEIPT,
      ctx.actor.branchId,
      ctx.actor,
      // ADR-06: v1 auto-creates this rule on first use, so an organisation that has never
      // issued a Phiếu thu has none. Throwing here would cost the sale, not just the document.
      { ensureDefault: true },
    );
    const party = await buildPosInvoiceParty(
      manager,
      invoice.id,
      ctx.actor.organizationId,
    );

    const { voucherId } = await this.cashReceipts.createVoucherForMovement(
      {
        documentNumber,
        // One receipt per invoice for the summed CASH lines (ADR-05), so it can only link
        // one movement. Every POS invoice today has a single cash line (A-06); with two,
        // the document still totals both and points at the first movement.
        cashMovementId: savedMovements[0].id,
        journalEntryId: ctx.journalEntryId,
        purpose: CashReceiptPurpose.POS_SALE,
        cashAccountId: cashAccount.id,
        contraAccountId: accounts.revenueAccountId,
        amount: totalCash,
        referenceType: CashReceiptReferenceType.INVOICE,
        referenceId: invoice.id,
        reason: `POS sale ${ctx.documentNumber}`,
        description: `POS sale ${ctx.documentNumber}`,
        partnerType: party.partnerType,
        partnerId: party.partnerId,
        partnerName: party.partnerName,
        partnerAddress: party.partnerAddress,
        payerName: party.personName,
        staffId: party.staffId,
        actor: ctx.actor,
      },
      manager,
    );
    ctx.cashReceiptId = voucherId;
  }
}
