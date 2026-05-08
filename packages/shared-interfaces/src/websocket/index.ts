export enum WsChannel {
  INVENTORY = 'inventory',
  POS = 'pos',
  REPORTS = 'reports',
  RECONCILIATION = 'reconciliation',
}

export enum WsEventType {
  INVENTORY_IMPORT_STATUS_CHANGED = 'INVENTORY_IMPORT_STATUS_CHANGED',
  POS_CHECKOUT_ACKNOWLEDGED = 'POS_CHECKOUT_ACKNOWLEDGED',
  POS_INVOICE_CANCELLED = 'POS_INVOICE_CANCELLED',
  REPORT_JOB_COMPLETED = 'REPORT_JOB_COMPLETED',
  RECONCILIATION_COMPLETED = 'RECONCILIATION_COMPLETED',
}

export interface WsEvent<T = unknown> {
  eventId: string;
  eventType: WsEventType;
  timestamp: string;
  organizationId: string;
  branchId?: string;
  correlationId: string;
  payload: T;
}
