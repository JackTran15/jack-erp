import { Kafka, type SASLOptions } from 'kafkajs';

export interface KafkaClientConfig {
  clientId: string;
  brokers: string[];
  ssl?: boolean;
  sasl?: SASLOptions;
  connectionTimeout?: number;
  requestTimeout?: number;
}

export function createKafkaClient(config: KafkaClientConfig): Kafka {
  return new Kafka({
    clientId: config.clientId,
    brokers: config.brokers,
    ssl: config.ssl,
    sasl: config.sasl,
    connectionTimeout: config.connectionTimeout ?? 3000,
    requestTimeout: config.requestTimeout ?? 30000,
  });
}
