import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { toBusinessDate } from '../../../common/utils/business-timezone.util';
import { revenueLinesSql } from '../../mobile/services/mobile-revenue-report.sql';
import { NotificationRecipientResolver } from '../core/recipients/notification-recipient.resolver';
import type {
  BuiltNotification,
  NotificationContext,
  ScheduledNotificationDefinition,
} from '../core/notification.types';
import { scheduledEventId } from './scheduled-event-id';

/** Same permission as `GET /mobile/reports/overview` — who may see the numbers may be told them. */
const REVENUE_PERMISSION = 'reporting.sales.revenue-by-item.read';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RevenuePayload {
  /** Business date reported (`YYYY-MM-DD`) — yesterday at run time. */
  date: string;
  amount: number;
  /** Branch name, or the organization name for a chain-wide summary. */
  storeName: string | null;
  /** `branch` → one store; `chain` → the recipient's own set of stores. */
  kind: 'branch' | 'chain';
}

/**
 * "Tình hình doanh thu" — every day at 09:00, the revenue of YESTERDAY.
 *
 * Numbers come from `revenueLinesSql` — the exact fragment behind the
 * manager app's Overview screen (`MobileOverviewReportService.queryAggregates`),
 * so the push always equals what the screen shows for "yesterday". That
 * includes the screen's known day boundary (the report compares `issued_at` to
 * a `::date` in a UTC session, i.e. 07:00→07:00 VN). Kept on purpose, decided
 * 2026-09-22: fixing it would change every mobile revenue report. Reporting
 * YESTERDAY at 09:00 means that shifted day has already closed.
 *
 * Two kinds of firing, matched to the user's "Thiết lập thông báo" scope:
 * - per branch (`scope: branchOnly`) — for users scoped to that one store;
 * - per user (`scope: chainOnly`) — the sum over the stores THAT user is
 *   assigned to, never the whole organization: a chain summary must not leak
 *   the revenue of stores the user cannot open.
 */
@Injectable()
export class RevenueNotificationDefinition implements ScheduledNotificationDefinition<RevenuePayload> {
  readonly type = 'revenue';
  readonly trigger = { kind: 'schedule', at: '09:00' } as const;
  readonly permissions = [REVENUE_PERMISSION];
  readonly excludeActor = false;
  readonly targetApps = ['erp_manager'] as const;
  readonly channels = ['fcm_push', 'websocket'] as const;
  readonly priority = 'normal' as const;
  readonly defaultEnabled = true;

  constructor(
    private readonly dataSource: DataSource,
    private readonly resolver: NotificationRecipientResolver,
  ) {}

  async collect(now: Date): Promise<NotificationContext<RevenuePayload>[]> {
    const date = toBusinessDate(new Date(now.getTime() - DAY_MS));
    const orgs: Array<{ org: string; name: string | null }> = await this.dataSource.query(
      `SELECT DISTINCT b."organization_id"::text AS org, o."name" AS name
         FROM "branches" b
         LEFT JOIN "organizations" o ON o."id"::text = b."organization_id"::text
        WHERE b."status" = 'ACTIVE'`,
    );

    const contexts: NotificationContext<RevenuePayload>[] = [];
    for (const { org, name } of orgs) {
      contexts.push(...(await this.collectOrganization({ organizationId: org, organizationName: name, date, now })));
    }
    return contexts;
  }

  private async collectOrganization({
    organizationId,
    organizationName,
    date,
    now,
  }: {
    organizationId: string;
    organizationName: string | null;
    date: string;
    now: Date;
  }): Promise<NotificationContext<RevenuePayload>[]> {
    const branches: Array<{ id: string; name: string }> = await this.dataSource.query(
      `SELECT "id"::text AS id, "name" FROM "branches" WHERE "organization_id"::text = $1 AND "status" = 'ACTIVE'`,
      [organizationId],
    );
    if (branches.length === 0) return [];

    const lines = revenueLinesSql({ fromParam: '$2', toParam: '$3', branchesParam: '$4' });
    const totals: Array<{ id: string; invoiceCount: number; revenue: number }> = await this.dataSource.query(
      `WITH ${lines}
       SELECT l.branch_id AS id,
              COUNT(DISTINCT l.invoice_id)::int AS "invoiceCount",
              COALESCE(SUM(l.amount), 0)::float AS revenue
         FROM lines l
        GROUP BY l.branch_id`,
      [organizationId, date, date, branches.map((b) => b.id)],
    );

    const byBranch = new Map(
      totals.filter((t) => Number(t.invoiceCount) > 0).map((t) => [t.id, round2(Number(t.revenue))]),
    );
    const names = new Map(branches.map((b) => [b.id, b.name]));
    const contexts: NotificationContext<RevenuePayload>[] = [];

    for (const [branchId, amount] of byBranch) {
      contexts.push({
        eventId: scheduledEventId({ type: this.type, organizationId, date, subject: `branch:${branchId}` }),
        organizationId,
        branchId,
        occurredAt: now,
        scope: 'branchOnly',
        payload: { date, amount, storeName: names.get(branchId) ?? null, kind: 'branch' },
      });
    }

    const assigned = await this.resolver.assignedBranches({ organizationId, permissions: this.permissions });
    for (const [userId, userBranches] of assigned) {
      const sold = userBranches.filter((id) => byBranch.has(id));
      if (sold.length === 0) continue;

      contexts.push({
        eventId: scheduledEventId({ type: this.type, organizationId, date, subject: `user:${userId}` }),
        organizationId,
        occurredAt: now,
        recipientUserIds: [userId],
        scope: 'chainOnly',
        payload: {
          date,
          amount: round2(sold.reduce((sum, id) => sum + (byBranch.get(id) ?? 0), 0)),
          storeName: organizationName,
          kind: 'chain',
        },
      });
    }
    return contexts;
  }

  async build(ctx: NotificationContext<RevenuePayload>): Promise<BuiltNotification> {
    const { date, amount, storeName, kind } = ctx.payload;
    return {
      data: { date, amount, store: storeName },
      target: kind === 'branch' && ctx.branchId ? { type: 'store', id: ctx.branchId } : { type: 'overview' },
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
