import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { NotificationChannel } from '../channels/notification-channel.interface';
import { WebSocketNotifier } from '../channels/websocket-notifier.service';
import { NotificationDeliveryWorker } from '../delivery/notification-delivery.worker';
import { NotificationPreferenceService } from '../preferences/notification-preference.service';
import { NotificationRecipientResolver } from '../recipients/notification-recipient.resolver';
import {
  asUuid,
  NOTIFICATION_CHANNELS,
  NotificationContext,
  NotificationDefinition,
} from '../notification.types';

export type DispatchOutcome =
  | { status: 'skipped'; reason: 'should-send' | 'no-recipient' | 'build-null' }
  | { status: 'created'; notifications: number; deliveries: number };

/**
 * The fixed pipeline (Template Method). Definitions only supply steps 2, 3
 * (via `permissions`/`excludeActor`) and 5; everything else lives here and
 * must never branch on `type`.
 *
 *  1. (caller looked the definition up in the registry)
 *  2. definition.shouldSend
 *  3. resolve recipients (permission + branch access, minus actor) — or take
 *     `ctx.recipientUserIds` when the definition already decided them
 *  4. filter by user preference
 *  5. definition.build — once, shared by every recipient
 *  6. insert inbox rows, ON CONFLICT DO NOTHING      ← idempotency layer 1
 *  7. insert queued deliveries, ON CONFLICT DO NOTHING ← idempotency layer 2
 *  8. commit, then kick the worker + websocket nudge (best-effort)
 */
@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);
  private readonly queuedChannels: NotificationChannel[];

  constructor(
    private readonly dataSource: DataSource,
    private readonly resolver: NotificationRecipientResolver,
    private readonly preferences: NotificationPreferenceService,
    private readonly worker: NotificationDeliveryWorker,
    private readonly websocket: WebSocketNotifier,
    @Inject(NOTIFICATION_CHANNELS) channels: NotificationChannel[],
  ) {
    this.queuedChannels = channels;
  }

  async dispatch<P>(definition: NotificationDefinition<P>, ctx: NotificationContext<P>): Promise<DispatchOutcome> {
    const { type } = definition;

    if (definition.shouldSend && !(await definition.shouldSend(ctx))) {
      return { status: 'skipped', reason: 'should-send' };
    }

    const candidates =
      ctx.recipientUserIds ??
      (await this.resolver.resolve({
        organizationId: ctx.organizationId,
        branchId: ctx.branchId,
        permissions: definition.permissions,
        excludeUserId: definition.excludeActor ? ctx.actorId : undefined,
      }));
    const recipients = await this.preferences.filter({
      userIds: candidates,
      type,
      branchId: ctx.branchId,
      defaultEnabled: definition.defaultEnabled,
      scope: ctx.scope,
    });
    if (recipients.length === 0) {
      this.logger.debug(`[${type}] event ${ctx.eventId}: no recipient (${candidates.length} before preferences)`);
      return { status: 'skipped', reason: 'no-recipient' };
    }

    const built = await definition.build(ctx);
    if (!built) return { status: 'skipped', reason: 'build-null' };

    const queued = this.queuedChannels.filter((c) => definition.channels.includes(c.key));

    const { created, deliveries } = await this.dataSource.transaction(async (manager) => {
      const inserted: Array<{ id: string; user_id: string }> = await manager.query(
        `INSERT INTO "notifications"
           ("organization_id", "user_id", "type", "branch_id", "data", "target", "source_event_id", "actor_id")
         SELECT $1, u, $2, $3::uuid, $4::jsonb, $5::jsonb, $6, $7::uuid
           FROM unnest($8::uuid[]) AS u
         ON CONFLICT ("source_event_id", "type", "user_id") DO NOTHING
         RETURNING "id", "user_id"`,
        [
          ctx.organizationId,
          type,
          asUuid(ctx.branchId) ?? null,
          JSON.stringify(built.data),
          built.target ? JSON.stringify(built.target) : null,
          ctx.eventId,
          asUuid(ctx.actorId) ?? null,
          recipients,
        ],
      );
      if (inserted.length === 0) return { created: inserted, deliveries: 0 };

      const ids = inserted.map((r) => r.id);
      const userIds = inserted.map((r) => r.user_id);
      let deliveryCount = 0;

      for (const channel of queued) {
        const rows: unknown[] = channel.perDevice
          ? await manager.query(
              `INSERT INTO "notification_deliveries" ("organization_id", "notification_id", "channel", "device_id")
               SELECT $1, n.id, $2, d."id"
                 FROM unnest($3::uuid[], $4::uuid[]) AS n(id, user_id)
                 JOIN "user_devices" d
                   ON d."user_id" = n.user_id AND d."revoked_at" IS NULL
                  AND d."organization_id" = $1 AND d."app" = ANY($5::text[])
               ON CONFLICT DO NOTHING
               RETURNING "id"`,
              [ctx.organizationId, channel.key, ids, userIds, [...definition.targetApps]],
            )
          : await manager.query(
              `INSERT INTO "notification_deliveries" ("organization_id", "notification_id", "channel")
               SELECT $1, n, $2 FROM unnest($3::uuid[]) AS n
               ON CONFLICT DO NOTHING
               RETURNING "id"`,
              [ctx.organizationId, channel.key, ids],
            );
        deliveryCount += rows.length;
      }
      return { created: inserted, deliveries: deliveryCount };
    });

    if (created.length > 0) {
      if (deliveries > 0) this.worker.kick();
      if (definition.channels.includes('websocket')) {
        this.websocket.notifyCreated({
          organizationId: ctx.organizationId,
          notifications: created.map((r) => ({ id: r.id, userId: r.user_id, type })),
        });
      }
    }

    this.logger.log(
      `[${type}] event ${ctx.eventId}: ${created.length} notification(s), ${deliveries} delivery(ies) for ${recipients.length} recipient(s)`,
    );
    return { status: 'created', notifications: created.length, deliveries };
  }
}
