export enum DomainEventType {
  SALE_POSTED = 'SALE_POSTED',
  STOCK_MOVEMENT_POSTED = 'STOCK_MOVEMENT_POSTED',
  JOURNAL_POSTED = 'JOURNAL_POSTED',
  JOURNAL_REVERSED = 'JOURNAL_REVERSED',
  CUSTOMER_MERGED = 'CUSTOMER_MERGED',
  SALESMAN_ASSIGNED = 'SALESMAN_ASSIGNED',
  SALESMAN_UNASSIGNED = 'SALESMAN_UNASSIGNED',
  SALES_MANAGER_ASSIGNED = 'SALES_MANAGER_ASSIGNED',
  SALES_MANAGER_UNASSIGNED = 'SALES_MANAGER_UNASSIGNED',
}

export interface DomainEvent<T = unknown> {
  eventId: string;
  eventType: DomainEventType;
  timestamp: string;
  organizationId: string;
  branchId?: string;
  correlationId: string;
  payload: T;
}
