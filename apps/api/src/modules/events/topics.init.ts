import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ERP_TOPICS, buildDlqTopicName } from '@erp/shared-kafka-client';
import { EventPublisher } from './event-publisher.service';

interface TopicSpec {
  topic: string;
  numPartitions: number;
  replicationFactor: number;
}

const TOPIC_SPECS: TopicSpec[] = [
  { topic: ERP_TOPICS.SALE_POSTED, numPartitions: 3, replicationFactor: 1 },
  { topic: ERP_TOPICS.STOCK_MOVEMENT_POSTED, numPartitions: 3, replicationFactor: 1 },
  { topic: ERP_TOPICS.JOURNAL_POSTED, numPartitions: 3, replicationFactor: 1 },
  { topic: ERP_TOPICS.CUSTOMER_MERGED, numPartitions: 1, replicationFactor: 1 },
];

@Injectable()
export class TopicInitializer implements OnModuleInit {
  private readonly logger = new Logger(TopicInitializer.name);

  constructor(private readonly publisher: EventPublisher) {}

  async onModuleInit(): Promise<void> {
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
