import { Injectable } from '@nestjs/common';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { NotificationLookupService } from '../core/lookup/notification-lookup.service';
import type {
  BuiltNotification,
  EventNotificationDefinition,
  NotificationContext,
} from '../core/notification.types';

/** Payload of `erp.sale.posted` — both checkout paths (v1 service, v2 saga outbox). */
export interface SalePostedPayload {
  invoiceId: string;
  documentNumber: string;
  totalAmount: number;
  actorId?: string;
}

/**
 * "Hoá đơn" — a POS sale was checked out.
 *
 * Fires on SALE_POSTED, i.e. at checkout, NOT when the draft is created: the
 * draft has a temporary code and may never be paid.
 */
@Injectable()
export class InvoiceNotificationDefinition implements EventNotificationDefinition<SalePostedPayload> {
  readonly type = 'invoice';
  readonly trigger = { kind: 'event', topic: ERP_TOPICS.SALE_POSTED } as const;
  readonly permissions = ['pos.invoice.read'];
  readonly excludeActor = false;
  readonly targetApps = ['erp_manager'] as const;
  readonly channels = ['fcm_push', 'websocket'] as const;
  readonly priority = 'high' as const;
  readonly defaultEnabled = true;

  constructor(private readonly lookup: NotificationLookupService) {}

  async build(ctx: NotificationContext<SalePostedPayload>): Promise<BuiltNotification | null> {
    const { invoiceId, documentNumber, totalAmount } = ctx.payload ?? ({} as SalePostedPayload);
    if (!invoiceId) return null;

    const [actor, store] = await Promise.all([
      this.lookup.userName(ctx.actorId),
      this.lookup.branchName(ctx.branchId),
    ]);

    return {
      data: {
        code: documentNumber ?? null,
        amount: Number(totalAmount ?? 0),
        actor,
        store,
      },
      target: { type: 'invoice', id: invoiceId },
    };
  }
}
