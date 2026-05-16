import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Kafka, Producer } from 'kafkajs';
import type { DomainEvent } from '@erp/shared-interfaces';
import {
  createKafkaClient,
  createProducer,
  publishEvent,
  publishBatch as kafkaPublishBatch,
} from '@erp/shared-kafka-client';
import { resolveKafkaConfig } from './kafka-config';

@Injectable()
export class EventPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventPublisher.name);
  private kafka: Kafka;
  private producer: Producer;

  constructor(private readonly config: ConfigService) {
    const { clientId, brokers, ssl, sasl } = resolveKafkaConfig(this.config);

    this.kafka = createKafkaClient({ clientId, brokers, ssl, sasl });
    this.producer = createProducer(this.kafka, { idempotent: true });

    const saslDescription = !sasl
      ? 'disabled'
      : 'username' in sasl
        ? `${sasl.mechanism} as ${sasl.username}`
        : sasl.mechanism;

    this.logger.log(
      `Kafka client configured: brokers=${brokers.join(',')} ssl=${ssl} sasl=${saslDescription}`,
    );
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
    this.logger.log('Kafka producer connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
    this.logger.log('Kafka producer disconnected');
  }

  getKafkaInstance(): Kafka {
    return this.kafka;
  }

  getProducer(): Producer {
    return this.producer;
  }

  async publish<T>(topic: string, event: DomainEvent<T>, key?: string): Promise<void> {
    await publishEvent(this.producer, topic, event, key);
  }

  async publishBatch(
    messages: { topic: string; event: DomainEvent<any>; key?: string }[],
  ): Promise<void> {
    await kafkaPublishBatch(this.producer, messages);
  }
}
