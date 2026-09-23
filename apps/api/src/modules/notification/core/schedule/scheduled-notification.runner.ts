import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { toBusinessDate, toBusinessTime } from '../../../../common/utils/business-timezone.util';
import { NotificationRegistry } from '../definition/notification-registry.service';
import { NotificationDispatcher } from '../dispatcher/notification-dispatcher.service';
import type { ScheduledNotificationDefinition } from '../notification.types';

const TICK_MS = 60_000;

/**
 * Kết quả của MỘT lượt bắn trong một lượt chạy.
 *
 * Tồn tại vì một lượt chạy im lặng có tới bốn nguyên nhân khác hẳn nhau — không
 * ai đủ điều kiện nhận / hôm nay đã gửi rồi / có thông báo nhưng không ai có
 * thiết bị / dispatch ném lỗi — và trước đây cả bốn đều rơi vào cùng một con số
 * "N lượt bắn". Công cụ thử cần phân biệt được; lịch tự động thì chỉ cần ghi log.
 */
export interface ScheduledFiringResult {
  eventId: string;
  /** `created` = đã ghi thông báo mới; `skipped` = pipeline bỏ; `failed` = ném lỗi. */
  status: 'created' | 'skipped' | 'failed';
  /** Lý do bỏ (`no-recipient`…) hoặc câu lỗi khi `failed`. */
  reason: string | null;
  notifications: number;
  deliveries: number;
}

/**
 * Runs the daily definitions (`trigger.kind === 'schedule'`) at their `HH:mm`,
 * business time. Checks once a minute; knows nothing about the types it runs.
 *
 * "Already ran today" lives in memory only. That is enough because duplicates
 * are stopped one layer down: definitions derive eventIds with uuidv5 from
 * (type, org, date, …) and `notifications` is unique on
 * (source_event_id, type, user_id) — a restart inside the minute, or a second
 * instance, re-dispatches into rows that already exist and sends nothing.
 *
 * A tick missed entirely (process down at 09:00) is NOT caught up: a "revenue
 * of yesterday" push arriving at 14:00 is noise, not information.
 *
 * Disabled with `NOTIFICATION_SCHEDULE_DISABLED=1` — dev machines otherwise
 * push to real devices every morning.
 */
@Injectable()
export class ScheduledNotificationRunner implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledNotificationRunner.name);
  private readonly lastRunDate = new Map<string, string>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly registry: NotificationRegistry,
    private readonly dispatcher: NotificationDispatcher,
  ) {}

  onApplicationBootstrap(): void {
    if (this.disabled()) {
      this.logger.warn('Scheduled notifications disabled via NOTIFICATION_SCHEDULE_DISABLED=1');
      return;
    }
    this.timer = setInterval(() => void this.tick(new Date()), TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One check. Public so tests (and a manual trigger) can drive the clock. */
  async tick(now: Date): Promise<string[]> {
    if (this.disabled()) return [];

    const time = toBusinessTime(now);
    const date = toBusinessDate(now);
    const due = this.registry
      .scheduled()
      .filter((d) => d.trigger.at === time && this.lastRunDate.get(d.type) !== date);

    for (const definition of due) {
      this.lastRunDate.set(definition.type, date);
      await this.run(definition, now);
    }
    return due.map((d) => d.type);
  }

  /**
   * Collect + dispatch one definition now, regardless of the clock.
   *
   * Trả kết quả TỪNG lượt bắn thay vì `void`: lịch tự động không dùng tới, nhưng
   * nó là thứ duy nhất trả lời được câu "chạy rồi mà sao máy im".
   */
  async run(definition: ScheduledNotificationDefinition, now: Date): Promise<ScheduledFiringResult[]> {
    let contexts;
    try {
      contexts = await definition.collect(now);
    } catch (err) {
      this.logger.error(`[${definition.type}] collect failed: ${err instanceof Error ? err.message : err}`);
      return [];
    }

    const results: ScheduledFiringResult[] = [];
    for (const ctx of contexts) {
      try {
        const outcome = await this.dispatcher.dispatch(definition, ctx);
        results.push(
          outcome.status === 'created'
            ? {
                eventId: ctx.eventId,
                status: 'created',
                reason: null,
                notifications: outcome.notifications,
                deliveries: outcome.deliveries,
              }
            : {
                eventId: ctx.eventId,
                status: 'skipped',
                reason: outcome.reason,
                notifications: 0,
                deliveries: 0,
              },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ eventId: ctx.eventId, status: 'failed', reason: message, notifications: 0, deliveries: 0 });
        this.logger.error(`[${definition.type}] dispatch failed for event ${ctx.eventId}: ${message}`);
      }
    }

    const failed = results.filter((result) => result.status === 'failed').length;
    this.logger.log(`[${definition.type}] daily run: ${contexts.length} firing(s), ${failed} failed`);
    return results;
  }

  private disabled(): boolean {
    return process.env.NOTIFICATION_SCHEDULE_DISABLED === '1';
  }
}
