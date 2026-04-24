import type { Kafka, Producer } from 'kafkajs';
import { CompressionTypes } from 'kafkajs';
import type { DomainEvent } from '@erp/shared-interfaces';

export interface ProducerConfig {
  acks?: number;
  compression?: CompressionTypes;
  maxRetries?: number;
  idempotent?: boolean;
  lingerMs?: number;
}

const PRODUCER_DEFAULTS: Required<ProducerConfig> = {
  acks: -1,
  compression: CompressionTypes.GZIP,
  maxRetries: 5,
  idempotent: true,
  lingerMs: 5,
};

export function createProducer(kafka: Kafka, config?: ProducerConfig): Producer {
  const merged = { ...PRODUCER_DEFAULTS, ...config };

  return kafka.producer({
    allowAutoTopicCreation: false,
    idempotent: merged.idempotent,
    maxInFlightRequests: merged.idempotent ? 1 : undefined,
    retry: { retries: merged.maxRetries },
  });
}

export async function publishEvent<T>(
  producer: Producer,
  topic: string,
  event: DomainEvent<T>,
  key?: string,
): Promise<void> {
  const merged = { ...PRODUCER_DEFAULTS };

  await producer.send({
    topic,
    compression: merged.compression,
    acks: merged.acks,
    messages: [
      {
        key: key ?? event.eventId,
        value: JSON.stringify(event),
        headers: {
          eventType: event.eventType,
          correlationId: event.correlationId,
        },
      },
    ],
  });
}

export async function publishBatch<T>(
  producer: Producer,
  messages: { topic: string; event: DomainEvent<T>; key?: string }[],
): Promise<void> {
  const merged = { ...PRODUCER_DEFAULTS };

  await producer.sendBatch({
    compression: merged.compression,
    topicMessages: messages.map(({ topic, event, key }) => ({
      topic,
      messages: [
        {
          key: key ?? event.eventId,
          value: JSON.stringify(event),
          headers: {
            eventType: event.eventType,
            correlationId: event.correlationId,
          },
        },
      ],
    })),
  });
}
