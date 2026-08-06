import { Injectable } from '@nestjs/common';
import { DepositMovementType, DepositMovementSource } from '@erp/shared-interfaces';
import { InvoicePaymentMethod } from '../../../entities/invoice.entity';
import { CheckoutContext, CheckoutStep, requireManager } from '../checkout-step';
import { DepositAccountEntity } from '../../../../accounting/deposit/deposit-account.entity';
import { DepositMovementEntity } from '../../../../accounting/deposit/deposit-movement.entity';
import { DepositPeriodGuardService } from '../../../../accounting/deposit-period-lock/deposit-period-guard.service';

/**
 * Records one `deposit_movements` row per non-CASH payment line whose
 * resolved COA maps to a deposit fund, inline, in the checkout transaction.
 * Parity target: `pos-deposit-sale.consumer.ts`.
 *
 * `depositAccountId` comes straight from `resolve-accounts` (preflight) —
 * `ctx.accounts.perPayment[idx].depositAccountId`, already resolved via
 * `payment_accounts.deposit_account_id`. A line with no `depositAccountId`
 * maps to no deposit fund and is skipped, same as the consumer's own
 * `DepositRoutingService.resolveDepositTarget` check — no need to re-derive
 * routing here, preflight already did it.
 *
 * Deliberately does NOT call `DepositService.createAndPostInternal` /
 * `recordMovement`. Same finding as `post-cash.step.ts` (A-26), traced one
 * layer further: `recordSingleAccountMovementInTx` also calls
 * `this.journalService.post(...)` internally — DR the deposit account's GL,
 * CR the contra/revenue account, exactly the pair `post-journal.step.ts`
 * (T-03-02) already posts for this same payment line. Calling it here would
 * double-post, on top of reintroducing the non-composable-numbering bug one
 * more time. This step writes only the bare `deposit_movements` ledger row.
 *
 * Fee computation (`DepositFeeService`) and settlement-delay (`valueDate` =
 * `docDate` + settlement days, R2/TKT-DFR-04) are not implemented — out of
 * this ticket's stated scope (A-27); `feeAmount` is always 0, `netAmount`
 * always equals `amount`, `valueDate` equals `docDate`.
 *
 * `DepositPeriodGuardService.assertNotLocked` stays in this step rather than
 * moving to preflight (the ticket's suggested-but-optional path): it already
 * accepts a `manager` and is cheap, and `resolve-funds.step.ts` (T-01-06,
 * already accepted) has no existing reason to know about deposit period
 * locks — adding one felt like a bigger amendment than the "fail slightly
 * later, but still inside a clean rollback" tradeoff justified.
 *
 * No unique-violation handling for `(source, sourceRefId, sourceRefLineId)`:
 * unlike the consumer (independently re-delivered by Kafka), this step only
 * ever runs once per real checkout attempt — the saga's own idempotency
 * (`open-saga` + `ctx.replayed`) is what prevents a second run, not this
 * step's own dedup. A unique-violation here would mean that guarantee broke,
 * which should surface as a hard failure, not be swallowed.
 */
@Injectable()
export class PostDepositStep implements CheckoutStep {
  readonly name = 'post-deposit';
  readonly phase = 'transactional' as const;

  constructor(private readonly periodGuard: DepositPeriodGuardService) {}

  async execute(ctx: CheckoutContext): Promise<void> {
    if (ctx.replayed) return;

    const manager = requireManager(ctx, this.name);
    const invoice = ctx.invoice;
    const accounts = ctx.accounts;
    const savedPayments = ctx.savedPayments;
    if (!invoice || !accounts || !savedPayments) {
      throw new Error(
        'post-deposit ran before its prerequisite steps populated the context',
      );
    }

    const docDate = new Date().toISOString().slice(0, 10);
    const depositRepo = manager.getRepository(DepositAccountEntity);
    const movementRepo = manager.getRepository(DepositMovementEntity);

    for (const [idx, payment] of ctx.input.payments.entries()) {
      if (payment.paymentMethod === InvoicePaymentMethod.CASH) continue;
      const depositAccountId = accounts.perPayment[idx].depositAccountId;
      if (!depositAccountId) continue; // COA maps to no deposit fund — nothing to record

      await this.periodGuard.assertNotLocked(invoice.branchId!, docDate, manager);

      const account = await manager
        .createQueryBuilder(DepositAccountEntity, 'da')
        .setLock('pessimistic_write')
        .where('da.id = :id', { id: depositAccountId })
        .getOne();
      if (!account) {
        throw new Error(`post-deposit: deposit account ${depositAccountId} not found`);
      }

      const amount = Number(payment.amount);
      account.balance = Number(account.balance) + amount;
      await depositRepo.save(account);

      await movementRepo.save(
        movementRepo.create({
          organizationId: ctx.actor.organizationId,
          branchId: ctx.actor.branchId!,
          depositAccountId: account.id,
          type: DepositMovementType.DEPOSIT,
          amount,
          feeAmount: 0,
          netAmount: amount,
          docDate,
          valueDate: docDate,
          source: DepositMovementSource.POS_INVOICE,
          sourceRefId: invoice.id,
          sourceRefLineId: savedPayments[idx].id,
          documentNumber: ctx.documentNumber,
          createdBy: ctx.actor.userId,
        }),
      );
    }
  }
}
