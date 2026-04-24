import type { Consumer, Kafka, EachMessagePayload } from 'kafkajs';
import type { DomainEvent } from '@erp/shared-interfaces';

export interface ConsumerConfig {
  groupId: string;
  sessionTimeout?: number;
  heartbeatInterval?: number;
  maxBytesPerPartition?: number;
  fromBeginning?: boolean;
}

const CONSUMER_DEFAULTS = {
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  maxBytesPerPartition: 1048576,
  fromBeginning: false,
} as const;

export interface MessageMetadata {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
  key: string | undefined;
}

export type EventHandler<T = unknown> = (
  event: DomainEvent<T>,
  metadata: MessageMetadata,
) => Promise<void>;

export interface RunOptions {
  autoCommit?: boolean;
  eachBatchSize?: number;
}

export function createConsumer(kafka: Kafka, config: ConsumerConfig): Consumer {
  const merged = { ...CONSUMER_DEFAULTS, ...config };

  return kafka.consumer({
    groupId: merged.groupId,
    sessionTimeout: merged.sessionTimeout,
    heartbeatInterval: merged.heartbeatInterval,
    maxBytesPerPartition: merged.maxBytesPerPartition,
  });
}

export async function subscribeAndRun(
  consumer: Consumer,
  topic: string,
  handler: EventHandler<any>,
  options?: RunOptions,
): Promise<void> {
  const fromBeginning = CONSUMER_DEFAULTS.fromBeginning;
  const autoCommit = options?.autoCommit ?? true;

  await consumer.subscribe({ topic, fromBeginning });

  await consumer.run({
    autoCommit,
    eachMessage: async (payload: EachMessagePayload) => {
      const { topic: msgTopic, partition, message } = payload;

      const event: DomainEvent<unknown> = JSON.parse(
        message.value?.toString() ?? '{}',
      );

      const metadata: MessageMetadata = {
        topic: msgTopic,
        partition,
        offset: message.offset,
        timestamp: message.timestamp,
        key: message.key?.toString(),
      };

      await handler(event, metadata);
    },
  });
}
