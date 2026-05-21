import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashVoucherCreatedPayload, DomainEvent } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../../events/decorators/on-event.decorator';
import { GoodsReceiptEntity } from '../goods-receipt.entity';

/** Back-fills goods_receipts.cash_payment_id when its auto Phiếu chi is created. */
@Injectable()
export class GoodsReceiptVoucherLinkConsumer {
  private readonly logger = new Logger(GoodsReceiptVoucherLinkConsumer.name);

  constructor(
    @InjectRepository(GoodsReceiptEntity)
    private readonly receiptRepo: Repository<GoodsReceiptEntity>,
  ) {}

  // Distinct group so this consumer receives EVERY cash.voucher.created event.
  @OnDomainEvent(ERP_TOPICS.CASH_VOUCHER_CREATED, {
    groupId: 'erp-api.goods-receipt-voucher-link',
  })
  async handle(event: DomainEvent<CashVoucherCreatedPayload>): Promise<void> {
    const p = event.payload;
    if (p.sourceType !== 'GOODS_RECEIPT') return;

    await this.receiptRepo.update(
      { id: p.sourceId, organizationId: p.organizationId },
      { cashPaymentId: p.voucherId },
    );
    this.logger.log(
      `Linked goods receipt ${p.sourceId} → cash payment ${p.voucherId}`,
    );
  }
}
