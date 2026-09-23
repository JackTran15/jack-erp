import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ActorContext } from '../../../common/decorators/actor-context.decorator';
import type { NotificationApp } from '../core/notification.types';
import type { RegisterDeviceDto } from '../dto/notification.dto';

@Injectable()
export class UserDeviceService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Upsert by `(installationId, app)`. A token still live on ANOTHER row (the
   * same tablet now used by someone else, or a reinstall) is revoked first, so
   * one token never belongs to two users.
   */
  async register(actor: ActorContext, dto: RegisterDeviceDto): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE "user_devices" SET "revoked_at" = now(), "updated_at" = now()
          WHERE "fcm_token" = $1 AND "revoked_at" IS NULL
            AND NOT ("installation_id" = $2 AND "app" = $3)`,
        [dto.fcmToken, dto.installationId, dto.app],
      );
      await manager.query(
        `INSERT INTO "user_devices"
           ("organization_id", "user_id", "installation_id", "app", "platform", "fcm_token",
            "locale", "app_version", "environment", "last_seen_at", "revoked_at")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), NULL)
         ON CONFLICT ("installation_id", "app") DO UPDATE SET
           "organization_id" = EXCLUDED."organization_id",
           "user_id" = EXCLUDED."user_id",
           "platform" = EXCLUDED."platform",
           "fcm_token" = EXCLUDED."fcm_token",
           "locale" = EXCLUDED."locale",
           "app_version" = EXCLUDED."app_version",
           "environment" = EXCLUDED."environment",
           "last_seen_at" = now(),
           "revoked_at" = NULL,
           "updated_at" = now()`,
        [
          actor.organizationId,
          actor.userId,
          dto.installationId,
          dto.app,
          dto.platform,
          dto.fcmToken,
          dto.locale,
          dto.appVersion ?? null,
          dto.environment ?? null,
        ],
      );
    });
  }

  /** Called on logout. Idempotent: no row, or already revoked, is still success. */
  async unregister(actor: ActorContext, installationId: string, app: NotificationApp): Promise<void> {
    await this.dataSource.query(
      `UPDATE "user_devices" SET "revoked_at" = now(), "updated_at" = now()
        WHERE "installation_id" = $1 AND "app" = $2 AND "user_id" = $3 AND "revoked_at" IS NULL`,
      [installationId, app, actor.userId],
    );
  }
}
