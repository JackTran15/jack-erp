import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebSocketModule } from '../websocket/websocket.module';
import { FcmPushChannel } from './core/channels/fcm-push.channel';
import { FirebaseAdminProvider } from './core/channels/firebase-admin.provider';
import type { NotificationChannel } from './core/channels/notification-channel.interface';
import { WebSocketNotifier } from './core/channels/websocket-notifier.service';
import { NotificationRegistry } from './core/definition/notification-registry.service';
import { NotificationDeliveryWorker } from './core/delivery/notification-delivery.worker';
import { NotificationDispatcher } from './core/dispatcher/notification-dispatcher.service';
import { NotificationEventConsumer } from './core/dispatcher/notification-event.consumer';
import { NotificationLookupService } from './core/lookup/notification-lookup.service';
import { NOTIFICATION_CHANNELS, NOTIFICATION_DEFINITIONS, NotificationDefinition } from './core/notification.types';
import { NotificationPreferenceService } from './core/preferences/notification-preference.service';
import { NotificationRecipientResolver } from './core/recipients/notification-recipient.resolver';
import { ScheduledNotificationRunner } from './core/schedule/scheduled-notification.runner';
import { PUSH_TEMPLATE_CATALOG, TemplateRenderer } from './core/templates/template-renderer.service';
import { NOTIFICATION_DEFINITION_CLASSES } from './definitions';
import { NotificationDeliveryEntity } from './entities/notification-delivery.entity';
import { NotificationEntity } from './entities/notification.entity';
import { UserDeviceEntity } from './entities/user-device.entity';
import { UserNotificationSettingEntity } from './entities/user-notification-setting.entity';
import { AdminNotificationTestController } from './controllers/admin-notification-test.controller';
import { NotificationInboxService } from './services/notification-inbox.service';
import { NotificationSettingsService } from './services/notification-settings.service';
import { NotificationTestService } from './services/notification-test.service';
import { UserDeviceService } from './services/user-device.service';
import { PUSH_TEMPLATES } from './templates';

/**
 * Notification core (see `core/notification.types.ts` for the module rule).
 *
 * HTTP lives in `MobileModule` (`MobileNotificationController`), which imports
 * this module for the three services below — the same split every `/mobile/*`
 * endpoint follows.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationEntity,
      NotificationDeliveryEntity,
      UserDeviceEntity,
      UserNotificationSettingEntity,
    ]),
    WebSocketModule,
  ],
  // Công cụ TẠM của trang "Test thông báo" — cách gỡ ở `notification-test.config.ts`.
  controllers: [AdminNotificationTestController],
  providers: [
    // ── Definitions (plugins) ──
    ...NOTIFICATION_DEFINITION_CLASSES,
    {
      provide: NOTIFICATION_DEFINITIONS,
      useFactory: (...definitions: NotificationDefinition[]) => definitions,
      inject: NOTIFICATION_DEFINITION_CLASSES,
    },
    // ── Queued channels (strategies) ──
    FirebaseAdminProvider,
    FcmPushChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (...channels: NotificationChannel[]) => channels,
      inject: [FcmPushChannel],
    },
    { provide: PUSH_TEMPLATE_CATALOG, useValue: PUSH_TEMPLATES },
    // ── Core ──
    NotificationRegistry,
    NotificationRecipientResolver,
    NotificationPreferenceService,
    NotificationLookupService,
    TemplateRenderer,
    WebSocketNotifier,
    NotificationDeliveryWorker,
    NotificationDispatcher,
    NotificationEventConsumer,
    ScheduledNotificationRunner,
    // ── HTTP-facing services ──
    NotificationInboxService,
    NotificationSettingsService,
    UserDeviceService,
    NotificationTestService,
  ],
  exports: [NotificationInboxService, NotificationSettingsService, UserDeviceService, NotificationDispatcher, NotificationRegistry],
})
export class NotificationModule {}
