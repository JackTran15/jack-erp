import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DomainEventType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

/**
 * Payload for a non-cash POS payment line that may land in a deposit fund. The
 * consumer (PosDepositSaleConsumer) derives the fund from `resolvedAccountId` (the COA
 * already on invoice_payments) and posts the movement; routing is NOT done at checkout.
 */
export interface DepositMovementFromPaymentPayload {
  invoiceId: string;
  invoicePaymentId: string;
  invoiceCode: string;
  paymentMethod: string;
  /** COA already resolved onto the payment line (invoice_payments.account_id). */
  resolvedAccountId: string;
  contraAccountId: string;
  amount: number;
  docDate: string;
  branchId?: string;
  organizationId: string;
  actorId: string;
}

export interface DepositMovementFromPaymentInput {
  invoiceId: string;
  invoicePaymentId: string;
  invoiceCode: string;
  paymentMethod: string;
  resolvedAccountId: string;
  contraAccountId: string;
  amount: number;
  docDate: string;
  branchId?: string;
}

@Injectable()
export class DepositFromPaymentPublisher {
  private readonly logger = new Logger(DepositFromPaymentPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publish(
    input: DepositMovementFromPaymentInput,
    actor: ActorContext,
  ): Promise<void> {
    await this.eventPublisher.publish(
      ERP_TOPICS.DEPOSIT_VOUCHER_NEEDED_POS_SALE,
      {
        eventId: uuid(),
        eventType: DomainEventType.DEPOSIT_MOVEMENT_FROM_PAYMENT_REQUESTED,
        timestamp: new Date().toISOString(),
        organizationId: actor.organizationId,
        branchId: input.branchId,
        correlationId: input.invoiceId,
        payload: {
          invoiceId: input.invoiceId,
          invoicePaymentId: input.invoicePaymentId,
          invoiceCode: input.invoiceCode,
          paymentMethod: input.paymentMethod,
          resolvedAccountId: input.resolvedAccountId,
          contraAccountId: input.contraAccountId,
          amount: Number(input.amount),
          docDate: input.docDate,
          branchId: input.branchId,
          organizationId: actor.organizationId,
          actorId: actor.userId,
        } satisfies DepositMovementFromPaymentPayload,
      },
      input.invoicePaymentId,
    );

    this.logger.log(
      `Published deposit-from-payment event for invoice ${input.invoiceCode} (line=${input.invoicePaymentId})`,
    );
  }
}
