import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { NotificationRegistry } from '../core/definition/notification-registry.service';
import type { NotificationApp, NotificationTarget } from '../core/notification.types';
import type { ListNotificationsQueryDto, NotificationItemDto, NotificationPageDto } from '../dto/notification.dto';

interface InboxRow {
  id: string;
  type: string;
  created_at: Date;
  read_at: Date | null;
  branch_id: string | null;
  data: Record<string, string | number | null> | null;
  target: NotificationTarget | null;
}

/**
 * The caller's own inbox. Every query is pinned to `actor.userId` +
 * `actor.organizationId`; no endpoint accepts a user id from the client.
 * Only types the calling app can render are returned (`targetApps`).
 */
@Injectable()
export class NotificationInboxService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly registry: NotificationRegistry,
  ) {}

  async list(actor: ActorContext, query: ListNotificationsQueryDto): Promise<NotificationPageDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const types = this.types(query.app);
    const params = [actor.userId, actor.organizationId, types, query.unreadOnly === true];
    const where = `"user_id" = $1 AND "organization_id" = $2 AND "type" = ANY($3::text[])
                   AND ($4::boolean = false OR "read_at" IS NULL)`;

    const [rows, totals] = await Promise.all([
      this.dataSource.query(
        `SELECT "id", "type", "created_at", "read_at", "branch_id", "data", "target"
           FROM "notifications" WHERE ${where}
          ORDER BY "created_at" DESC, "id" DESC
          LIMIT $5 OFFSET $6`,
        [...params, limit, (page - 1) * limit],
      ) as Promise<InboxRow[]>,
      this.dataSource.query(`SELECT COUNT(*)::int AS total FROM "notifications" WHERE ${where}`, params) as Promise<
        Array<{ total: number }>
      >,
    ]);

    return {
      data: rows.map((row) => this.toDto(row)),
      total: Number(totals[0]?.total ?? 0),
      page,
      limit,
    };
  }

  async unreadCount(actor: ActorContext, app: NotificationApp | undefined): Promise<number> {
    const rows: Array<{ count: number }> = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM "notifications"
        WHERE "user_id" = $1 AND "organization_id" = $2 AND "type" = ANY($3::text[]) AND "read_at" IS NULL`,
      [actor.userId, actor.organizationId, this.types(app)],
    );
    return Number(rows[0]?.count ?? 0);
  }

  /** Already read → still success. Someone else's / unknown id → 404 (existence is not leaked). */
  async markRead(actor: ActorContext, id: string): Promise<void> {
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `UPDATE "notifications" SET "read_at" = COALESCE("read_at", now())
        WHERE "id" = $1 AND "user_id" = $2 AND "organization_id" = $3
        RETURNING "id"`,
      [id, actor.userId, actor.organizationId],
    );
    if (rows.length === 0) throw new NotFoundException('Không tìm thấy thông báo');
  }

  /** Marks only rows that exist at call time — a push arriving mid-request stays unread. */
  async markAllRead(actor: ActorContext, app: NotificationApp | undefined): Promise<number> {
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `UPDATE "notifications" SET "read_at" = now()
        WHERE "user_id" = $1 AND "organization_id" = $2 AND "type" = ANY($3::text[])
          AND "read_at" IS NULL AND "created_at" <= now()
        RETURNING "id"`,
      [actor.userId, actor.organizationId, this.types(app)],
    );
    return rows.length;
  }

  private types(app: NotificationApp | undefined): string[] {
    return this.registry.typesForApp(app ?? 'erp_manager');
  }

  private toDto(row: InboxRow): NotificationItemDto {
    return {
      id: row.id,
      type: row.type,
      createdAt: new Date(row.created_at).toISOString(),
      isRead: row.read_at !== null,
      branchId: row.branch_id,
      data: row.data ?? {},
      target: row.target,
    };
  }
}
