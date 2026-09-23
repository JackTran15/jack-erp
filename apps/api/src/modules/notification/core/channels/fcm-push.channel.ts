import { Injectable, Logger } from '@nestjs/common';
import type { Message } from 'firebase-admin/messaging';
import { TemplateRenderer } from '../templates/template-renderer.service';
import { FirebaseAdminProvider } from './firebase-admin.provider';
import type { DeliveryJob, DeliveryResult, NotificationChannel } from './notification-channel.interface';

/** Payload contract version sent in `data.v`; bump when the data shape changes. */
export const PUSH_PAYLOAD_VERSION = '1';

const ANDROID_CHANNEL = { high: 'erp_documents', normal: 'erp_daily' } as const;

/** FCM error codes meaning the token is dead — retrying can never succeed. */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** FCM error codes worth retrying. */
const TRANSIENT_CODES = new Set([
  'messaging/internal-error',
  'messaging/server-unavailable',
  'messaging/unavailable',
  'messaging/quota-exceeded',
  'messaging/message-rate-exceeded',
  'messaging/device-message-rate-exceeded',
  'messaging/third-party-auth-error',
  'app/network-error',
  'app/network-timeout',
]);

/**
 * FCM push via Firebase Admin (HTTP v1).
 *
 * Always sends a `notification` block (never data-only): with it the OS shows
 * the push while the app is in background/terminated without running Dart.
 * `data` is flat string→string (FCM requirement).
 */
@Injectable()
export class FcmPushChannel implements NotificationChannel {
  readonly key = 'fcm_push' as const;
  readonly perDevice = true;
  private readonly logger = new Logger(FcmPushChannel.name);

  constructor(
    private readonly firebase: FirebaseAdminProvider,
    private readonly renderer: TemplateRenderer,
  ) {}

  async deliver(job: DeliveryJob): Promise<DeliveryResult> {
    if (!job.device) return { outcome: 'drop', error: 'fcm_push delivery without device' };

    const messaging = this.firebase.getMessaging();
    // Credentials missing: keep the row and retry later — they may be fixed without losing today's pushes.
    if (!messaging) return { outcome: 'retry', error: 'firebase-not-configured' };

    const text = this.renderer.render(job.type, job.device.locale, job.data);
    if (!text) return { outcome: 'drop', error: `no-template:${job.type}` };

    const message = this.buildMessage(job, text);
    try {
      const providerMessageId = await messaging.send(message);
      return { outcome: 'sent', providerMessageId };
    } catch (err) {
      return this.classify(err, job);
    }
  }

  buildMessage(job: DeliveryJob, text: { title: string; body: string }): Message {
    const target = job.target;
    const high = job.priority === 'high';
    const ttl = Math.max(job.ttlSeconds, 0);

    return {
      token: job.device!.fcmToken,
      notification: { title: text.title, body: text.body },
      data: {
        notificationId: job.notificationId,
        type: job.type,
        organizationId: job.organizationId,
        targetType: target?.type ?? '',
        targetId: target?.id ?? '',
        targetSlug: target?.slug ?? '',
        targetBranchId: target?.branchId ?? '',
        v: PUSH_PAYLOAD_VERSION,
      },
      android: {
        priority: high ? 'high' : 'normal',
        ttl: ttl * 1000,
        notification: {
          channelId: high ? ANDROID_CHANNEL.high : ANDROID_CHANNEL.normal,
          // A retried send replaces the earlier one in the tray instead of stacking.
          tag: job.notificationId,
        },
      },
      apns: {
        headers: {
          'apns-priority': high ? '10' : '5',
          'apns-expiration': String(Math.floor(Date.now() / 1000) + ttl),
        },
        payload: {
          aps: { sound: 'default', badge: job.unreadCount, threadId: job.type },
        },
      },
    };
  }

  private classify(err: unknown, job: DeliveryJob): DeliveryResult {
    const code = (err as { code?: string })?.code ?? 'unknown';
    const message = err instanceof Error ? err.message : String(err);
    const error = `${code}: ${message}`.slice(0, 1000);
    const tokenTail = job.device?.fcmToken.slice(-8);

    if (DEAD_TOKEN_CODES.has(code) || (code === 'messaging/invalid-argument' && /token/i.test(message))) {
      this.logger.log(`Dead FCM token …${tokenTail} (${code}) — revoking device ${job.device?.id}`);
      return { outcome: 'drop', error, revokeDevice: true };
    }
    if (code === 'messaging/third-party-auth-error') {
      // APNs key wrong/expired — hits EVERY iOS device, so shout.
      this.logger.error(`APNs auth error from FCM — check the APNs key uploaded to Firebase: ${message}`);
      return { outcome: 'retry', error };
    }
    if (TRANSIENT_CODES.has(code) || code === 'unknown') {
      return { outcome: 'retry', error };
    }
    this.logger.error(`Permanent FCM error for delivery ${job.deliveryId}: ${error}`);
    return { outcome: 'drop', error };
  }
}
