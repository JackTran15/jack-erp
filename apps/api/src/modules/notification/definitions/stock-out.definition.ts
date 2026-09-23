import { Injectable } from '@nestjs/common';
import type { GoodsIssuePostedPayload } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { NotificationLookupService } from '../core/lookup/notification-lookup.service';
import type {
  BuiltNotification,
  EventNotificationDefinition,
  NotificationContext,
} from '../core/notification.types';
import { STOCK_DOCUMENT_SLUG } from './stock-document.payloads';

/**
 * "Xuất kho" — a goods issue was posted (`GOODS_ISSUE_POSTED`, document-level;
 * NOT the per-ledger-line `stock.movement.posted`).
 */
@Injectable()
export class StockOutNotificationDefinition implements EventNotificationDefinition<GoodsIssuePostedPayload> {
  readonly type = 'stock_out';
  readonly trigger = { kind: 'event', topic: ERP_TOPICS.GOODS_ISSUE_POSTED } as const;
  readonly permissions = ['inventory.goods-issue.read'];
  readonly excludeActor = false;
  readonly targetApps = ['erp_manager'] as const;
  readonly channels = ['fcm_push', 'websocket'] as const;
  readonly priority = 'high' as const;
  readonly defaultEnabled = true;

  constructor(private readonly lookup: NotificationLookupService) {}

  actorIdOf(payload: GoodsIssuePostedPayload): string | undefined {
    return payload?.postedBy;
  }

  async build(ctx: NotificationContext<GoodsIssuePostedPayload>): Promise<BuiltNotification | null> {
    const issueId = ctx.payload?.issueId;
    if (!issueId) return null;

    const [actor, store] = await Promise.all([
      this.lookup.userName(ctx.actorId),
      this.lookup.branchName(ctx.branchId),
    ]);

    return {
      data: { code: ctx.payload.documentNumber ?? null, amount: Number(ctx.payload.totalAmount ?? 0), actor, store },
      target: { type: 'stock_document', id: issueId, slug: STOCK_DOCUMENT_SLUG.stockOut, branchId: ctx.branchId },
    };
  }
}
