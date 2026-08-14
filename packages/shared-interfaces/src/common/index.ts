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

/**
 * Column totals for a grid footer, over **every** row matching the current
 * filters — never just the page in view. A footer that sums the page changes
 * when the user pages, which is how it gets copied into a report and then
 * disagrees with the books.
 *
 * Keys are the row's own field names, so a grid maps `totals[column.key]`
 * straight into its footer cell. Conventions that keep this from fragmenting:
 *
 * 1. A grid with a single money column still returns `totals` — `{ totalAmount: n }`
 *    — rather than growing a scalar field beside it. One shape, always.
 * 2. Derived columns (closing stock, average unit price) are **not** included:
 *    the client derives them from the primitives, because an average of
 *    averages is wrong and a closing balance is opening + in − out by
 *    definition.
 * 3. Dynamically-keyed columns use a dot path — `perBranch.<branchId>` — so the
 *    shape stays flat and serialisable.
 *
 * Not to be confused with `ReportRow` in `invoice-report/search.ts`: the report
 * engine's totals row travels through the *same* renderer as its data rows, so
 * it must allow strings and nulls. A CRUD/search grid has no such constraint,
 * and the narrower type keeps its footer arithmetic type-checked.
 */
export type ReportTotals = Record<string, number>;

/** A page of rows plus the whole-set totals behind its footer. */
export interface PaginatedWithTotals<T> extends PaginatedResponse<T> {
  totals: ReportTotals;
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
