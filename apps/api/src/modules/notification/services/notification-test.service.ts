import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { v4 as uuid } from 'uuid';
import type { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { toBusinessDate } from '../../../common/utils/business-timezone.util';
import { FcmPushChannel } from '../core/channels/fcm-push.channel';
import { FirebaseAdminProvider } from '../core/channels/firebase-admin.provider';
import type { DeliveryJob } from '../core/channels/notification-channel.interface';
import { NotificationRegistry } from '../core/definition/notification-registry.service';
import { NotificationDispatcher } from '../core/dispatcher/notification-dispatcher.service';
import type {
  BuiltNotification,
  NotificationContext,
  NotificationDefinition,
  NotificationTarget,
  ScheduledNotificationDefinition,
} from '../core/notification.types';
import { ScheduledNotificationRunner } from '../core/schedule/scheduled-notification.runner';
import type {
  DispatchTestDto,
  DispatchTestResultDto,
  RunScheduledDto,
  RunScheduledResultDto,
  SendTestPushDeviceResultDto,
  SendTestPushDto,
  SendTestPushResultDto,
  TestDeliveryDto,
  TestDeliveryQueryDto,
  TestDeviceDto,
  TestTypeDto,
} from '../dto/notification-test.dto';

const TOKEN_TAIL = 8;
/** TTL của push thử: đủ dài để cầm máy lên xem, đủ ngắn để không tới muộn lúc nửa đêm. */
const TEST_PUSH_TTL_SECONDS = 600;

interface DeviceRow {
  id: string;
  fcm_token: string;
  platform: string;
  locale: string;
  user_id: string;
  revoked_at: Date | null;
}

/**
 * Bộ công cụ TẠM sau trang "Cấu hình → Test thông báo" — xem
 * `notification-test.config.ts` để biết vì sao nó không gắn phân quyền và cách gỡ.
 *
 * Nguyên tắc của cả service: **không dựng đường đi riêng nào**. Push thử dùng lại
 * `FcmPushChannel.buildMessage` nên payload giống hệt push thật; bắn thử một loại
 * đi qua `NotificationDispatcher` nên người nhận / bộ lọc thiết lập / câu chữ /
 * deeplink đều là đường thật. Chỉ DỮ LIỆU là giả. Một công cụ test đi đường riêng
 * thì xanh ở đây mà vẫn hỏng ngoài đời.
 */
@Injectable()
export class NotificationTestService {
  private readonly logger = new Logger(NotificationTestService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly registry: NotificationRegistry,
    private readonly dispatcher: NotificationDispatcher,
    private readonly runner: ScheduledNotificationRunner,
    private readonly fcm: FcmPushChannel,
    private readonly firebase: FirebaseAdminProvider,
  ) {}

  /** Thiết bị của tổ chức người gọi. Token đầy đủ KHÔNG rời khỏi server. */
  async listDevices(actor: ActorContext, includeRevoked: boolean): Promise<TestDeviceDto[]> {
    const rows: Array<Record<string, string | Date | null>> = await this.dataSource.query(
      `SELECT d."id", d."user_id", d."installation_id", d."app", d."platform", d."locale",
              d."app_version", d."environment", d."last_seen_at", d."revoked_at",
              RIGHT(d."fcm_token", $3) AS token_tail,
              TRIM(CONCAT(u."first_name", ' ', u."last_name")) AS user_name,
              u."email" AS user_email
         FROM "user_devices" d
         LEFT JOIN "users" u ON u."id" = d."user_id"
        WHERE d."organization_id" = $1::uuid
          AND ($2::boolean = true OR d."revoked_at" IS NULL)
        ORDER BY d."last_seen_at" DESC
        LIMIT 100`,
      [actor.organizationId, includeRevoked, TOKEN_TAIL],
    );

    return rows.map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      userName: (row.user_name as string) || '(không rõ)',
      userEmail: (row.user_email as string) ?? '',
      installationId: String(row.installation_id),
      app: String(row.app),
      platform: String(row.platform),
      locale: String(row.locale),
      appVersion: (row.app_version as string) ?? null,
      environment: (row.environment as string) ?? null,
      lastSeenAt: new Date(row.last_seen_at as Date).toISOString(),
      revokedAt: row.revoked_at ? new Date(row.revoked_at as Date).toISOString() : null,
      tokenTail: String(row.token_tail ?? ''),
    }));
  }

  /** Danh mục loại thông báo, đọc thẳng từ registry — không có bảng nào để lệch. */
  listTypes(): TestTypeDto[] {
    return this.registry.all().map((definition) => ({
      type: definition.type,
      trigger: definition.trigger.kind,
      topic: definition.trigger.kind === 'event' ? definition.trigger.topic : null,
      at: definition.trigger.kind === 'schedule' ? definition.trigger.at : null,
      permissions: [...definition.permissions],
      targetApps: [...definition.targetApps],
      channels: [...definition.channels],
      priority: definition.priority,
      defaultEnabled: definition.defaultEnabled,
    }));
  }

  /**
   * Push THÔ: bỏ qua bộ lọc thiết lập và template, gửi thẳng tới một thiết bị.
   *
   * Đây là phép thử của HẠ TẦNG — Firebase, APNs, cấu hình native, quyền thông
   * báo trên máy. Nhận được ở đây mà không nhận được ở [dispatchTest] thì lỗi
   * nằm ở người nhận hoặc thiết lập, không phải ở đường truyền.
   */
  async sendRawPush(actor: ActorContext, dto: SendTestPushDto): Promise<SendTestPushResultDto> {
    const messaging = this.firebase.getMessaging();
    if (!messaging) {
      throw new BadRequestException(
        'Chưa cấu hình FIREBASE_SERVICE_ACCOUNT_JSON ở máy chủ nên không gửi được push.',
      );
    }

    const devices = await this.findDevices(actor, dto.deviceIds);
    const results: SendTestPushDeviceResultDto[] = [];

    // Gửi TỪNG máy một và bắt lỗi riêng: một token chết không được phép làm hỏng
    // lượt gửi tới những máy còn lại — mà đó đúng là ca hay gặp khi trong danh
    // sách có một máy đã gỡ app.
    for (const device of devices) {
      const job: DeliveryJob = {
        deliveryId: 'test',
        notificationId: uuid(),
        organizationId: actor.organizationId,
        userId: device.user_id,
        type: 'test',
        data: {},
        target: this.targetOf(dto) ?? null,
        priority: 'high',
        device: {
          id: device.id,
          fcmToken: device.fcm_token,
          platform: device.platform,
          locale: device.locale,
        },
        unreadCount: 0,
        ttlSeconds: TEST_PUSH_TTL_SECONDS,
      };
      const tokenTail = device.fcm_token.slice(-TOKEN_TAIL);

      try {
        const messageId = await messaging.send(
          this.fcm.buildMessage(job, { title: dto.title, body: dto.body }),
        );
        results.push({ deviceId: device.id, tokenTail, sent: true, messageId, error: null });
      } catch (err) {
        const code = (err as { code?: string })?.code ?? 'unknown';
        const message = err instanceof Error ? err.message : String(err);
        // Trả nguyên mã lỗi của FCM: `registration-token-not-registered` (gỡ app),
        // `third-party-auth-error` (khoá APNs sai) là hai bệnh khác hẳn nhau.
        results.push({
          deviceId: device.id,
          tokenTail,
          sent: false,
          messageId: null,
          error: `${code}: ${message}`.slice(0, 500),
        });
      }
    }

    const sent = results.filter((result) => result.sent).length;
    this.logger.log(`Test push by ${actor.userId}: ${sent}/${results.length} device(s)`);
    return { sent, failed: results.length - sent, results };
  }

  /**
   * Bắn thử một loại thông báo THẬT: bọc definition và chỉ ghi đè phần dữ liệu.
   *
   * `eventId` ngẫu nhiên mỗi lần nên bấm bao nhiêu lần cũng gửi — khoá chống
   * trùng của bảng `notifications` chỉ chặn cùng một sự kiện.
   *
   * **Người nhận lấy từ `dto.deviceIds`, không dò theo quyền.** Bước dò quyền là
   * thứ duy nhất của pipeline bị thay ở đây, và có lý do: một lượt bấm thử mà đi
   * tới điện thoại của cả phòng là thứ không ai dám bấm lần thứ hai. Mọi bước còn
   * lại — lọc theo thiết lập, dựng câu chữ từ template, deeplink, hàng đợi gửi —
   * vẫn nguyên vẹn, nên "0 người nhận" ở đây vẫn là một câu trả lời thật: người
   * đó đã tắt loại này trong app.
   */
  async dispatchTest(actor: ActorContext, dto: DispatchTestDto): Promise<DispatchTestResultDto> {
    const definition = this.registry.byType(dto.type);
    if (!definition) throw new NotFoundException(`Không có loại thông báo "${dto.type}"`);

    const devices = await this.findDevices(actor, dto.deviceIds);
    // Một người có thể chọn hai thiết bị của chính mình — gộp lại, vì người nhận
    // là NGƯỜI chứ không phải máy.
    const recipientUserIds = [...new Set(devices.map((device) => device.user_id))];

    const branchId = dto.branchId;
    const data = { ...(await this.sampleData(actor, branchId)), ...(dto.data ?? {}) };
    // Chi nhánh của thông báo cũng là chi nhánh của đích: màn chi tiết phiếu kho
    // cần `branchId` trên đường dẫn.
    const target = this.targetOf({ ...dto, targetBranchId: branchId });

    const proxy: NotificationDefinition = {
      ...definition,
      shouldSend: () => true,
      build: async (): Promise<BuiltNotification> => ({ data, target }),
    } as NotificationDefinition;

    const ctx: NotificationContext = {
      eventId: uuid(),
      organizationId: actor.organizationId,
      branchId,
      actorId: undefined,
      occurredAt: new Date(),
      payload: {},
      recipientUserIds,
    };

    const outcome = await this.dispatcher.dispatch(proxy, ctx);
    this.logger.log(
      `Test dispatch "${dto.type}" by ${actor.userId} to ${recipientUserIds.length} user(s): ${outcome.status}`,
    );

    return outcome.status === 'created'
      ? {
          status: 'created',
          reason: null,
          targetedUsers: recipientUserIds.length,
          notifications: outcome.notifications,
          deliveries: outcome.deliveries,
        }
      : {
          status: 'skipped',
          reason: outcome.reason,
          targetedUsers: recipientUserIds.length,
          notifications: 0,
          deliveries: 0,
        };
  }

  /** Chạy NGAY một job theo lịch (08:00 / 09:00) với dữ liệu THẬT. */
  async runScheduled(actor: ActorContext, dto: RunScheduledDto): Promise<RunScheduledResultDto> {
    const definition = this.registry.byType(dto.type);
    if (!definition) throw new NotFoundException(`Không có loại thông báo "${dto.type}"`);
    if (definition.trigger.kind !== 'schedule') {
      throw new BadRequestException(`Loại "${dto.type}" không chạy theo lịch`);
    }

    const scheduled = definition as ScheduledNotificationDefinition;
    const now = new Date();
    // `run` tự gọi `collect` và trả kết quả từng lượt bắn — trước đây service gọi
    // `collect` thêm một lần nữa chỉ để đếm, tức quét doanh thu/tồn kho hai lượt.
    const details = await this.runner.run(scheduled, now);

    // "created nhưng 0 thông báo" = eventId đã tồn tại → hôm nay gửi rồi. Đây là
    // ca im lặng hay gặp nhất và trước đây không có chỗ nào nói ra.
    const duplicate = details.filter((d) => d.status === 'created' && d.notifications === 0).length;
    const result: RunScheduledResultDto = {
      type: dto.type,
      firings: details.length,
      notifications: details.reduce((sum, d) => sum + d.notifications, 0),
      deliveries: details.reduce((sum, d) => sum + d.deliveries, 0),
      noRecipient: details.filter((d) => d.status === 'skipped' && d.reason === 'no-recipient').length,
      duplicate,
      failed: details.filter((d) => d.status === 'failed').length,
      details,
    };
    this.logger.log(
      `Test run of scheduled "${dto.type}" by ${actor.userId}: ${result.firings} firing(s), ` +
        `${result.notifications} notification(s), ${result.deliveries} delivery(ies), ` +
        `${result.noRecipient} without recipient, ${result.duplicate} already sent today`,
    );

    return result;
  }

  /** Nhật ký gửi gần nhất của tổ chức — nơi đọc ra "vì sao máy không nhận". */
  async listDeliveries(actor: ActorContext, query: TestDeliveryQueryDto): Promise<TestDeliveryDto[]> {
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT d."id", d."channel", d."status", d."attempts", d."last_error", d."sent_at", d."created_at",
              n."type", n."data",
              RIGHT(ud."fcm_token", $5) AS token_tail,
              TRIM(CONCAT(u."first_name", ' ', u."last_name")) AS user_name
         FROM "notification_deliveries" d
         JOIN "notifications" n ON n."id" = d."notification_id"
         LEFT JOIN "users" u ON u."id" = n."user_id"
         LEFT JOIN "user_devices" ud ON ud."id" = d."device_id"
        WHERE d."organization_id" = $1::uuid
          AND ($3::uuid IS NULL OR n."user_id" = $3::uuid)
          AND ($4::text IS NULL OR n."type" = $4::text)
        ORDER BY d."created_at" DESC
        LIMIT $2`,
      [actor.organizationId, query.limit ?? 50, query.userId ?? null, query.type ?? null, TOKEN_TAIL],
    );

    return rows.map((row) => ({
      id: String(row.id),
      createdAt: new Date(row.created_at as Date).toISOString(),
      type: String(row.type),
      userName: (row.user_name as string) || '(không rõ)',
      channel: String(row.channel),
      status: String(row.status),
      attempts: Number(row.attempts ?? 0),
      lastError: (row.last_error as string) ?? null,
      sentAt: row.sent_at ? new Date(row.sent_at as Date).toISOString() : null,
      tokenTail: (row.token_tail as string) ?? null,
      data: (row.data as Record<string, unknown>) ?? {},
    }));
  }

  /**
   * Tra nhiều thiết bị một lượt — dùng cho CẢ push thô lẫn bắn thử.
   *
   * Báo lỗi khi có id KHÔNG thuộc tổ chức hoặc đã thu hồi, thay vì lặng lẽ bỏ
   * qua: người bấm đang chờ một cái máy cụ thể rung lên, và "đã gửi" trong khi
   * thiếu mất một máy là câu trả lời sai.
   */
  private async findDevices(actor: ActorContext, deviceIds: string[]): Promise<DeviceRow[]> {
    const ids = [...new Set(deviceIds)];
    const rows: DeviceRow[] = await this.dataSource.query(
      `SELECT "id", "fcm_token", "platform", "locale", "user_id", "revoked_at"
         FROM "user_devices"
        WHERE "id" = ANY($1::uuid[]) AND "organization_id" = $2::uuid`,
      [ids, actor.organizationId],
    );

    if (rows.length !== ids.length) {
      const found = new Set(rows.map((row) => row.id));
      const missing = ids.filter((id) => !found.has(id));
      throw new NotFoundException(`Không tìm thấy thiết bị: ${missing.join(', ')}`);
    }
    const revoked = rows.filter((row) => row.revoked_at);
    if (revoked.length) {
      throw new BadRequestException(
        'Có thiết bị đã bị thu hồi (đăng xuất hoặc token chết) trong danh sách — bỏ nó ra rồi gửi lại.',
      );
    }
    return rows;
  }

  /**
   * Dữ liệu mẫu cho [dispatchTest]: đủ mọi biến mà các template đang dùng, nên
   * loại nào cũng ra câu đầy đủ. Tên cửa hàng lấy THẬT theo `branchId` để câu
   * hiện ra giống hệt bản thật.
   */
  private async sampleData(
    actor: ActorContext,
    branchId: string | undefined,
  ): Promise<Record<string, string | number | null>> {
    let store = 'Cửa hàng thử';
    if (branchId) {
      const rows: Array<{ name: string }> = await this.dataSource.query(
        `SELECT "name" FROM "branches" WHERE "id"::text = $1 AND "organization_id" = $2`,
        [branchId, actor.organizationId],
      );
      store = rows[0]?.name ?? store;
    }

    return {
      code: 'TEST-0001',
      amount: 1234000,
      actor: 'Thông báo thử',
      store,
      product: 'Hàng hoá thử',
      more: 2,
      date: toBusinessDate(new Date(Date.now() - 24 * 60 * 60 * 1000)),
    };
  }

  private targetOf(dto: {
    targetType?: string;
    targetId?: string;
    targetSlug?: string;
    targetBranchId?: string;
  }): NotificationTarget | undefined {
    if (!dto.targetType) return undefined;

    return {
      type: dto.targetType as NotificationTarget['type'],
      id: dto.targetId,
      slug: dto.targetSlug,
      branchId: dto.targetBranchId,
    };
  }
}
