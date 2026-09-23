import { Injectable, Logger } from '@nestjs/common';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';

const APP_NAME = 'erp-notification';

/**
 * Lazily initialised Firebase Admin app, from `FIREBASE_SERVICE_ACCOUNT_JSON`
 * (base64 of the service-account JSON — never commit the file itself).
 *
 * Missing / invalid credentials DISABLE push instead of failing the boot: a
 * dev machine without Firebase must still run the API, and business flows
 * never depend on notifications. The warning is logged once.
 */
@Injectable()
export class FirebaseAdminProvider {
  private readonly logger = new Logger(FirebaseAdminProvider.name);
  private messaging: Messaging | null | undefined;

  getMessaging(): Messaging | null {
    if (this.messaging !== undefined) return this.messaging;
    this.messaging = this.init();
    return this.messaging;
  }

  private init(): Messaging | null {
    if (process.env.NOTIFICATION_PUSH_ENABLED === 'false') {
      this.logger.warn('Push disabled via NOTIFICATION_PUSH_ENABLED=false');
      return null;
    }
    const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!encoded) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_JSON not set — push notifications are disabled');
      return null;
    }
    try {
      const credentials = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
      const existing = getApps().find((app) => app.name === APP_NAME);
      const app: App = existing ?? initializeApp({ credential: cert(credentials) }, APP_NAME);
      this.logger.log(`Firebase Admin initialised (project=${credentials.project_id ?? '?'})`);
      return getMessaging(app);
    } catch (err) {
      this.logger.error(
        `Invalid FIREBASE_SERVICE_ACCOUNT_JSON — push notifications are disabled: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }
}
