import { Injectable } from '@nestjs/common';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { NotificationLookupService } from '../core/lookup/notification-lookup.service';
import type {
  BuiltNotification,
  EventNotificationDefinition,
  NotificationContext,
} from '../core/notification.types';

/** Payload of `erp.return.posted` (`ReturnPostedPublisher`). Carries NO amount. */
export interface ReturnPostedPayload {
  returnInvoiceId: string;
  returnInvoiceCode: string;
  type: 'RETURN' | 'EXCHANGE' | string;
  actorId?: string;
}

/**
 * "Đổi trả" — a return / exchange invoice was checked out (not when drafted).
 *
 * The amount is read back from the invoice instead of widening the payload:
 * the POS module stays untouched and the event stays small.
 * RETURN → refunded amount; EXCHANGE → |net| (the difference that changed hands).
 */
@Injectable()
export class InvoiceReturnNotificationDefinition implements EventNotificationDefinition<ReturnPostedPayload> {
  readonly type = 'invoice_return';
  readonly trigger = { kind: 'event', topic: ERP_TOPICS.RETURN_POSTED } as const;
  readonly permissions = ['pos.invoice.read'];
  readonly excludeActor = false;
  readonly targetApps = ['erp_manager'] as const;
  readonly channels = ['fcm_push', 'websocket'] as const;
  readonly priority = 'high' as const;
  readonly defaultEnabled = true;

  constructor(private readonly lookup: NotificationLookupService) {}

  async build(ctx: NotificationContext<ReturnPostedPayload>): Promise<BuiltNotification | null> {
    const invoiceId = ctx.payload?.returnInvoiceId;
    if (!invoiceId) return null;

    const [invoice, actor, store] = await Promise.all([
      this.lookup.invoiceAmounts(invoiceId),
      this.lookup.userName(ctx.actorId),
      this.lookup.branchName(ctx.branchId),
    ]);
    const amount =
      invoice?.type === 'EXCHANGE' ? Math.abs(invoice.netAmount) : (invoice?.refundedAmount ?? null);

    return {
      data: {
        code: ctx.payload.returnInvoiceCode ?? invoice?.code ?? null,
        amount,
        actor,
        store,
      },
      target: { type: 'invoice', id: invoiceId },
    };
  }
}
