import { Injectable } from '@nestjs/common';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { NotificationLookupService } from '../core/lookup/notification-lookup.service';
import type {
  BuiltNotification,
  EventNotificationDefinition,
  NotificationContext,
} from '../core/notification.types';

/** Payload of `erp.sales_order.sent` — `SalesOrderService.publishSent`. */
export interface SalesOrderSentPayload {
  salesOrderId: string;
  documentNumber: string;
  totalAmount: number;
  actorId?: string;
  /** Channel label frozen on the document — "Ứng dụng Tư Vấn", or a partner's. */
  channel?: string;
}

/**
 * "Đơn tư vấn" — a consultant sent an order to the cashier.
 *
 * Fires on SALES_ORDER_SENT, i.e. the DRAFT → SENT transition, not on the
 * draft: a draft has no cashier waiting on it and may never be sent.
 *
 * **First definition targeting `erp_sales`.** All eight others target
 * `erp_manager`, so before this one `GET /mobile/notifications?app=erp_sales`
 * returned an empty list — `NotificationInboxService` filters by
 * `registry.typesForApp(app)`.
 */
@Injectable()
export class SalesOrderNotificationDefinition implements EventNotificationDefinition<SalesOrderSentPayload> {
  readonly type = 'sales_order';
  readonly trigger = { kind: 'event', topic: ERP_TOPICS.SALES_ORDER_SENT } as const;

  /**
   * The cashier's "Nhận xử lý" key. Picking the permission rather than a role
   * is what keeps the consultant out: `SALES_PERMISSION_KEYS` has
   * `pos.sales-order.{read,create,cancel}` and stops there, while
   * `CASHIER_PERMISSION_KEYS` adds `approve` + `reject`.
   */
  readonly permissions = ['pos.sales-order.approve'];

  /**
   * **`true` — and this is the ONLY definition that says so.** The other eight
   * declare `false`, a deliberate reversal dated 23/09/2026 that
   * `event-definitions.spec.ts` locks, so the difference has to justify itself.
   *
   * It does: this is the first type where the actor is routinely also a
   * recipient. `CASHIER_PERMISSION_KEYS` holds BOTH `pos.sales-order.create`
   * and `pos.sales-order.approve`, so a cashier who sends an order would tell
   * themselves about it. And unlike "a manager posted an invoice" — worth
   * seeing in your own timeline — this notification says *there is work waiting
   * for you*, which the person who just created that work already knows.
   */
  readonly excludeActor = true;

  readonly targetApps = ['erp_sales'] as const;
  readonly channels = ['fcm_push', 'websocket'] as const;
  readonly priority = 'high' as const;
  readonly defaultEnabled = true;

  constructor(private readonly lookup: NotificationLookupService) {}

  async build(ctx: NotificationContext<SalesOrderSentPayload>): Promise<BuiltNotification | null> {
    const { salesOrderId, documentNumber, totalAmount, channel } = ctx.payload ?? ({} as SalesOrderSentPayload);
    if (!salesOrderId) return null;

    const actor = await this.lookup.userName(ctx.actorId);

    return {
      data: {
        code: documentNumber ?? null,
        // RAW number — the app formats it per locale. A string here would reach
        // `NumberFormat` as text and render NaN.
        amount: Number(totalAmount ?? 0),
        channel: channel ?? null,
        actor,
      },
      target: { type: 'sales_order', id: salesOrderId },
    };
  }
}
