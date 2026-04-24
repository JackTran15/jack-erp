import { randomUUID } from 'node:crypto';
import type { DomainEvent } from '@erp/shared-interfaces';
import { type DomainEventType } from '@erp/shared-interfaces';

export interface EventContext {
  organizationId: string;
  branchId?: string;
  correlationId?: string;
}

export function createDomainEvent<T>(
  type: DomainEventType,
  payload: T,
  context: EventContext,
): DomainEvent<T> {
  return {
    eventId: randomUUID(),
    eventType: type,
    timestamp: new Date().toISOString(),
    organizationId: context.organizationId,
    branchId: context.branchId,
    correlationId: context.correlationId ?? randomUUID(),
    payload,
  };
}
