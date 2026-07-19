import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DataSource } from 'typeorm';
import {
  DomainEvent,
  DomainEventType,
  DepositMovementType,
  DepositMovementSource,
  TargetFund,
} from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { OnDomainEvent } from '../../../events/decorators/on-event.decorator';
import { EventPublisher } from '../../../events/event-publisher.service';
import { DepositService } from '../deposit.service';
import { DepositRoutingService } from '../deposit-routing.service';
import { DepositFeeService } from '../../deposit-fee/deposit-fee.service';
import { DepositPeriodGuardService, toYearMonth } from '../../deposit-period-lock/deposit-period-guard.service';
import { DepositAuditAction, DepositAuditEntityType } from '../../deposit-audit/deposit-audit-log.entity';
import { DepositAuditService } from '../../deposit-audit/deposit-audit.service';
import { DepositMovementFromPaymentPayload } from '../deposit-from-payment.publisher';

/** True for a Postgres unique-violation (23505), the deposit double-post guard. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; driverError?: { code?: string } };
  return e?.code === '23505' || e?.driverError?.code === '23505';
}

/** `docDate` (YYYY-MM-DD) + settlement_days → value_date (R2, TKT-DFR-04). */
function addDaysToDateString(docDate: string, days: number): string {
  if (!days) return docDate;
  const d = new Date(`${docDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * POS non-cash sale → deposit movement. Derives the deposit fund from the payment line's
 * resolved COA (FR-02 / DepositRoutingService); a line whose COA maps to no deposit fund is
 * skipped. createAndPostInternal writes the movement + BANK_MOVEMENT journal entry atomically;
 * idempotency is guarded by EventConsumerManager (processed_events) and the payment-line
 * unique index — a concurrent duplicate (23505) is swallowed as a no-op replay (BR-POS-01).
 */
@Injectable()
export class PosDepositSaleConsumer {
  private readonly logger = new Logger(PosDepositSaleConsumer.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly depositService: DepositService,
    private readonly depositRouting: DepositRoutingService,
    private readonly depositFee: DepositFeeService,
    private readonly periodGuard: DepositPeriodGuardService,
    private readonly audit: DepositAuditService,
    private readonly eventPublisher: EventPublisher,
  ) {}

  @OnDomainEvent(ERP_TOPICS.DEPOSIT_VOUCHER_NEEDED_POS_SALE)
  async handle(
    event: DomainEvent<DepositMovementFromPaymentPayload>,
  ): Promise<void> {
    const {
      invoiceId,
      invoicePaymentId,
      invoiceCode,
      paymentMethod,
      resolvedAccountId,
      depositAccountId: explicitDepositAccountId,
      contraAccountId,
      amount,
      docDate,
      organizationId,
      branchId,
      actorId,
    } = event.payload;

    if (!branchId) return;
    const actor = { userId: actorId, organizationId, branchId, roles: [] };

    const target = await this.depositRouting.resolveDepositTarget(
      {
        paymentMethod,
        cardType: null,
        resolvedAccountId,
        branchId,
        docDate,
        explicitDepositAccountId,
      },
      actor,
    );
    if (target.fund !== TargetFund.DEPOSIT || !target.depositAccountId) {
      // COA maps to no deposit fund — nothing to record here.
      return;
    }
    const depositAccountId = target.depositAccountId;

    // R1 (fee) + R2 (value-date) are computed up front so the gross movement
    // carries its final fee_amount/net_amount/value_date from the single
    // insert — no follow-up UPDATE.
    const { feeAmount, netAmount } = this.depositFee.computeFee(
      Number(amount),
      target.feeRate,
      target.feeBearer,
    );
    const valueDate = addDaysToDateString(docDate, target.settlementDays ?? 0);

    // BR-LOCK-02/BR-POS-04: a late-arriving POS sale landing on a locked
    // period must not be lost — alert + audit, then re-throw so the existing
    // DLQ machinery (retry ×3 → dead-letter) queues it for later replay once
    // the period is unlocked, rather than silently dropping the event.
    try {
      await this.periodGuard.assertNotLocked(branchId, docDate);
    } catch (err) {
      if (err instanceof ConflictException) {
        await this.handleLockedPeriod(invoiceId, invoiceCode, docDate, actor);
      }
      throw err;
    }

    try {
      const res = await this.dataSource.transaction(async (manager) => {
        const created = await this.depositService.createAndPostInternal(
          {
            depositAccountId,
            type: DepositMovementType.DEPOSIT,
            amount: Number(amount),
            feeAmount,
            netAmount,
            valueDate,
            contraAccountId,
            source: DepositMovementSource.POS_INVOICE,
            sourceRefId: invoiceId,
            sourceRefLineId: invoicePaymentId,
            docDate,
            documentNumber: invoiceCode,
          },
          actor,
          manager,
        );
        // Only post the fee leg for a genuinely new movement — a replay means
        // both legs (or neither) were already committed by the first delivery.
        if (!created.replayed && feeAmount > 0) {
          await this.depositFee.postFee(created.movement, feeAmount, actor, manager);
        }
        return created;
      });
      this.logger.log(
        `POS deposit sale ${invoiceCode} line ${invoicePaymentId} → movement ${res.movement.id}${res.replayed ? ' (replayed)' : ''}`,
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        this.logger.log(
          `POS deposit sale ${invoiceCode} line ${invoicePaymentId} already recorded — no-op`,
        );
        return;
      }
      throw err;
    }
  }

  private async handleLockedPeriod(
    invoiceId: string,
    invoiceCode: string,
    docDate: string,
    actor: ActorContext,
  ): Promise<void> {
    this.logger.warn(
      `POS deposit sale ${invoiceCode} (invoice ${invoiceId}) landed on locked period ${toYearMonth(docDate)} — alerting and deferring to DLQ (BR-LOCK-02)`,
    );
    await this.audit.record(
      {
        entityType: DepositAuditEntityType.DEPOSIT_MOVEMENT,
        entityId: invoiceId,
        action: DepositAuditAction.POS_LATE_LOCKED,
        after: { invoiceId, invoiceCode, docDate },
      },
      actor,
    );
    await this.eventPublisher.publish(ERP_TOPICS.DEPOSIT_LOCKED_PERIOD_BLOCKED, {
      eventId: uuid(),
      eventType: DomainEventType.DEPOSIT_LOCKED_PERIOD_BLOCKED,
      timestamp: new Date().toISOString(),
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      correlationId: invoiceId,
      payload: { invoiceId, invoiceCode, docDate, period: toYearMonth(docDate) },
    });
  }
}
