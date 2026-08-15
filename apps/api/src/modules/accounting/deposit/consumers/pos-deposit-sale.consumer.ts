import { ConflictException, forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DataSource, EntityManager } from 'typeorm';
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
import { BankReceiptsService } from '../../deposit-vouchers/bank-receipts/bank-receipts.service';
import {
  BankReceiptPurpose,
  BankReceiptReferenceType,
  BankVoucherPartnerType,
} from '../../deposit-vouchers/enums';
import { buildPosInvoiceParty } from '../../cash-vouchers/shared/voucher-party';
import { mintDocumentNumber } from '../../../pos/checkout-saga/application/steps/mint-document-number';
import { DocumentType } from '@erp/shared-interfaces';

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
    @Inject(forwardRef(() => BankReceiptsService))
    private readonly bankReceipts: BankReceiptsService,
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

        // Phiếu thu tiền gửi for the line, voucher-only: it links the movement and journal
        // entry written just above rather than posting its own. A replay skips it for the
        // same reason the fee leg does.
        if (!created.replayed) {
          await this.issueReceipt(
            manager,
            created.movement.id,
            created.journalEntryId,
            {
              invoiceId,
              invoiceCode,
              depositAccountId,
              contraAccountId,
              amount: Number(amount),
              docDate,
              actor,
            },
          );
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

  /**
   * Writes the Phiếu thu tiền gửi for one non-cash payment line.
   *
   * Number is minted through the consumer's own `manager` (with `ensureDefault`, ADR-06:
   * v1's `DocumentNumberingService.generate` auto-creates a missing rule, and an
   * organisation that has never issued one must not lose the sale over it), so a rollback
   * gives the number back. The party snapshot never throws — a deleted customer leaves the
   * fields blank rather than dead-lettering money already banked.
   */
  private async issueReceipt(
    manager: EntityManager,
    depositMovementId: string,
    journalEntryId: string,
    input: {
      invoiceId: string;
      invoiceCode: string;
      depositAccountId: string;
      contraAccountId: string;
      amount: number;
      docDate: string;
      actor: ActorContext;
    },
  ): Promise<void> {
    const documentNumber = await mintDocumentNumber(
      manager,
      DocumentType.BANK_RECEIPT,
      input.actor.branchId,
      input.actor,
      { ensureDefault: true },
    );
    const party = await buildPosInvoiceParty(
      manager,
      input.invoiceId,
      input.actor.organizationId,
    );

    const result = await this.bankReceipts.createVoucherForMovement(
      {
        documentNumber,
        depositMovementId,
        journalEntryId,
        purpose: BankReceiptPurpose.OTHER,
        depositAccountId: input.depositAccountId,
        contraAccountId: input.contraAccountId,
        amount: input.amount,
        docDate: input.docDate,
        referenceType: BankReceiptReferenceType.INVOICE,
        referenceId: input.invoiceId,
        description: `POS sale ${input.invoiceCode}`,
        // A-07: the two partner-type enums share their string members.
        partnerType: party.partnerType as unknown as BankVoucherPartnerType,
        partnerId: party.partnerId,
        partnerName: party.partnerName,
        partnerAddress: party.partnerAddress,
        payerName: party.personName,
        // Bank vouchers keep the staff member in collected_by, not staff_id.
        collectedBy: party.staffId,
        actor: input.actor,
      },
      manager,
    );

    this.logger.log(
      `POS deposit sale ${input.invoiceCode} → ${result.voucherNumber} (receipt=${result.voucherId})`,
    );
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
