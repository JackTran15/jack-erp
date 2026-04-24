import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { EventPublisher } from './event-publisher.service';
import { EventConsumerManager } from './event-consumer.service';
import { TopicInitializer } from './topics.init';

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [EventPublisher, EventConsumerManager, TopicInitializer],
  exports: [EventPublisher, EventConsumerManager],
})
export class EventsModule {}
