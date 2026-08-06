import { Injectable } from '@nestjs/common';
import { InvoicePaymentMethod } from '../../../entities/invoice.entity';
import { CheckoutContext, CheckoutStep, requireManager } from '../checkout-step';
import { CashAccountEntity } from '../../../../accounting/cash/cash-account.entity';
import { CashMovementEntity, CashMovementType } from '../../../../accounting/cash/cash-movement.entity';

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
 * v1 itself, out of scope for this epic; see A-26.) So this step writes only
 * the bare ledger row: balance update + `CashMovementEntity` insert, nothing
 * that touches `journal_entries`. No `cash_receipts` (Phiếu thu) voucher
 * either — that is v1's own wrapper for a different purpose (standalone
 * receipt documents), not something every POS cash sale needs in v2.
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

  async execute(ctx: CheckoutContext): Promise<void> {
    if (ctx.replayed) return;

    const manager = requireManager(ctx, this.name);
    const invoice = ctx.invoice;
    const funds = ctx.funds;
    if (!invoice || !funds) {
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

    cashAccount.balance =
      Number(cashAccount.balance) +
      cashPayments.reduce((sum, p) => sum + Number(p.amount), 0);

    await cashAccountRepo.save(cashAccount);
    await movementRepo.save(movements);
  }
}
