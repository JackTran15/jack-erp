import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EventNotificationDefinition,
  NOTIFICATION_DEFINITIONS,
  NotificationApp,
  NotificationDefinition,
  ScheduledNotificationDefinition,
} from '../notification.types';

/**
 * Lookup table `type` / `topic` → definition.
 *
 * Validates in the CONSTRUCTOR so a misconfigured definition fails the boot,
 * not the first 09:00 run. The constructor (not `onModuleInit`) also matters
 * for the consumer: topics must be known before `EventConsumerManager` starts
 * its consumers in its own `onModuleInit`.
 */
@Injectable()
export class NotificationRegistry {
  private readonly logger = new Logger(NotificationRegistry.name);
  private readonly byTypeMap = new Map<string, NotificationDefinition>();
  private readonly byTopicMap = new Map<string, EventNotificationDefinition[]>();

  constructor(@Inject(NOTIFICATION_DEFINITIONS) definitions: NotificationDefinition[]) {
    for (const definition of definitions) {
      this.register(definition);
    }
    this.logger.log(
      `Registered ${definitions.length} notification definition(s): ${[...this.byTypeMap.keys()].join(', ')}`,
    );
  }

  private register(definition: NotificationDefinition): void {
    const { type } = definition;
    if (!/^[a-z][a-z0-9_]*$/.test(type)) {
      throw new Error(`Notification type "${type}" must be snake_case`);
    }
    if (this.byTypeMap.has(type)) {
      throw new Error(`Duplicate notification type "${type}"`);
    }
    if (definition.permissions.length === 0) {
      throw new Error(`Notification type "${type}" declares no permission`);
    }
    if (definition.targetApps.length === 0) {
      throw new Error(`Notification type "${type}" declares no target app`);
    }
    this.byTypeMap.set(type, definition);

    if (definition.trigger.kind === 'schedule' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(definition.trigger.at)) {
      throw new Error(`Notification type "${type}" has an invalid schedule time "${definition.trigger.at}" (HH:mm)`);
    }
    if (definition.trigger.kind === 'event') {
      const list = this.byTopicMap.get(definition.trigger.topic) ?? [];
      list.push(definition as EventNotificationDefinition);
      this.byTopicMap.set(definition.trigger.topic, list);
    }
  }

  /** Mọi definition đang đăng ký, theo thứ tự khai. */
  all(): NotificationDefinition[] {
    return [...this.byTypeMap.values()];
  }

  byType(type: string): NotificationDefinition | undefined {
    return this.byTypeMap.get(type);
  }

  /** One topic may trigger several types (goods_receipt.posted → purchase AND stock_in). */
  byTopic(topic: string): EventNotificationDefinition[] {
    return this.byTopicMap.get(topic) ?? [];
  }

  topics(): string[] {
    return [...this.byTopicMap.keys()];
  }

  scheduled(): ScheduledNotificationDefinition[] {
    return [...this.byTypeMap.values()].filter(
      (d): d is ScheduledNotificationDefinition => d.trigger.kind === 'schedule',
    );
  }

  /** Types an app can show — the single source of `availableTypes`. */
  typesForApp(app: NotificationApp): string[] {
    return [...this.byTypeMap.values()]
      .filter((d) => d.targetApps.includes(app))
      .map((d) => d.type);
  }
}
