export { createKafkaClient, type KafkaClientConfig } from './client';

export {
  createProducer,
  publishEvent,
  publishBatch,
  type ProducerConfig,
} from './producer';

export {
  createConsumer,
  subscribeAndRun,
  type ConsumerConfig,
  type EventHandler,
  type MessageMetadata,
  type RunOptions,
} from './consumer';

export { ERP_TOPICS, buildTopicName, type ErpTopic } from './topics';

export { createDomainEvent, type EventContext } from './envelope';

export { withRetry, type RetryOptions } from './retry';

export {
  createDlqHandler,
  buildDlqTopicName,
  type DeadLetterConfig,
} from './dlq';
