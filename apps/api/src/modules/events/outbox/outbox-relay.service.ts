import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainEvent } from '@erp/shared-interfaces';
import { EventPublisher } from '../event-publisher.service';

const POLL_INTERVAL_MS = Number(process.env.OUTBOX_POLL_MS ?? 2000);
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // hourly
const BATCH_SIZE = Number(process.env.OUTBOX_BATCH_SIZE ?? 50);
const RETENTION_DAYS = 7;

/**
 * Background relay that publishes pending outbox rows to Kafka at-least-once.
 *
 * Polls `published_at IS NULL AND next_attempt_at <= now()` with
 * `FOR UPDATE SKIP LOCKED` (safe across instances), publishes each row, then
 * marks it published. Failures back off exponentially. A separate cleanup job
 * prunes published rows older than the retention window.
 *
 * Disabled when `OUTBOX_RELAY_DISABLED=1` (used by crash-recovery E2E tests to
 * simulate "relay down" before flipping it on via `pollOnce()`).
 */
@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private pollTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly publisher: EventPublisher,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.OUTBOX_RELAY_DISABLED === '1') {
      this.logger.warn('Outbox relay disabled via OUTBOX_RELAY_DISABLED=1');
      return;
    }
    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, POLL_INTERVAL_MS);
    this.cleanupTimer = setInterval(() => {
      void this.cleanup();
    }, CLEANUP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  /** Best-effort immediate dispatch (kick after commit for happy-path latency). */
  dispatchNow(): void {
    void this.pollOnce();
  }

  /**
   * Publish one batch of pending rows. Each row is locked SKIP-LOCKED, published,
   * and marked within a single transaction so concurrent relays never double-send.
   */
  async pollOnce(): Promise<number> {
    if (this.running) return 0; // avoid overlapping ticks in one process
    this.running = true;
    try {
      return await this.dataSource.transaction(async (manager) => {
        const rows: Array<{
          id: string;
          topic: string;
          payload: Record<string, unknown>;
          partition_key: string | null;
          attempts: number;
        }> = await manager.query(
          `SELECT * FROM "outbox_messages"
           WHERE "published_at" IS NULL AND "next_attempt_at" <= now()
           ORDER BY "created_at" ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED`,
          [BATCH_SIZE],
        );
        if (rows.length === 0) return 0;

        let published = 0;
        for (const row of rows) {
          try {
            await this.publisher.publish(
              row.topic,
              row.payload as unknown as DomainEvent<unknown>,
              row.partition_key ?? undefined,
            );
            await manager.query(
              `UPDATE "outbox_messages" SET "published_at" = now() WHERE "id" = $1`,
              [row.id],
            );
            published += 1;
          } catch (err) {
            const attempts = Number(row.attempts) + 1;
            const backoffMs = Math.min(2 ** attempts * 1000, 5 * 60 * 1000);
            await manager.query(
              `UPDATE "outbox_messages"
               SET "attempts" = $2,
                   "last_error" = $3,
                   "next_attempt_at" = now() + ($4 || ' milliseconds')::interval
               WHERE "id" = $1`,
              [
                row.id,
                attempts,
                err instanceof Error ? err.message : String(err),
                String(backoffMs),
              ],
            );
            this.logger.warn(
              `Outbox publish failed for ${row.id} (topic=${row.topic}, attempt=${attempts}): ${
                err instanceof Error ? err.message : err
              }`,
            );
          }
        }
        return published;
      });
    } finally {
      this.running = false;
    }
  }

  async cleanup(): Promise<number> {
    const result = await this.dataSource.query(
      `DELETE FROM "outbox_messages"
       WHERE "published_at" IS NOT NULL
         AND "published_at" < now() - ($1 || ' days')::interval`,
      [String(RETENTION_DAYS)],
    );
    return Array.isArray(result) ? result.length : 0;
  }
}
