export interface PaginationQuery {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface IdempotencyHeaders {
  xRequestId: string;
  xIdempotencyKey: string;
}

export enum IdempotencyStatus {
  CREATED = 'CREATED',
  REPLAYED = 'REPLAYED',
  CONFLICT = 'CONFLICT',
}

export interface AuditContext {
  actorId: string;
  organizationId: string;
  branchId?: string;
  requestId: string;
  timestamp: string;
}
