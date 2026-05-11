import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryService, Reflector } from '@nestjs/core';
import type { Consumer } from 'kafkajs';
import type { EventHandler } from '@erp/shared-kafka-client';
import {
  createConsumer,
  subscribeAndRun,
  createDlqHandler,
  buildDlqTopicName,
} from '@erp/shared-kafka-client';
import { EventPublisher } from './event-publisher.service';
import {
  ON_DOMAIN_EVENT_KEY,
  type DomainEventMetadata,
} from './decorators/on-event.decorator';
import { DeadLetterService } from './services/dead-letter.service';
import { EventIdempotencyService } from './services/event-idempotency.service';
import { TopicInitializer } from './topics.init';

interface RegisteredConsumer {
  consumer: Consumer;
  topic: string;
}

@Injectable()
export class EventConsumerManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventConsumerManager.name);
  private readonly consumers: RegisteredConsumer[] = [];
  private readonly pendingHandlers: {
    topic: string;
    groupId: string;
    handler: EventHandler;
  }[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly publisher: EventPublisher,
    private readonly discoveryService: DiscoveryService,
    private readonly reflector: Reflector,
    private readonly deadLetterService: DeadLetterService,
    private readonly idempotencyService: EventIdempotencyService,
    private readonly topicInitializer: TopicInitializer,
  ) {}

  async onModuleInit(): Promise<void> {
    this.discoverHandlers();
    await this.topicInitializer.ensureTopics();
    await this.startAll();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopAll();
  }

  registerHandler(
    topic: string,
    groupId: string,
    handler: EventHandler,
  ): void {
    this.pendingHandlers.push({ topic, groupId, handler });
  }

  private discoverHandlers(): void {
    const prefix = this.config.get<string>('KAFKA_CONSUMER_GROUP_PREFIX', 'erp-api');
    const wrappers = this.discoveryService.getProviders();

    for (const wrapper of wrappers) {
      const { instance } = wrapper;
      if (!instance || typeof instance !== 'object') continue;

      const prototype = Object.getPrototypeOf(instance);
      if (!prototype) continue;

      const methodNames = Object.getOwnPropertyNames(prototype).filter((name) => {
        if (name === 'constructor') return false;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        return typeof descriptor?.value === 'function';
      });

      for (const methodName of methodNames) {
        const meta = this.reflector.get<DomainEventMetadata | undefined>(
          ON_DOMAIN_EVENT_KEY,
          prototype[methodName],
        );

        if (!meta) continue;

        const groupId = meta.options?.groupId ?? `${prefix}.${meta.topic}`;
        const boundHandler = (instance as Record<string, Function>)[methodName].bind(instance);

        this.pendingHandlers.push({
          topic: meta.topic,
          groupId,
          handler: boundHandler,
        });

        this.logger.log(
          `Discovered event handler: ${instance.constructor.name}.${methodName} → ${meta.topic}`,
        );
      }
    }
  }

  async startAll(): Promise<void> {
    const kafka = this.publisher.getKafkaInstance();
    const producer = this.publisher.getProducer();

    for (const { topic, groupId, handler } of this.pendingHandlers) {
      const consumer = createConsumer(kafka, { groupId });
      await consumer.connect();

      const dlqTopic = buildDlqTopicName(topic);
      const wrapWithDlq = createDlqHandler(producer, {
        dlqTopic,
        maxRetries: 3,
      });

      const idempotentHandler = this.wrapWithIdempotency(groupId, topic, handler);
      await subscribeAndRun(consumer, topic, wrapWithDlq(idempotentHandler));

      this.consumers.push({ consumer, topic });
      this.logger.log(`Consumer started: group=${groupId} topic=${topic}`);

      // DLQ recorder — subscribes to <topic>.dlq and writes to dead_letter_events
      await this.startDlqRecorder(topic, dlqTopic, groupId);
    }
  }

  private wrapWithIdempotency(
    consumerName: string,
    topic: string,
    handler: EventHandler,
  ): EventHandler {
    return async (event, metadata) => {
      const claimed = await this.idempotencyService.tryClaim(consumerName, event, topic);
      if (!claimed) {
        this.logger.log(
          `Skipped already-processed event ${event.eventId} (consumer=${consumerName} topic=${topic})`,
        );
        return;
      }

      try {
        await handler(event, metadata);
      } catch (err) {
        await this.idempotencyService.release(consumerName, event.eventId);
        throw err;
      }
    };
  }

  private async startDlqRecorder(
    originalTopic: string,
    dlqTopic: string,
    parentGroupId: string,
  ): Promise<void> {
    const kafka = this.publisher.getKafkaInstance();
    const consumer = createConsumer(kafka, {
      groupId: `${parentGroupId}.dlq-recorder`,
    });
    await consumer.connect();
    await consumer.subscribe({ topic: dlqTopic, fromBeginning: false });

    await consumer.run({
      autoCommit: true,
      eachMessage: async ({ partition, message }) => {
        try {
          const body = JSON.parse(message.value?.toString() ?? '{}');
          const event = body.event ?? {};
          await this.deadLetterService.record({
            topic: body.originalTopic ?? originalTopic,
            partition: body.originalPartition ?? partition,
            offset: body.originalOffset ?? message.offset,
            key: message.key?.toString(),
            payload: event,
            error: body.error,
            organizationId: event.organizationId ?? 'unknown',
            branchId: event.branchId,
          });
        } catch (err) {
          this.logger.error(
            `Failed to record DLQ message from ${dlqTopic}: ${err instanceof Error ? err.message : err}`,
          );
        }
      },
    });

    this.consumers.push({ consumer, topic: dlqTopic });
    this.logger.log(`DLQ recorder started: topic=${dlqTopic}`);
  }

  async stopAll(): Promise<void> {
    for (const { consumer, topic } of this.consumers) {
      try {
        await consumer.disconnect();
        this.logger.log(`Consumer disconnected: topic=${topic}`);
      } catch (err) {
        this.logger.error(`Error disconnecting consumer for ${topic}`, err);
      }
    }
    this.consumers.length = 0;
  }
}
