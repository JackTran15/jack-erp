import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DomainEventType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

export interface InvoiceCancelledItem {
  itemId: string;
  locationId: string;
  quantity: number;
}

/**
 * One refund leg of a cancelled invoice: the money actually collected into a
 * single fund, ready to be paid back out of it.
 *
 * The accounting module never reads `pos` tables, so the cancel path resolves
 * the fund and the contra account here and ships them on the event; the voucher
 * consumers only compose services (see ADR-01).
 *
 * Legs are grouped per destination fund, not per payment line — several tendered
 * lines landing in the same fund produce a single leg, and therefore a single
 * refund voucher.
 */
export interface InvoiceCancelledRefundLeg {
  /** The `invoice_payments` rows folded into this leg. */
  invoicePaymentIds: string[];
  fundKind: 'CASH' | 'DEPOSIT';
  /** `cash_accounts.id` of the branch fund. CASH legs only. */
  cashAccountId?: string;
  /** `deposit_accounts.id` (or the COA it was resolved from). DEPOSIT legs only. */
  depositAccountId?: string;
  /** Amount actually collected into this fund — never the invoice total. */
  amount: number;
  /** Revenue COA, the contra side of the refund movement. */
  contraAccountId: string;
}

export interface InvoiceCancelledPayload {
  invoiceId: string;
  documentNumber: string;
  reason: string;
  branchId?: string;
  items: InvoiceCancelledItem[];
  organizationId: string;
  actorId: string;
  /**
   * Empty when nothing was ever collected (a pure debt invoice), and absent
   * entirely on events published before refunds existed — consumers must read
   * it as `refunds ?? []`.
   */
  refunds?: InvoiceCancelledRefundLeg[];
}

export interface InvoiceCancelledInput {
  invoiceId: string;
  documentNumber: string;
  reason: string;
  branchId?: string;
  items: InvoiceCancelledItem[];
  refunds: InvoiceCancelledRefundLeg[];
}

@Injectable()
export class InvoiceCancelledPublisher {
  private readonly logger = new Logger(InvoiceCancelledPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publish(input: InvoiceCancelledInput, actor: ActorContext): Promise<void> {
    await this.eventPublisher.publish(
      ERP_TOPICS.INVOICE_CANCELLED,
      {
        eventId: uuid(),
        eventType: DomainEventType.INVOICE_CANCELLED,
        timestamp: new Date().toISOString(),
        organizationId: actor.organizationId,
        branchId: input.branchId,
        correlationId: input.invoiceId,
        payload: {
          invoiceId: input.invoiceId,
          documentNumber: input.documentNumber,
          reason: input.reason,
          branchId: input.branchId,
          items: input.items,
          organizationId: actor.organizationId,
          actorId: actor.userId,
          refunds: input.refunds,
        } satisfies InvoiceCancelledPayload,
      },
      input.invoiceId,
    );

    this.logger.log(
      `Published invoice cancelled event for ${input.invoiceId} ` +
        `(${input.items.length} items, ${input.refunds.length} refund leg(s))`,
    );
  }
}
