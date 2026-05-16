import type { ConfigService } from '@nestjs/config';
import type { SASLOptions } from 'kafkajs';

export interface ResolvedKafkaConfig {
  clientId: string;
  brokers: string[];
  ssl: boolean;
  sasl?: SASLOptions;
}

const SUPPORTED_SASL_MECHANISMS = new Set([
  'plain',
  'scram-sha-256',
  'scram-sha-512',
]);

function parseBool(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

/**
 * Resolve Kafka/Redpanda client options from environment.
 *
 * Auth is opt-in via `KAFKA_AUTH_ENABLE=true`. When enabled, the following
 * variables are required:
 *   - KAFKA_SASL_USERNAME
 *   - KAFKA_SASL_PASSWORD
 *
 * Optional:
 *   - KAFKA_SASL_MECHANISM   (default: scram-sha-256; one of plain|scram-sha-256|scram-sha-512)
 *   - KAFKA_SSL              (default: false; set true when the broker terminates TLS)
 */
export function resolveKafkaConfig(config: ConfigService): ResolvedKafkaConfig {
  const brokers = config
    .get<string>('KAFKA_BROKERS', 'localhost:9092')
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);

  const clientId = config.get<string>('KAFKA_CLIENT_ID', 'erp-api')!;
  const ssl = parseBool(config.get('KAFKA_SSL'), false);
  const authEnabled = parseBool(config.get('KAFKA_AUTH_ENABLE'), false);

  if (!authEnabled) {
    return { clientId, brokers, ssl };
  }

  const username = config.get<string>('KAFKA_SASL_USERNAME');
  const password = config.get<string>('KAFKA_SASL_PASSWORD');
  const mechanism = (
    config.get<string>('KAFKA_SASL_MECHANISM') ?? 'scram-sha-256'
  )
    .trim()
    .toLowerCase();

  if (!username || !password) {
    throw new Error(
      'KAFKA_AUTH_ENABLE=true but KAFKA_SASL_USERNAME / KAFKA_SASL_PASSWORD are not set',
    );
  }

  if (!SUPPORTED_SASL_MECHANISMS.has(mechanism)) {
    throw new Error(
      `Unsupported KAFKA_SASL_MECHANISM: "${mechanism}". Expected one of: ${[
        ...SUPPORTED_SASL_MECHANISMS,
      ].join(', ')}.`,
    );
  }

  const sasl = {
    mechanism: mechanism as 'plain' | 'scram-sha-256' | 'scram-sha-512',
    username,
    password,
  } satisfies SASLOptions;

  return { clientId, brokers, ssl, sasl };
}
