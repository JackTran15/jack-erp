import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventPublisher } from './event-publisher.service';
import { EventConsumerManager } from './event-consumer.service';
import { TopicInitializer } from './topics.init';
import { DeadLetterEventEntity } from './entities/dead-letter-event.entity';
import { ProcessedEventEntity } from './entities/processed-event.entity';
import { DeadLetterService } from './services/dead-letter.service';
import { EventIdempotencyService } from './services/event-idempotency.service';
import { DeadLetterController } from './controllers/dead-letter.controller';

@Global()
@Module({
  imports: [
    DiscoveryModule,
    TypeOrmModule.forFeature([DeadLetterEventEntity, ProcessedEventEntity]),
  ],
  controllers: [DeadLetterController],
  providers: [
    EventPublisher,
    EventConsumerManager,
    TopicInitializer,
    DeadLetterService,
    EventIdempotencyService,
  ],
  exports: [
    EventPublisher,
    EventConsumerManager,
    DeadLetterService,
    EventIdempotencyService,
  ],
})
export class EventsModule {}
