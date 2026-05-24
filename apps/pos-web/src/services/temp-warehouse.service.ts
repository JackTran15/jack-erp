import type {
  AddLineResult,
  AddTempWarehouseLineBody,
  CloseSessionResult,
  CloseTempWarehouseSessionBody,
  ListLinesNettedResult,
  ListLinesRawResult,
  PaginatedResponse,
  TempWarehouseCloseMode,
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
} from "@erp/pos/lib/page-libs/fast-stock-transfer/temp-warehouse-errors";
import type {
  ListCarriersParams,
  ListLinesParams,
  ListNettedLinesParams,
} from "@erp/pos/dtos/temp-warehouse.dto";

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

export const tempWarehouseService = {
  getActiveSession: async (
    branchId: string,
  ): Promise<TempWarehouseSession | null> => {
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
  },

  getSession: (sessionId: string): Promise<TempWarehouseSession> =>
    call(() =>
      http.get<TempWarehouseSession>(
        `${BASE}/sessions/${encodeURIComponent(sessionId)}`,
      ),
    ),

  listLinesRaw: (params: ListLinesParams): Promise<ListLinesRawResult> => {
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
  },

  listNettedLines: (
    params: ListNettedLinesParams,
  ): Promise<ListLinesNettedResult> => {
    const q = new URLSearchParams();
    q.set("hideOffsetting", "true");
    if (params.branchId) q.set("branchId", params.branchId);
    if (params.sessionId) q.set("sessionId", params.sessionId);
    if (params.hideBalanced) q.set("hideBalanced", "true");
    return call(() =>
      http.get<ListLinesNettedResult>(`${BASE}/lines?${q.toString()}`),
    );
  },

  addLine: (body: AddTempWarehouseLineBody): Promise<AddLineResult> =>
    call(() => http.post<AddLineResult>(`${BASE}/lines`, body)),

  updateLine: (
    lineId: string,
    body: UpdateTempWarehouseLineBody,
  ): Promise<UpdateLineResult> =>
    call(() =>
      http.patch<UpdateLineResult>(
        `${BASE}/lines/${encodeURIComponent(lineId)}`,
        body,
      ),
    ),

  deleteLine: (lineId: string): Promise<TempWarehouseLine> =>
    call(() =>
      http.delete<TempWarehouseLine>(
        `${BASE}/lines/${encodeURIComponent(lineId)}`,
      ),
    ),

  closeSession: (
    sessionId: string,
    mode: TempWarehouseCloseMode,
  ): Promise<CloseSessionResult> => {
    const body: CloseTempWarehouseSessionBody = { mode };
    return call(() =>
      http.post<CloseSessionResult>(
        `${BASE}/sessions/${encodeURIComponent(sessionId)}/close`,
        body,
      ),
    );
  },

  listCarriers: (
    params: ListCarriersParams,
  ): Promise<PaginatedResponse<TempWarehousePublicUser>> => {
    const q = new URLSearchParams();
    q.set("branchId", params.branchId);
    if (params.search?.trim()) q.set("search", params.search.trim());
    if (params.pagination) appendPaginationQuery(q, params.pagination);
    return call(() =>
      http.get<PaginatedResponse<TempWarehousePublicUser>>(
        `${BASE}/carriers?${q.toString()}`,
      ),
    );
  },

  transferLines: (
    sessionId: string,
    body: TransferTempWarehouseLinesBody,
  ): Promise<TransferLinesResult> =>
    call(() =>
      http.post<TransferLinesResult>(
        `${BASE}/sessions/${encodeURIComponent(sessionId)}/transfer-lines`,
        body,
      ),
    ),
};
