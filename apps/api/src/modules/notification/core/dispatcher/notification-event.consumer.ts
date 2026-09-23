import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DomainEvent } from '@erp/shared-interfaces';
import { EventConsumerManager } from '../../../events/event-consumer.service';
import { NotificationRegistry } from '../definition/notification-registry.service';
import { NotificationDispatcher } from './notification-dispatcher.service';

/**
 * One Kafka consumer group per topic that any definition listens to — derived
 * from the registry, so a new type on a new topic needs NO change here.
 *
 * Registration happens in the CONSTRUCTOR: `EventConsumerManager` starts every
 * pending handler in its own `onModuleInit`, which may run before ours.
 * Group ids are `<prefix>.notification.<topic>`, separate from the business
 * consumers, so a slow push never delays accounting or stock consumers.
 * DLQ + `processed_events` dedupe come from `EventConsumerManager`.
 */
@Injectable()
export class NotificationEventConsumer {
  private readonly logger = new Logger(NotificationEventConsumer.name);

  constructor(
    manager: EventConsumerManager,
    config: ConfigService,
    private readonly registry: NotificationRegistry,
    private readonly dispatcher: NotificationDispatcher,
  ) {
    const prefix = config.get<string>('KAFKA_CONSUMER_GROUP_PREFIX', 'erp-api');
    for (const topic of registry.topics()) {
      manager.registerHandler(topic, `${prefix}.notification.${topic}`, (event) => this.handle(topic, event));
      this.logger.log(`Notification consumer registered for ${topic}`);
    }
  }

  async handle(topic: string, event: DomainEvent<unknown>): Promise<void> {
    for (const definition of this.registry.byTopic(topic)) {
      const payload = event.payload as Record<string, unknown>;
      const actorId = definition.actorIdOf
        ? definition.actorIdOf(payload)
        : typeof payload?.actorId === 'string'
          ? payload.actorId
          : undefined;

      await this.dispatcher.dispatch(definition, {
        eventId: event.eventId,
        organizationId: event.organizationId,
        branchId: event.branchId,
        actorId,
        occurredAt: new Date(event.timestamp),
        payload,
      });
    }
  }
}
