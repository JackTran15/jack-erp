import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { NotificationRegistry } from '../core/definition/notification-registry.service';
import type { NotificationApp } from '../core/notification.types';
import type { NotificationSettingsDto, SaveNotificationSettingsDto } from '../dto/notification.dto';

/**
 * One settings row per user, shared by every app. Saving from one app only
 * rewrites the types THAT app offers — erp_sales saving its screen must not
 * switch off erp_manager types it never showed.
 */
@Injectable()
export class NotificationSettingsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly registry: NotificationRegistry,
  ) {}

  async get(actor: ActorContext, app: NotificationApp | undefined): Promise<NotificationSettingsDto> {
    const available = this.registry.typesForApp(app ?? 'erp_manager');
    const row = await this.read(actor.userId);

    const enabled = row
      ? row.enabled_types.filter((t) => available.includes(t))
      : available.filter((t) => this.registry.byType(t)?.defaultEnabled);

    return { scopeBranchId: row?.scope_branch_id ?? null, enabledTypes: enabled, availableTypes: available };
  }

  async save(
    actor: ActorContext,
    app: NotificationApp | undefined,
    dto: SaveNotificationSettingsDto,
  ): Promise<NotificationSettingsDto> {
    const scope = dto.scopeBranchId ?? null;
    if (scope && !(actor.branchIds ?? []).includes(scope)) {
      throw new BadRequestException('Bạn không có quyền với cửa hàng đã chọn');
    }

    const available = this.registry.typesForApp(app ?? 'erp_manager');
    const current = await this.read(actor.userId);
    // Types unknown to the server (old app, removed type) are dropped silently —
    // they must not break the Save button.
    const requested = dto.enabledTypes.filter((t) => available.includes(t));
    const keptFromOtherApps = (current?.enabled_types ?? []).filter(
      (t) => !available.includes(t) && this.registry.byType(t),
    );
    const enabledTypes = [...new Set([...keptFromOtherApps, ...requested])];

    await this.dataSource.query(
      `INSERT INTO "user_notification_settings" ("organization_id", "user_id", "scope_branch_id", "enabled_types", "updated_at")
       VALUES ($1, $2, $3, $4::text[], now())
       ON CONFLICT ("user_id") DO UPDATE SET
         "organization_id" = EXCLUDED."organization_id",
         "scope_branch_id" = EXCLUDED."scope_branch_id",
         "enabled_types" = EXCLUDED."enabled_types",
         "updated_at" = now()`,
      [actor.organizationId, actor.userId, scope, enabledTypes],
    );

    return this.get(actor, app);
  }

  private async read(
    userId: string,
  ): Promise<{ scope_branch_id: string | null; enabled_types: string[] } | undefined> {
    const rows = await this.dataSource.query(
      `SELECT "scope_branch_id", "enabled_types" FROM "user_notification_settings" WHERE "user_id" = $1`,
      [userId],
    );
    return rows[0];
  }
}
