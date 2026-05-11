import { Kafka, logLevel, type SASLOptions, type logCreator } from 'kafkajs';

export interface KafkaClientConfig {
  clientId: string;
  brokers: string[];
  ssl?: boolean;
  sasl?: SASLOptions;
  connectionTimeout?: number;
  requestTimeout?: number;
}

/**
 * Map kafkajs's noisy "transient" ERRORs (NOT_LEADER_FOR_PARTITION,
 * LEADER_NOT_AVAILABLE) down to DEBUG. These are retried internally by
 * kafkajs and surface during topic creation / metadata refresh.
 */
const RETRIABLE_METADATA_ERRORS = new Set([
  'NOT_LEADER_FOR_PARTITION',
  'LEADER_NOT_AVAILABLE',
  'This server does not host this topic-partition',
  'There is no leader for this topic-partition as we are in the middle of a leadership election',
]);

const erpLogCreator: logCreator = () => {
  return ({ namespace, level, label, log }) => {
    const message = (log?.message as string) ?? '';
    const errorText = (log?.error as string) ?? '';

    if (
      level === logLevel.ERROR &&
      [...RETRIABLE_METADATA_ERRORS].some(
        (signal) => message.includes(signal) || errorText.includes(signal),
      )
    ) {
      return; // drop transient retriable metadata noise
    }

    const line = JSON.stringify({
      level: label,
      logger: 'kafkajs',
      namespace,
      ...log,
    });

    if (level === logLevel.ERROR) {
      console.error(line);
    } else if (level === logLevel.WARN) {
      console.warn(line);
    } else if (level === logLevel.INFO) {
      console.info(line);
    } else {
      console.debug(line);
    }
  };
};

export function createKafkaClient(config: KafkaClientConfig): Kafka {
  return new Kafka({
    clientId: config.clientId,
    brokers: config.brokers,
    ssl: config.ssl,
    sasl: config.sasl,
    connectionTimeout: config.connectionTimeout ?? 3000,
    requestTimeout: config.requestTimeout ?? 30000,
    logLevel: logLevel.WARN,
    logCreator: erpLogCreator,
  });
}
