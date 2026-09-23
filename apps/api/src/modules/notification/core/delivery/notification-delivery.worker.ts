import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { NotificationRegistry } from '../definition/notification-registry.service';
import type { DeliveryJob, DeliveryResult, NotificationChannel } from '../channels/notification-channel.interface';
import { NOTIFICATION_CHANNELS, NotificationData, NotificationTarget } from '../notification.types';

const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const POLL_MS = num(process.env.NOTIFICATION_WORKER_POLL_MS, 2000);
const BATCH_SIZE = num(process.env.NOTIFICATION_WORKER_BATCH_SIZE, 100);
const MAX_ATTEMPTS = num(process.env.NOTIFICATION_MAX_ATTEMPTS, 6);
const PUSH_TTL_SECONDS = num(process.env.NOTIFICATION_PUSH_TTL_SECONDS, 3600);
/** A claimed row becomes claimable again after this, if the process died mid-send. */
const LEASE_SECONDS = 120;
const BACKOFF_BASE_MS = 10_000;
const BACKOFF_MAX_MS = 60 * 60 * 1000;

interface ClaimedRow {
  id: string;
  notification_id: string;
  organization_id: string;
  channel: string;
  attempts: number;
  created_at: Date;
  user_id: string;
  type: string;
  data: NotificationData;
  target: NotificationTarget | null;
  device_id: string | null;
  fcm_token: string | null;
  platform: string | null;
  locale: string | null;
  revoked_at: Date | null;
}

/**
 * Sends queued deliveries — same shape as `OutboxRelayService`, no BullMQ.
 *
 * Claims a batch with a LEASE (`FOR UPDATE SKIP LOCKED` + push `next_attempt_at`
 * forward) and commits BEFORE calling FCM, so no transaction stays open across
 * network calls. A crash mid-send lets the lease expire and the row is retried;
 * the Android `tag` / idempotent tray makes that duplicate harmless.
 *
 * Disabled with `NOTIFICATION_WORKER_DISABLED=1`.
 */
@Injectable()
export class NotificationDeliveryWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDeliveryWorker.name);
  private readonly channels: Map<string, NotificationChannel>;
  private timer?: NodeJS.Timeout;
  private running = false;
  private rerun = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly registry: NotificationRegistry,
    @Inject(NOTIFICATION_CHANNELS) channels: NotificationChannel[],
  ) {
    this.channels = new Map(channels.map((c) => [c.key, c]));
  }

  onApplicationBootstrap(): void {
    if (process.env.NOTIFICATION_WORKER_DISABLED === '1') {
      this.logger.warn('Notification delivery worker disabled via NOTIFICATION_WORKER_DISABLED=1');
      return;
    }
    this.timer = setInterval(() => void this.pollOnce(), POLL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Best-effort immediate run after the dispatcher commits (latency on the happy path). */
  kick(): void {
    if (process.env.NOTIFICATION_WORKER_DISABLED === '1') return;
    void this.pollOnce();
  }

  async pollOnce(): Promise<number> {
    if (this.running) {
      this.rerun = true;
      return 0;
    }
    this.running = true;
    let processed = 0;
    try {
      do {
        this.rerun = false;
        const rows = await this.claim();
        processed += rows.length;
        if (rows.length === 0) break;
        const unread = await this.unreadCounts(rows.map((r) => r.user_id));
        await Promise.all(rows.map((row) => this.process(row, unread.get(row.user_id) ?? 0)));
        if (rows.length === BATCH_SIZE) this.rerun = true;
      } while (this.rerun);
    } catch (err) {
      this.logger.error(`Delivery poll failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.running = false;
    }
    return processed;
  }

  private async claim(): Promise<ClaimedRow[]> {
    return this.dataSource.query(
      `WITH due AS (
         SELECT "id" FROM "notification_deliveries"
          WHERE "status" IN ('pending', 'retrying') AND "next_attempt_at" <= now()
          ORDER BY "next_attempt_at"
          LIMIT $1
          FOR UPDATE SKIP LOCKED
       ), leased AS (
         UPDATE "notification_deliveries" d
            SET "next_attempt_at" = now() + ($2 || ' seconds')::interval, "updated_at" = now()
           FROM due WHERE d."id" = due."id"
         RETURNING d.*
       )
       SELECT l."id", l."notification_id", l."organization_id", l."channel", l."attempts", n."created_at",
              n."user_id", n."type", n."data", n."target",
              ud."id" AS device_id, ud."fcm_token", ud."platform", ud."locale", ud."revoked_at"
         FROM leased l
         JOIN "notifications" n ON n."id" = l."notification_id"
         LEFT JOIN "user_devices" ud ON ud."id" = l."device_id"`,
      [BATCH_SIZE, String(LEASE_SECONDS)],
    );
  }

  private async unreadCounts(userIds: string[]): Promise<Map<string, number>> {
    const rows: Array<{ user_id: string; count: string }> = await this.dataSource.query(
      `SELECT "user_id", COUNT(*)::int AS count FROM "notifications"
        WHERE "user_id" = ANY($1::uuid[]) AND "read_at" IS NULL
        GROUP BY "user_id"`,
      [[...new Set(userIds)]],
    );
    return new Map(rows.map((r) => [r.user_id, Number(r.count)]));
  }

  private async process(row: ClaimedRow, unreadCount: number): Promise<void> {
    const ageSeconds = (Date.now() - new Date(row.created_at).getTime()) / 1000;
    if (ageSeconds > PUSH_TTL_SECONDS) {
      return this.finish(row, { outcome: 'drop', error: 'expired' }, 'expired');
    }
    const channel = this.channels.get(row.channel);
    if (!channel) {
      return this.finish(row, { outcome: 'drop', error: `unknown channel ${row.channel}` });
    }
    if (channel.perDevice && (!row.device_id || !row.fcm_token || row.revoked_at)) {
      return this.finish(row, { outcome: 'drop', error: 'device-revoked' });
    }

    const job: DeliveryJob = {
      deliveryId: row.id,
      notificationId: row.notification_id,
      organizationId: row.organization_id,
      userId: row.user_id,
      type: row.type,
      data: row.data ?? {},
      target: row.target,
      priority: this.registry.byType(row.type)?.priority ?? 'normal',
      device: row.device_id
        ? { id: row.device_id, fcmToken: row.fcm_token ?? '', platform: row.platform ?? '', locale: row.locale ?? 'vi' }
        : null,
      unreadCount,
      ttlSeconds: Math.floor(PUSH_TTL_SECONDS - ageSeconds),
    };

    let result: DeliveryResult;
    try {
      result = await channel.deliver(job);
    } catch (err) {
      result = { outcome: 'retry', error: err instanceof Error ? err.message : String(err) };
    }
    await this.finish(row, result);
  }

  private async finish(row: ClaimedRow, result: DeliveryResult, dropStatus: 'dropped' | 'expired' = 'dropped'): Promise<void> {
    if (result.outcome === 'sent') {
      await this.dataSource.query(
        `UPDATE "notification_deliveries"
            SET "status" = 'sent', "attempts" = "attempts" + 1, "sent_at" = now(),
                "provider_message_id" = $2, "last_error" = NULL, "updated_at" = now()
          WHERE "id" = $1`,
        [row.id, result.providerMessageId ?? null],
      );
      return;
    }

    if (result.outcome === 'drop') {
      await this.dataSource.query(
        `UPDATE "notification_deliveries"
            SET "status" = $2, "attempts" = "attempts" + 1, "last_error" = $3, "updated_at" = now()
          WHERE "id" = $1`,
        [row.id, dropStatus, result.error],
      );
      if (result.revokeDevice && row.device_id) {
        await this.dataSource.query(
          `UPDATE "user_devices" SET "revoked_at" = now(), "updated_at" = now()
            WHERE "id" = $1 AND "revoked_at" IS NULL`,
          [row.device_id],
        );
      }
      return;
    }

    const attempts = Number(row.attempts) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      this.logger.warn(`Delivery ${row.id} (${row.type}/${row.channel}) failed after ${attempts} attempts: ${result.error}`);
      await this.dataSource.query(
        `UPDATE "notification_deliveries"
            SET "status" = 'failed', "attempts" = $2, "last_error" = $3, "updated_at" = now()
          WHERE "id" = $1`,
        [row.id, attempts, result.error],
      );
      return;
    }
    await this.dataSource.query(
      `UPDATE "notification_deliveries"
          SET "status" = 'retrying', "attempts" = $2, "last_error" = $3,
              "next_attempt_at" = now() + ($4 || ' milliseconds')::interval, "updated_at" = now()
        WHERE "id" = $1`,
      [row.id, attempts, result.error, String(backoffMs(attempts))],
    );
  }

  /**
   * Housekeeping at 03:00 business time: old deliveries (30 days), old
   * notifications (90 days), devices not seen for 60 days (FCM's own guidance
   * for stale tokens).
   */
  @Cron('0 3 * * *', { timeZone: 'Asia/Ho_Chi_Minh', name: 'notification-cleanup' })
  async cleanup(): Promise<void> {
    try {
      await this.dataSource.query(
        `DELETE FROM "notification_deliveries"
          WHERE "status" IN ('sent', 'failed', 'expired', 'dropped') AND "created_at" < now() - interval '30 days'`,
      );
      await this.dataSource.query(`DELETE FROM "notifications" WHERE "created_at" < now() - interval '90 days'`);
      await this.dataSource.query(
        `UPDATE "user_devices" SET "revoked_at" = now(), "updated_at" = now()
          WHERE "revoked_at" IS NULL AND "last_seen_at" < now() - interval '60 days'`,
      );
    } catch (err) {
      this.logger.error(`Notification cleanup failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}

/** 10s × 2^attempts, capped at 1 hour. */
export function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** attempts, BACKOFF_MAX_MS);
}
