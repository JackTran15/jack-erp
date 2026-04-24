import type { Producer } from 'kafkajs';
import type { DomainEvent } from '@erp/shared-interfaces';
import type { EventHandler, MessageMetadata } from './consumer';
import { withRetry, type RetryOptions } from './retry';

export interface DeadLetterConfig {
  dlqTopic: string;
  maxRetries: number;
}

export function buildDlqTopicName(originalTopic: string): string {
  return `${originalTopic}.dlq`;
}

export function createDlqHandler(
  producer: Producer,
  dlqConfig: DeadLetterConfig,
): (handler: EventHandler<any>) => EventHandler<any> {
  return (handler: EventHandler<any>): EventHandler<any> => {
    return async (event: DomainEvent<unknown>, metadata: MessageMetadata) => {
      const retryOptions: RetryOptions = {
        maxRetries: dlqConfig.maxRetries,
      };

      try {
        await withRetry(() => handler(event, metadata), retryOptions);
      } catch (error) {
        await producer.send({
          topic: dlqConfig.dlqTopic,
          messages: [
            {
              key: event.eventId,
              value: JSON.stringify({
                originalTopic: metadata.topic,
                originalPartition: metadata.partition,
                originalOffset: metadata.offset,
                event,
                error: error instanceof Error ? error.message : String(error),
                failedAt: new Date().toISOString(),
              }),
              headers: {
                eventType: event.eventType,
                correlationId: event.correlationId,
              },
            },
          ],
        });
      }
    };
  };
}
