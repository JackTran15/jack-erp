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
import { CashPaymentsService } from '../cash-payments/cash-payments.service';
import {
  CashPaymentPurpose,
  CashPaymentReferenceType,
  CashVoucherPartnerType,
} from '../enums';
import { CashVoucherCategoryResolverService } from '../shared/category-resolver.service';

/** Goods receipt paid in cash → Phiếu chi (PURCHASE), linking movement + JE. */
@Injectable()
export class GoodsReceiptCashConsumer {
  private readonly logger = new Logger(GoodsReceiptCashConsumer.name);

  constructor(
    private readonly cashPaymentsService: CashPaymentsService,
    private readonly categoryResolver: CashVoucherCategoryResolverService,
    private readonly eventPublisher: EventPublisher,
  ) {}

  @OnDomainEvent(ERP_TOPICS.CASH_VOUCHER_NEEDED_GOODS_RECEIPT)
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
      p.categoryCode ?? 'CHI_MUA_HANG',
    );

    const result = await this.cashPaymentsService.createVoucherForMovement({
      cashMovementId: p.cashMovementId,
      journalEntryId: p.journalEntryId,
      purpose: CashPaymentPurpose.PURCHASE,
      cashAccountId: p.cashAccountId,
      contraAccountId: p.contraAccountId,
      amount: p.amount,
      referenceType: CashPaymentReferenceType.GOODS_RECEIPT,
      referenceId: p.sourceId,
      partnerType: p.partnerType as CashVoucherPartnerType | undefined,
      partnerId: p.partnerId,
      partnerName: p.partnerName,
      description: p.description ?? 'Chi mua hàng',
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
        sourceType: 'GOODS_RECEIPT',
        sourceId: p.sourceId,
        voucherKind: 'CASH_PAYMENT',
        voucherId: result.voucherId,
        voucherNumber: result.voucherNumber,
        journalEntryId: p.journalEntryId,
        cashMovementId: p.cashMovementId,
        organizationId: p.organizationId,
        branchId: p.branchId,
      } satisfies CashVoucherCreatedPayload,
    });

    this.logger.log(
      `Goods receipt ${p.sourceId} → ${result.voucherNumber} (payment=${result.voucherId})`,
    );
  }
}
