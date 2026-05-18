import type {
  AddLineResult,
  AddTempWarehouseLineBody,
  CloseSessionResult,
  CloseTempWarehouseSessionBody,
  ListLinesNettedResult,
  ListLinesRawResult,
  PaginatedResponse,
  TempWarehouseCloseMode,
  TempWarehouseDirection,
  TempWarehouseLine,
  TempWarehousePublicUser,
  TempWarehouseSession,
  TransferLinesResult,
  TransferTempWarehouseLinesBody,
  UpdateLineResult,
  UpdateTempWarehouseLineBody,
  PaginationQuery,
} from "@erp/shared-interfaces";
import { http } from "@erp/pos/lib/common/http";
import {
  parseTempWarehouseApiError,
  TempWarehouseApiError,
} from "./temp-warehouse-errors";

const BASE = "/inventory/temp-warehouse";

function appendPaginationQuery(
  q: URLSearchParams,
  pagination: PaginationQuery,
): void {
  q.set("page", String(pagination.page));
  q.set("pageSize", String(pagination.pageSize));
  if (pagination.sortBy) q.set("sortBy", pagination.sortBy);
  if (pagination.sortOrder) q.set("sortOrder", pagination.sortOrder);
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof TempWarehouseApiError) throw err;
    if (err instanceof Error) {
      const match = /^HTTP (\d+): ([\s\S]*)$/.exec(err.message);
      if (match) {
        throw parseTempWarehouseApiError(match[2], Number(match[1]));
      }
    }
    throw err;
  }
}

export async function getActiveSession(
  branchId: string,
): Promise<TempWarehouseSession | null> {
  try {
    return await call(() =>
      http.get<TempWarehouseSession>(
        `${BASE}/sessions/active?branchId=${encodeURIComponent(branchId)}`,
      ),
    );
  } catch (err) {
    if (
      err instanceof TempWarehouseApiError &&
      err.statusCode === 404 &&
      err.code === "TEMP_WAREHOUSE_NO_ACTIVE_SESSION"
    ) {
      return null;
    }
    throw err;
  }
}

export async function getSession(
  sessionId: string,
): Promise<TempWarehouseSession> {
  return call(() =>
    http.get<TempWarehouseSession>(
      `${BASE}/sessions/${encodeURIComponent(sessionId)}`,
    ),
  );
}

export interface ListLinesParams {
  branchId?: string;
  sessionId?: string;
  direction?: TempWarehouseDirection;
  status?: "ACTIVE" | "DELETED" | "AUTO_BALANCED" | "ALL";
  pagination?: PaginationQuery;
}

export async function listLinesRaw(
  params: ListLinesParams,
): Promise<ListLinesRawResult> {
  const q = new URLSearchParams();
  if (params.branchId) q.set("branchId", params.branchId);
  if (params.sessionId) q.set("sessionId", params.sessionId);
  if (params.direction) q.set("direction", params.direction);
  if (params.status) q.set("status", params.status);
  if (params.pagination) appendPaginationQuery(q, params.pagination);
  return call(() =>
    http.get<
      PaginatedResponse<TempWarehouseLine> & { sessionId: string | null }
    >(`${BASE}/lines?${q.toString()}`),
  );
}

export interface ListNettedLinesParams {
  branchId?: string;
  sessionId?: string;
  hideBalanced?: boolean;
}

export async function listNettedLines(
  params: ListNettedLinesParams,
): Promise<ListLinesNettedResult> {
  const q = new URLSearchParams();
  q.set("hideOffsetting", "true");
  if (params.branchId) q.set("branchId", params.branchId);
  if (params.sessionId) q.set("sessionId", params.sessionId);
  if (params.hideBalanced) q.set("hideBalanced", "true");
  return call(() =>
    http.get<ListLinesNettedResult>(`${BASE}/lines?${q.toString()}`),
  );
}

export async function addLine(
  body: AddTempWarehouseLineBody,
): Promise<AddLineResult> {
  return call(() => http.post<AddLineResult>(`${BASE}/lines`, body));
}

export async function updateLine(
  lineId: string,
  body: UpdateTempWarehouseLineBody,
): Promise<UpdateLineResult> {
  return call(() =>
    http.patch<UpdateLineResult>(
      `${BASE}/lines/${encodeURIComponent(lineId)}`,
      body,
    ),
  );
}

export async function deleteLine(lineId: string): Promise<TempWarehouseLine> {
  return call(() =>
    http.delete<TempWarehouseLine>(
      `${BASE}/lines/${encodeURIComponent(lineId)}`,
    ),
  );
}

export async function closeSession(
  sessionId: string,
  mode: TempWarehouseCloseMode,
): Promise<CloseSessionResult> {
  const body: CloseTempWarehouseSessionBody = { mode };
  return call(() =>
    http.post<CloseSessionResult>(
      `${BASE}/sessions/${encodeURIComponent(sessionId)}/close`,
      body,
    ),
  );
}

export interface ListCarriersParams {
  branchId: string;
  search?: string;
  pagination?: PaginationQuery;
}

export async function listCarriers(
  params: ListCarriersParams,
): Promise<PaginatedResponse<TempWarehousePublicUser>> {
  const q = new URLSearchParams();
  q.set("branchId", params.branchId);
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.pagination) appendPaginationQuery(q, params.pagination);
  return call(() =>
    http.get<PaginatedResponse<TempWarehousePublicUser>>(
      `${BASE}/carriers?${q.toString()}`,
    ),
  );
}

export async function transferLines(
  sessionId: string,
  body: TransferTempWarehouseLinesBody,
): Promise<TransferLinesResult> {
  return call(() =>
    http.post<TransferLinesResult>(
      `${BASE}/sessions/${encodeURIComponent(sessionId)}/transfer-lines`,
      body,
    ),
  );
}
