import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import {
  CashMovementFromPaymentPayload,
  CashVoucherCreatedPayload,
  DomainEvent,
  DomainEventType,
} from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../../events/decorators/on-event.decorator';
import { EventPublisher } from '../../../events/event-publisher.service';
import { CashReceiptsService } from '../cash-receipts/cash-receipts.service';
import { CashReceiptPurpose, CashReceiptReferenceType } from '../enums';

/**
 * POS cash sale → Phiếu thu. POS keeps the "consumer creates everything" model:
 * `createAndPostInternal` writes the cash movement + journal entry + voucher
 * atomically (the JE is a plain DR cash / CR revenue, so there's no source-side
 * accounting to compose with). Idempotency is handled by EventConsumerManager
 * (processed_events) and the unique reference index.
 */
@Injectable()
export class PosCashSaleConsumer {
  private readonly logger = new Logger(PosCashSaleConsumer.name);

  constructor(
    private readonly cashReceiptsService: CashReceiptsService,
    private readonly eventPublisher: EventPublisher,
  ) {}

  @OnDomainEvent(ERP_TOPICS.CASH_VOUCHER_NEEDED_POS_SALE)
  async handle(
    event: DomainEvent<CashMovementFromPaymentPayload>,
  ): Promise<void> {
    const {
      invoiceId,
      invoiceCode,
      cashAccountId,
      contraAccountId,
      amount,
      organizationId,
      branchId,
      actorId,
    } = event.payload;

    const result = await this.cashReceiptsService.createAndPostInternal({
      purpose: CashReceiptPurpose.POS_SALE,
      cashAccountId,
      contraAccountId,
      amount,
      referenceType: CashReceiptReferenceType.INVOICE,
      referenceId: invoiceId,
      reason: `POS sale ${invoiceCode}`,
      description: `POS sale ${invoiceCode}`,
      actor: { userId: actorId, organizationId, branchId, roles: [] },
    });

    await this.publishCreated(event, {
      sourceType: 'POS_SALE',
      sourceId: invoiceId,
      voucherKind: 'CASH_RECEIPT',
      voucherId: result.voucherId,
      voucherNumber: result.voucherNumber,
      journalEntryId: result.journalEntryId,
      cashMovementId: result.cashMovementId,
      organizationId,
      branchId,
    });

    this.logger.log(
      `POS cash sale ${invoiceCode} → ${result.voucherNumber} (receipt=${result.voucherId})`,
    );
  }

  private async publishCreated(
    source: DomainEvent<unknown>,
    payload: CashVoucherCreatedPayload,
  ): Promise<void> {
    await this.eventPublisher.publish(ERP_TOPICS.CASH_VOUCHER_CREATED, {
      eventId: uuid(),
      eventType: DomainEventType.CASH_VOUCHER_CREATED,
      timestamp: new Date().toISOString(),
      organizationId: payload.organizationId,
      branchId: payload.branchId,
      correlationId: source.correlationId ?? uuid(),
      payload,
    });
  }
}
