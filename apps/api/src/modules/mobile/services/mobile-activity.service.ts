import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  MobileActivityBatchDto,
  MobileActivityItemDto,
} from '../dto/mobile-activity.dto';
import { MobileActivityLogWriter } from './mobile-activity-log-writer';

/** Số request tối đa của MỘT người trong một phút. App gửi tối đa ~6 lượt/phút. */
export const MOBILE_ACTIVITY_RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

/** `data` stringify vượt trần này thì bị bỏ, gắn `data_truncated`. */
export const MOBILE_ACTIVITY_DATA_MAX_BYTES = 2048;

/** Một dòng của file log — đúng định dạng snake_case trong spec activity logs. */
export interface ActivityLogLine {
  activity_id: string;
  ts: string;
  received_at: string;
  user_id: string;
  organization_id: string;
  branch_id: string | null;
  session_id: string;
  seq: number;
  type: string;
  screen: string;
  component: string | null;
  action: string | null;
  target: string | null;
  value: string | null;
  flow_id: string | null;
  parent_flow_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  data: Record<string, unknown> | null;
  error_code: string | null;
  app_version: string;
  platform: string;
  catalog_version: number;
  data_truncated?: true;
}

/**
 * Nhận activity của app mobile và ghi ra file (JSON lines).
 *
 * **Body dùng camelCase, file dùng snake_case** — có chủ ý: DTO theo quy ước
 * của mọi endpoint `/mobile/*`, còn file theo định dạng đã thống nhất cho người
 * đọc log và cho AI dựng query. Việc đổi tên nằm trọn ở [toLine].
 *
 * `user_id` / `organization_id` lấy từ TOKEN, không bao giờ từ body.
 *
 * **Không kiểm giá trị với catalog nào.** Catalog (tên màn, target, mã lỗi...)
 * thuộc về app mobile — `core_constants/lib/src/activity_logs/activity_catalog.dart`
 * ở repo `jack-erp-mobile`; cần tra nghĩa một giá trị thì đọc file đó.
 * Server ghi nguyên văn thứ nhận được.
 *
 * **KHÔNG dùng Redis** — cố ý, để chức năng này đơn giản:
 * - Rate limit đếm trong BỘ NHỚ của process. Đúng chừng nào API còn chạy PM2
 *   `fork` một instance; chuyển sang cluster N process thì mỗi người được gấp N
 *   lần giới hạn — vẫn chặn được app lỗi gửi dồn dập, là thứ duy nhất nó cần chặn.
 *   Restart process thì bộ đếm về 0, không sao.
 * - App KHÔNG gửi `X-Idempotency-Key` cho endpoint này, nên
 *   `IdempotencyInterceptor` toàn cục bỏ qua, không ghi Redis. Cái giá: gửi lại
 *   một batch server đã ghi mà app chưa nhận được phản hồi thì file có dòng
 *   trùng — lọc được bằng `activity_id`.
 */
@Injectable()
export class MobileActivityService {
  /** Phút đang đếm (số phút tính từ epoch) và số request của từng người trong phút đó. */
  private rateWindow = -1;
  private readonly rateCounts = new Map<string, number>();

  constructor(private readonly writer: MobileActivityLogWriter) {}

  async record(
    actor: ActorContext,
    batch: MobileActivityBatchDto,
    now: Date = new Date(),
  ): Promise<void> {
    this.assertRateLimit(actor.userId, now);

    const lines = batch.activities.map((item) =>
      JSON.stringify(this.toLine({ actor, batch, item, receivedAt: now })),
    );
    await this.writer.append(lines, now);
  }

  /**
   * Cửa sổ cố định theo phút. Sang phút mới thì xoá sạch Map — nhờ vậy Map chỉ
   * chứa người dùng của phút hiện tại, không phình theo thời gian.
   */
  private assertRateLimit(userId: string, now: Date): void {
    const window = Math.floor(now.getTime() / RATE_WINDOW_MS);
    if (window !== this.rateWindow) {
      this.rateWindow = window;
      this.rateCounts.clear();
    }

    const count = (this.rateCounts.get(userId) ?? 0) + 1;
    this.rateCounts.set(userId, count);

    if (count > MOBILE_ACTIVITY_RATE_LIMIT) {
      throw new HttpException(
        { code: 'ACTIVITY_RATE_LIMITED', message: 'Too many activity requests' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  toLine({
    actor,
    batch,
    item,
    receivedAt,
  }: {
    actor: ActorContext;
    batch: MobileActivityBatchDto;
    item: MobileActivityItemDto;
    receivedAt: Date;
  }): ActivityLogLine {
    const line: ActivityLogLine = {
      activity_id: item.activityId,
      ts: item.ts,
      received_at: receivedAt.toISOString(),
      user_id: actor.userId,
      organization_id: actor.organizationId,
      branch_id: actor.branchId ?? null,
      session_id: item.sessionId,
      seq: item.seq,
      type: item.type,
      screen: item.screen,
      component: item.component ?? null,
      action: item.action ?? null,
      target: item.target ?? null,
      value: item.value ?? null,
      flow_id: item.flowId ?? null,
      parent_flow_id: item.parentFlowId ?? null,
      entity_type: item.entityType ?? null,
      entity_id: item.entityId ?? null,
      data: item.data ?? null,
      error_code: item.errorCode ?? null,
      app_version: batch.appVersion,
      platform: batch.platform,
      catalog_version: batch.catalogVersion,
    };

    if (
      line.data &&
      Buffer.byteLength(JSON.stringify(line.data), 'utf8') >
        MOBILE_ACTIVITY_DATA_MAX_BYTES
    ) {
      line.data = null;
      line.data_truncated = true;
    }

    return line;
  }
}
