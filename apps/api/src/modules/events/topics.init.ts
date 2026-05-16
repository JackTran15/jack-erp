import { Injectable, Logger } from '@nestjs/common';
import { ERP_TOPICS, buildDlqTopicName } from '@erp/shared-kafka-client';
import { EventPublisher } from './event-publisher.service';

interface TopicSpec {
  topic: string;
  numPartitions: number;
  replicationFactor: number;
}

const TOPIC_SPECS: TopicSpec[] = [
  { topic: ERP_TOPICS.SALE_POSTED, numPartitions: 3, replicationFactor: 1 },
  { topic: ERP_TOPICS.INVOICE_CANCELLED, numPartitions: 3, replicationFactor: 1 },
  { topic: ERP_TOPICS.STOCK_MOVEMENT_POSTED, numPartitions: 3, replicationFactor: 1 },
  { topic: ERP_TOPICS.STOCK_DEDUCTION, numPartitions: 6, replicationFactor: 1 },
  { topic: ERP_TOPICS.JOURNAL_POSTED, numPartitions: 3, replicationFactor: 1 },
  { topic: ERP_TOPICS.JOURNAL_REVERSED, numPartitions: 3, replicationFactor: 1 },
  { topic: ERP_TOPICS.JOURNAL_POST_SALE, numPartitions: 3, replicationFactor: 1 },
  { topic: ERP_TOPICS.LOYALTY_POINTS_AWARD, numPartitions: 3, replicationFactor: 1 },
  { topic: ERP_TOPICS.CASH_MOVEMENT_FROM_PAYMENT, numPartitions: 3, replicationFactor: 1 },
  { topic: ERP_TOPICS.CUSTOMER_MERGED, numPartitions: 1, replicationFactor: 1 },
  { topic: ERP_TOPICS.TEMP_WAREHOUSE_TRANSFER_REQUESTED, numPartitions: 3, replicationFactor: 1 },
];

@Injectable()
export class TopicInitializer {
  private readonly logger = new Logger(TopicInitializer.name);
  private ensurePromise?: Promise<void>;

  constructor(private readonly publisher: EventPublisher) {}

  /**
   * Idempotently create all topics + their DLQ counterparts.
   * Memoized so concurrent callers (TopicInitializer's own init + EventConsumerManager) share one admin call.
   */
  ensureTopics(): Promise<void> {
    if (!this.ensurePromise) {
      this.ensurePromise = this.doEnsureTopics().catch((err) => {
        this.ensurePromise = undefined;
        throw err;
      });
    }
    return this.ensurePromise;
  }

  private async doEnsureTopics(): Promise<void> {
    const admin = this.publisher.getKafkaInstance().admin();

    try {
      await admin.connect();

      const existingTopics = await admin.listTopics();

      const allSpecs = TOPIC_SPECS.flatMap((spec) => [
        spec,
        {
          topic: buildDlqTopicName(spec.topic),
          numPartitions: 1,
          replicationFactor: spec.replicationFactor,
        },
      ]);

      const toCreate = allSpecs.filter((s) => !existingTopics.includes(s.topic));

      if (toCreate.length === 0) {
        this.logger.log('All topics already exist');
        return;
      }

      await admin.createTopics({
        topics: toCreate.map(({ topic, numPartitions, replicationFactor }) => ({
          topic,
          numPartitions,
          replicationFactor,
        })),
        waitForLeaders: true,
      });

      this.logger.log(
        `Created topics: ${toCreate.map((t) => t.topic).join(', ')}`,
      );
    } catch (error) {
      this.logger.error('Failed to initialize topics', error);
      throw error;
    } finally {
      await admin.disconnect();
    }
  }
}
