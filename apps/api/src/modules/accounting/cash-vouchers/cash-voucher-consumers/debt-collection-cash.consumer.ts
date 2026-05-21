import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import {
  CashVoucherNeededPayload,
  CashVoucherCreatedPayload,
  DomainEvent,
  DomainEventType,
} from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../../events/decorators/on-event.decorator';
import { EventPublisher } from '../../../events/event-publisher.service';
import { CashReceiptsService } from '../cash-receipts/cash-receipts.service';
import {
  CashReceiptPurpose,
  CashReceiptReferenceType,
  CashVoucherPartnerType,
} from '../enums';
import { CashVoucherCategoryResolverService } from '../shared/category-resolver.service';

/**
 * Debt collection paid in cash → Phiếu thu (DEBT_COLLECTION). The source already
 * committed movement + JE; this only creates the voucher document linking them.
 */
@Injectable()
export class DebtCollectionCashConsumer {
  private readonly logger = new Logger(DebtCollectionCashConsumer.name);

  constructor(
    private readonly cashReceiptsService: CashReceiptsService,
    private readonly categoryResolver: CashVoucherCategoryResolverService,
    private readonly eventPublisher: EventPublisher,
  ) {}

  @OnDomainEvent(ERP_TOPICS.CASH_VOUCHER_NEEDED_DEBT_PAYMENT)
  async handle(event: DomainEvent<CashVoucherNeededPayload>): Promise<void> {
    const p = event.payload;
    const actor = {
      userId: p.actorId,
      organizationId: p.organizationId,
      branchId: p.branchId,
      roles: [],
    };
    const categoryId = await this.categoryResolver.resolveId(
      p.organizationId,
      p.categoryCode ?? 'THU_NO_KH',
    );

    const result = await this.cashReceiptsService.createVoucherForMovement({
      cashMovementId: p.cashMovementId,
      journalEntryId: p.journalEntryId,
      purpose: CashReceiptPurpose.DEBT_COLLECTION,
      cashAccountId: p.cashAccountId,
      contraAccountId: p.contraAccountId,
      amount: p.amount,
      referenceType: CashReceiptReferenceType.INVOICE_DEBT,
      referenceId: p.sourceId,
      partnerType: p.partnerType as CashVoucherPartnerType | undefined,
      partnerId: p.partnerId,
      partnerName: p.partnerName,
      description: p.description ?? 'Thu nợ khách hàng',
      categoryId,
      actor,
    });

    await this.eventPublisher.publish(ERP_TOPICS.CASH_VOUCHER_CREATED, {
      eventId: uuid(),
      eventType: DomainEventType.CASH_VOUCHER_CREATED,
      timestamp: new Date().toISOString(),
      organizationId: p.organizationId,
      branchId: p.branchId,
      correlationId: event.correlationId ?? uuid(),
      payload: {
        sourceType: 'DEBT_PAYMENT',
        sourceId: p.sourceId,
        voucherKind: 'CASH_RECEIPT',
        voucherId: result.voucherId,
        voucherNumber: result.voucherNumber,
        journalEntryId: p.journalEntryId,
        cashMovementId: p.cashMovementId,
        organizationId: p.organizationId,
        branchId: p.branchId,
      } satisfies CashVoucherCreatedPayload,
    });

    this.logger.log(
      `Debt collection ${p.sourceId} → ${result.voucherNumber} (receipt=${result.voucherId})`,
    );
  }
}
