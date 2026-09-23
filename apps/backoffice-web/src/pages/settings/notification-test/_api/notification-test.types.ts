/** Hình dạng dữ liệu của `admin/notifications/test/*` — công cụ TẠM. */

export interface TestDevice {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  installationId: string;
  app: string;
  platform: string;
  locale: string;
  appVersion: string | null;
  environment: string | null;
  lastSeenAt: string;
  revokedAt: string | null;
  /** 8 ký tự cuối của FCM token — server không bao giờ trả token đầy đủ. */
  tokenTail: string;
}

export interface TestType {
  type: string;
  /** `event` | `schedule` */
  trigger: string;
  topic: string | null;
  at: string | null;
  permissions: string[];
  targetApps: string[];
  channels: string[];
  priority: string;
  defaultEnabled: boolean;
}

export interface TestDelivery {
  id: string;
  createdAt: string;
  type: string;
  userName: string;
  channel: string;
  status: string;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  tokenTail: string | null;
  data: Record<string, unknown>;
}

export interface SendRawPushBody {
  /** Thiết bị nhận — bắt buộc, ít nhất một. */
  deviceIds: string[];
  title: string;
  body: string;
  targetType?: string;
  targetId?: string;
  targetSlug?: string;
  targetBranchId?: string;
}

/** Kết quả của MỘT máy — một token chết không kéo theo những máy còn lại. */
export interface SendRawPushDeviceResult {
  deviceId: string;
  tokenTail: string;
  sent: boolean;
  messageId: string | null;
  error: string | null;
}

export interface SendRawPushResult {
  /** Số máy gửi được. */
  sent: number;
  failed: number;
  results: SendRawPushDeviceResult[];
}

export interface DispatchTestBody {
  type: string;
  /** Thiết bị nhận — bắt buộc, ít nhất một. Người sở hữu chúng thành người nhận. */
  deviceIds: string[];
  branchId?: string;
  data?: Record<string, string | number | null>;
  targetType?: string;
  targetId?: string;
  targetSlug?: string;
}

export interface DispatchTestResult {
  /** `created` | `skipped` */
  status: string;
  /** Số NGƯỜI nhận suy ra từ các thiết bị đã chọn. */
  targetedUsers: number;
  /** `no-recipient` | `build-null` | `should-send` khi bị bỏ */
  reason: string | null;
  notifications: number;
  deliveries: number;
}

export interface RunScheduledFiring {
  eventId: string;
  /** `created` | `skipped` | `failed` */
  status: string;
  reason: string | null;
  notifications: number;
  deliveries: number;
}

export interface RunScheduledResult {
  type: string;
  /** Số "chuyện đáng báo" mà job tìm thấy — KHÔNG phải số đã gửi. */
  firings: number;
  notifications: number;
  deliveries: number;
  /** Bị bỏ vì không ai đủ điều kiện nhận. */
  noRecipient: number;
  /** Hôm nay đã gửi rồi nên không gửi lại (eventId trùng). */
  duplicate: number;
  failed: number;
  details: RunScheduledFiring[];
}
