import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashVoucherCreatedPayload, DomainEvent } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../events/decorators/on-event.decorator';
import { DebtPaymentEntity } from '../entities/debt-payment.entity';

/** Back-fills debt_payments.cash_receipt_id when its auto Phiếu thu is created. */
@Injectable()
export class DebtPaymentVoucherLinkConsumer {
  private readonly logger = new Logger(DebtPaymentVoucherLinkConsumer.name);

  constructor(
    @InjectRepository(DebtPaymentEntity)
    private readonly paymentRepo: Repository<DebtPaymentEntity>,
  ) {}

  // Distinct group so this consumer receives EVERY cash.voucher.created event.
  @OnDomainEvent(ERP_TOPICS.CASH_VOUCHER_CREATED, {
    groupId: 'erp-api.debt-payment-voucher-link',
  })
  async handle(event: DomainEvent<CashVoucherCreatedPayload>): Promise<void> {
    const p = event.payload;
    if (p.sourceType !== 'DEBT_PAYMENT') return;

    await this.paymentRepo.update(
      { id: p.sourceId, organizationId: p.organizationId },
      { cashReceiptId: p.voucherId },
    );
    this.logger.log(
      `Linked debt payment ${p.sourceId} → cash receipt ${p.voucherId}`,
    );
  }
}
