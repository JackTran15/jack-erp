import { Injectable } from '@nestjs/common';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { NotificationLookupService } from '../core/lookup/notification-lookup.service';
import type {
  BuiltNotification,
  EventNotificationDefinition,
  NotificationContext,
} from '../core/notification.types';
import { GOODS_RECEIPT_PURCHASE, GoodsReceiptPostedPayload, STOCK_DOCUMENT_SLUG } from './stock-document.payloads';

/**
 * "Nhập kho" — a goods receipt that is NOT a purchase (OTHER, TRANSFER_IN) was posted.
 *
 * Known gap: stock-take receipts are written straight to the
 * table without GOODS_RECEIPT_POSTED, so they produce no notification.
 */
@Injectable()
export class StockInNotificationDefinition implements EventNotificationDefinition<GoodsReceiptPostedPayload> {
  readonly type = 'stock_in';
  readonly trigger = { kind: 'event', topic: ERP_TOPICS.GOODS_RECEIPT_POSTED } as const;
  readonly permissions = ['goods_receipt.read'];
  readonly excludeActor = false;
  readonly targetApps = ['erp_manager'] as const;
  readonly channels = ['fcm_push', 'websocket'] as const;
  readonly priority = 'high' as const;
  readonly defaultEnabled = true;

  constructor(private readonly lookup: NotificationLookupService) {}

  actorIdOf(payload: GoodsReceiptPostedPayload): string | undefined {
    return payload?.postedBy;
  }

  shouldSend(ctx: NotificationContext<GoodsReceiptPostedPayload>): boolean {
    return Boolean(ctx.payload?.purpose) && ctx.payload.purpose !== GOODS_RECEIPT_PURCHASE;
  }

  async build(ctx: NotificationContext<GoodsReceiptPostedPayload>): Promise<BuiltNotification | null> {
    const receiptId = ctx.payload?.receiptId;
    if (!receiptId) return null;

    const [actor, store] = await Promise.all([
      this.lookup.userName(ctx.actorId),
      this.lookup.branchName(ctx.branchId),
    ]);

    return {
      data: { code: ctx.payload.documentNumber ?? null, amount: Number(ctx.payload.totalAmount ?? 0), actor, store },
      target: { type: 'stock_document', id: receiptId, slug: STOCK_DOCUMENT_SLUG.stockIn, branchId: ctx.branchId },
    };
  }
}
