import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainEvent } from '@erp/shared-interfaces';
import { ProcessedEventEntity } from '../entities/processed-event.entity';

@Injectable()
export class EventIdempotencyService {
  private readonly logger = new Logger(EventIdempotencyService.name);

  constructor(
    @InjectRepository(ProcessedEventEntity)
    private readonly repo: Repository<ProcessedEventEntity>,
  ) {}

  /**
   * Claim an event for processing by inserting into processed_events.
   * Returns true if the claim was newly created (consumer should run the handler).
   * Returns false if a row already exists (consumer should skip).
   */
  async tryClaim(consumerName: string, event: DomainEvent<unknown>, topic: string): Promise<boolean> {
    const result = await this.repo
      .createQueryBuilder()
      .insert()
      .into(ProcessedEventEntity)
      .values({
        consumerName,
        eventId: event.eventId,
        topic,
        organizationId: event.organizationId,
      })
      .orIgnore()
      .execute();

    return (result.identifiers?.length ?? 0) > 0;
  }

  /**
   * Release a previously claimed event so a future retry can re-process it.
   * Called when a handler throws — without this, retries would be silently skipped.
   */
  async release(consumerName: string, eventId: string): Promise<void> {
    await this.repo.delete({ consumerName, eventId });
  }
}
