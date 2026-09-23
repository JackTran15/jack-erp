import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { toBusinessDate } from '../../../common/utils/business-timezone.util';
import type {
  BuiltNotification,
  NotificationContext,
  ScheduledNotificationDefinition,
} from '../core/notification.types';
import { scheduledEventId } from './scheduled-event-id';

export interface StockAlertPayload {
  storeName: string | null;
  /** First out-of-stock product, alphabetically — the one named in the sentence. */
  productName: string | null;
  /** How many OTHER products are out of stock at that store. */
  more: number;
}

/**
 * "Cảnh báo tồn kho" — every day at 08:00, one alert per store that has
 * out-of-stock products.
 *
 * Rule (decided 2026-09-22): an (item, store) is out of stock when the sum of
 * its `stock_balances` across the store's locations is ≤ 0 and at least one of
 * those rows is tracked (`is_tracked` — the flag the stock summary uses to
 * hide a location). Items that never had a balance row do not count, and
 * inactive items / inactive stores are skipped. `min_qty` thresholds are a
 * different alert ("dưới định mức"), not this one.
 *
 * A snapshot at run time — unlike revenue it has no day window, so the report
 * day-boundary quirk does not apply. Chain-scoped users get one alert per
 * store they can access (the sentence names a store); store-scoped users only
 * theirs.
 */
@Injectable()
export class StockAlertNotificationDefinition implements ScheduledNotificationDefinition<StockAlertPayload> {
  readonly type = 'stock_alert';
  readonly trigger = { kind: 'schedule', at: '08:00' } as const;
  readonly permissions = ['inventory.read'];
  readonly excludeActor = false;
  readonly targetApps = ['erp_manager'] as const;
  readonly channels = ['fcm_push', 'websocket'] as const;
  readonly priority = 'normal' as const;
  readonly defaultEnabled = true;

  constructor(private readonly dataSource: DataSource) {}

  async collect(now: Date): Promise<NotificationContext<StockAlertPayload>[]> {
    const date = toBusinessDate(now);
    const rows: Array<{ org: string; branch: string; store: string | null; count: number; first_product: string | null }> =
      await this.dataSource.query(
        `WITH out_of_stock AS (
           SELECT sb."organization_id", sb."branch_id", sb."item_id"
             FROM "stock_balances" sb
            WHERE sb."branch_id" IS NOT NULL
            GROUP BY sb."organization_id", sb."branch_id", sb."item_id"
           HAVING SUM(sb."quantity") <= 0 AND bool_or(sb."is_tracked")
         )
         SELECT o."organization_id"::text AS org,
                o."branch_id"::text       AS branch,
                b."name"                  AS store,
                COUNT(*)::int             AS count,
                MIN(it."name")            AS first_product
           FROM out_of_stock o
           JOIN "branches" b ON b."id"::text = o."branch_id"::text AND b."status" = 'ACTIVE'
           JOIN "items" it   ON it."id" = o."item_id" AND it."is_active" = true
          GROUP BY o."organization_id", o."branch_id", b."name"`,
      );

    return rows.map((row) => ({
      eventId: scheduledEventId({ type: this.type, organizationId: row.org, date, subject: `branch:${row.branch}` }),
      organizationId: row.org,
      branchId: row.branch,
      occurredAt: now,
      payload: {
        storeName: row.store,
        productName: row.first_product,
        more: Math.max(Number(row.count) - 1, 0),
      },
    }));
  }

  async build(ctx: NotificationContext<StockAlertPayload>): Promise<BuiltNotification> {
    const { storeName, productName, more } = ctx.payload;
    return {
      data: { product: productName, more, store: storeName },
      target: ctx.branchId ? { type: 'inventory_store', id: ctx.branchId } : { type: 'notifications' },
    };
  }
}
