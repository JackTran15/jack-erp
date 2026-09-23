import type { NotificationChannelKey, NotificationData, NotificationTarget } from '../notification.types';

/** Everything a queued channel needs to deliver one row of `notification_deliveries`. */
export interface DeliveryJob {
  deliveryId: string;
  notificationId: string;
  organizationId: string;
  userId: string;
  type: string;
  data: NotificationData;
  target: NotificationTarget | null;
  priority: 'high' | 'normal';
  /** Device fields — null for device-less channels. */
  device: {
    id: string;
    fcmToken: string;
    platform: string;
    locale: string;
  } | null;
  /** Unread count of the user at send time (iOS badge). */
  unreadCount: number;
  /** Seconds left before the notification stops being worth showing. */
  ttlSeconds: number;
}

export type DeliveryResult =
  | { outcome: 'sent'; providerMessageId?: string }
  /** Transient — the worker retries with backoff. */
  | { outcome: 'retry'; error: string }
  /** Permanent — never retried. `revokeDevice` marks the token dead. */
  | { outcome: 'drop'; error: string; revokeDevice?: boolean };

/**
 * Strategy for one QUEUED channel (delivered by `NotificationDeliveryWorker`).
 * Adding a channel = implement this + add it to the channel list in the module.
 */
export interface NotificationChannel {
  readonly key: NotificationChannelKey;
  /** Whether rows are fanned out per device (push) or once per notification. */
  readonly perDevice: boolean;
  deliver(job: DeliveryJob): Promise<DeliveryResult>;
}
