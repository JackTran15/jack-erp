import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DomainEvent } from '@erp/shared-interfaces';
import { OutboxMessageEntity } from './outbox-message.entity';

/**
 * Transactional outbox writer. `enqueue` MUST be called with the caller's
 * `EntityManager` so the outbox row commits atomically with the business write —
 * it never opens its own transaction.
 */
@Injectable()
export class OutboxService {
  async enqueue(
    manager: EntityManager,
    topic: string,
    event: DomainEvent<unknown>,
    partitionKey?: string,
  ): Promise<OutboxMessageEntity> {
    const row = manager.create(OutboxMessageEntity, {
      organizationId: event.organizationId ?? undefined,
      branchId: event.branchId ?? undefined,
      topic,
      eventId: event.eventId,
      partitionKey,
      payload: event as unknown as Record<string, unknown>,
      attempts: 0,
    });
    return manager.save(row);
  }
}
