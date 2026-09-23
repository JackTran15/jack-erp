import { Injectable } from '@nestjs/common';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { NotificationLookupService } from '../core/lookup/notification-lookup.service';
import type {
  BuiltNotification,
  EventNotificationDefinition,
  NotificationContext,
} from '../core/notification.types';

/** Payload of `erp.invoice.cancelled` (`InvoiceCancelledPublisher`) — the fields used here. */
export interface InvoiceCancelledPayload {
  invoiceId: string;
  documentNumber: string;
  reason?: string;
  actorId?: string;
}

/**
 * "Huỷ hoá đơn" — a sale OR a return/exchange invoice was cancelled (both go
 * through the same topic). The template does not mention the amount, but it is
 * stored in `data` so the in-app list can show it later without a migration.
 */
@Injectable()
export class InvoiceCancelNotificationDefinition implements EventNotificationDefinition<InvoiceCancelledPayload> {
  readonly type = 'invoice_cancel';
  readonly trigger = { kind: 'event', topic: ERP_TOPICS.INVOICE_CANCELLED } as const;
  readonly permissions = ['pos.invoice.read'];
  readonly excludeActor = false;
  readonly targetApps = ['erp_manager'] as const;
  readonly channels = ['fcm_push', 'websocket'] as const;
  readonly priority = 'high' as const;
  readonly defaultEnabled = true;

  constructor(private readonly lookup: NotificationLookupService) {}

  async build(ctx: NotificationContext<InvoiceCancelledPayload>): Promise<BuiltNotification | null> {
    const invoiceId = ctx.payload?.invoiceId;
    if (!invoiceId) return null;

    const [invoice, actor, store] = await Promise.all([
      this.lookup.invoiceAmounts(invoiceId),
      this.lookup.userName(ctx.actorId),
      this.lookup.branchName(ctx.branchId),
    ]);

    return {
      data: {
        code: ctx.payload.documentNumber ?? invoice?.code ?? null,
        amount: invoice?.amountDue ?? null,
        actor,
        store,
      },
      target: { type: 'invoice', id: invoiceId },
    };
  }
}
