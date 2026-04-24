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
  ) {}

  async onModuleInit(): Promise<void> {
    this.discoverHandlers();
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

      const methodNames = Object.getOwnPropertyNames(prototype).filter(
        (name) => name !== 'constructor' && typeof prototype[name] === 'function',
      );

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

      await subscribeAndRun(consumer, topic, wrapWithDlq(handler));

      this.consumers.push({ consumer, topic });
      this.logger.log(`Consumer started: group=${groupId} topic=${topic}`);
    }
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
