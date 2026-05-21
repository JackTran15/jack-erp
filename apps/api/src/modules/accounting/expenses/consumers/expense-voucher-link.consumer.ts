import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashVoucherCreatedPayload, DomainEvent } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../../events/decorators/on-event.decorator';
import { ExpenseEntity } from '../expense.entity';

/** Back-fills expenses.cash_payment_id when its auto Phiếu chi is created. */
@Injectable()
export class ExpenseVoucherLinkConsumer {
  private readonly logger = new Logger(ExpenseVoucherLinkConsumer.name);

  constructor(
    @InjectRepository(ExpenseEntity)
    private readonly expenseRepo: Repository<ExpenseEntity>,
  ) {}

  // Distinct group so this consumer receives EVERY cash.voucher.created event
  // (it filters by sourceType). Sharing the default group with the other
  // link-back consumers would split events across them and lose link-backs.
  @OnDomainEvent(ERP_TOPICS.CASH_VOUCHER_CREATED, {
    groupId: 'erp-api.expense-voucher-link',
  })
  async handle(event: DomainEvent<CashVoucherCreatedPayload>): Promise<void> {
    const p = event.payload;
    if (p.sourceType !== 'EXPENSE') return;

    await this.expenseRepo.update(
      { id: p.sourceId, organizationId: p.organizationId },
      { cashPaymentId: p.voucherId },
    );
    this.logger.log(
      `Linked expense ${p.sourceId} → cash payment ${p.voucherId}`,
    );
  }
}
