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

/**
 * Số consumer group được join song song lúc boot.
 *
 * Trước đây vòng lặp chạy tuần tự nên mỗi handler phải chờ JoinGroup +
 * SyncGroup của handler trước xong mới bắt đầu — 25 handler nối đuôi nhau là
 * vài phút boot. Join song song nhưng có trần để không dội hết một lượt vào
 * group coordinator của Redpanda.
 */
const CONSUMER_START_CONCURRENCY = 8;

/** Mọi topic DLQ của ERP; dùng cho recorder gom chung. */
const DLQ_TOPIC_PATTERN = /^erp\..*\.dlq$/;

@Injectable()
export class EventConsumerManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventConsumerManager.name);
  private readonly consumers: RegisteredConsumer[] = [];
  private readonly pendingHandlers: {
    topic: string;
    groupId: string;
    handler: EventHandler;
  }[] = [];
  private groupPrefix = 'erp-api';

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
    this.groupPrefix = prefix;
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
    const startedAt = Date.now();

    const started = await this.mapWithConcurrency(
      this.pendingHandlers,
      CONSUMER_START_CONCURRENCY,
      async ({ topic, groupId, handler }) => {
        const consumer = createConsumer(kafka, { groupId });
        await consumer.connect();

        const wrapWithDlq = createDlqHandler(producer, {
          dlqTopic: buildDlqTopicName(topic),
          maxRetries: 3,
        });

        const idempotentHandler = this.wrapWithIdempotency(
          groupId,
          topic,
          handler,
        );
        await subscribeAndRun(consumer, topic, wrapWithDlq(idempotentHandler));

        this.logger.log(`Consumer started: group=${groupId} topic=${topic}`);
        return { consumer, topic };
      },
    );
    this.consumers.push(...started);

    await this.startDlqRecorder();

    this.logger.log(
      `All consumers started: ${started.length} handler group(s) + 1 DLQ recorder in ${Date.now() - startedAt}ms`,
    );
  }

  /** Chạy `fn` trên `items` với trần `limit` tác vụ đồng thời, giữ nguyên thứ tự kết quả. */
  private async mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        for (;;) {
          const index = cursor++;
          if (index >= items.length) return;
          results[index] = await fn(items[index]);
        }
      },
    );
    await Promise.all(workers);
    return results;
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

  /**
   * MỘT recorder cho mọi topic `.dlq`, thay vì một group riêng cho mỗi handler.
   *
   * Cả 25 recorder cũ chạy đúng một việc giống nhau (ghi vào `dead_letter_events`),
   * nên tách group không cho thêm gì mà nhân đôi số lần rebalance lúc boot.
   * Topic gốc lấy từ `originalTopic` trong payload — `createDlqHandler` luôn
   * ghi field này; bản thân tên topic `.dlq` là đường lui khi payload hỏng.
   */
  private async startDlqRecorder(): Promise<void> {
    const kafka = this.publisher.getKafkaInstance();
    const consumer = createConsumer(kafka, {
      groupId: `${this.groupPrefix}.dlq-recorder`,
    });
    await consumer.connect();
    // Subscribe bằng regex: `ensureTopics()` đã tạo xong mọi topic .dlq trước
    // khi startAll() chạy, nên không cần liệt kê tay và không vỡ khi thiếu topic.
    await consumer.subscribe({
      topics: [DLQ_TOPIC_PATTERN],
      fromBeginning: false,
    });

    await consumer.run({
      autoCommit: true,
      eachMessage: async ({ topic: dlqTopic, partition, message }) => {
        try {
          const body = JSON.parse(message.value?.toString() ?? '{}');
          const event = body.event ?? {};
          await this.deadLetterService.record({
            topic: body.originalTopic ?? dlqTopic.replace(/\.dlq$/, ''),
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

    this.consumers.push({ consumer, topic: 'erp.*.dlq' });
    this.logger.log(
      `DLQ recorder started: group=${this.groupPrefix}.dlq-recorder pattern=${DLQ_TOPIC_PATTERN}`,
    );
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
