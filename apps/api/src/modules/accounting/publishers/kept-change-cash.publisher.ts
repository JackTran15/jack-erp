import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DomainEventType, KeptChangeCashPayload } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

export interface KeptChangeCashInput {
  invoiceId: string;
  invoiceCode: string;
  cashAccountId: string;
  amount: number;
  branchId?: string;
}

/**
 * Publishes the cash a customer left behind at POS checkout. The consumer creates
 * the movement + JE + Phiếu thu; the contra account (thu nhập khác) is resolved
 * there from the voucher purpose, so a checkout never fails on that config.
 */
@Injectable()
export class KeptChangeCashPublisher {
  private readonly logger = new Logger(KeptChangeCashPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publish(
    input: KeptChangeCashInput,
    actor: ActorContext,
  ): Promise<void> {
    await this.eventPublisher.publish(
      ERP_TOPICS.CASH_VOUCHER_NEEDED_KEPT_CHANGE,
      {
        eventId: uuid(),
        eventType: DomainEventType.CASH_VOUCHER_NEEDED_KEPT_CHANGE,
        timestamp: new Date().toISOString(),
        organizationId: actor.organizationId,
        branchId: input.branchId,
        correlationId: input.invoiceId,
        payload: {
          invoiceId: input.invoiceId,
          invoiceCode: input.invoiceCode,
          cashAccountId: input.cashAccountId,
          amount: Number(input.amount),
          branchId: input.branchId,
          organizationId: actor.organizationId,
          actorId: actor.userId,
        } satisfies KeptChangeCashPayload,
      },
      input.cashAccountId,
    );

    this.logger.log(
      `Published kept-change event for invoice ${input.invoiceCode} (amount=${input.amount})`,
    );
  }
}
