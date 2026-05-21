import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventPublisher } from './event-publisher.service';
import { EventConsumerManager } from './event-consumer.service';
import { TopicInitializer } from './topics.init';
import { DeadLetterEventEntity } from './entities/dead-letter-event.entity';
import { ProcessedEventEntity } from './entities/processed-event.entity';
import { OutboxMessageEntity } from './outbox/outbox-message.entity';
import { DeadLetterService } from './services/dead-letter.service';
import { EventIdempotencyService } from './services/event-idempotency.service';
import { DeadLetterController } from './controllers/dead-letter.controller';
import { OutboxService } from './outbox/outbox.service';
import { OutboxRelayService } from './outbox/outbox-relay.service';

@Global()
@Module({
  imports: [
    DiscoveryModule,
    TypeOrmModule.forFeature([
      DeadLetterEventEntity,
      ProcessedEventEntity,
      OutboxMessageEntity,
    ]),
  ],
  controllers: [DeadLetterController],
  providers: [
    EventPublisher,
    EventConsumerManager,
    TopicInitializer,
    DeadLetterService,
    EventIdempotencyService,
    OutboxService,
    OutboxRelayService,
  ],
  exports: [
    EventPublisher,
    EventConsumerManager,
    DeadLetterService,
    EventIdempotencyService,
    OutboxService,
    OutboxRelayService,
  ],
})
export class EventsModule {}
