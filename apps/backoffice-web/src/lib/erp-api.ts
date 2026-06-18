import { createErpApiClient, formatClientError } from "@erp/api-client";
import { apiClient } from "./api-axios";
import { HttpError, type ApiError } from "./http";

export const erpApi = createErpApiClient(apiClient);

function httpStatusFromErrorBody(e: Record<string, unknown>): number {
  const fromCode = e.statusCode;
  if (typeof fromCode === "number" && Number.isFinite(fromCode)) {
    return fromCode;
  }
  const fromStatus = e.status;
  if (typeof fromStatus === "number" && Number.isFinite(fromStatus)) {
    return fromStatus;
  }
  const httpCode = typeof e.code === "string" ? e.code.match(/^HTTP_(\d+)$/) : null;
  if (httpCode) {
    return Number(httpCode[1]);
  }
  const details = e.details;
  if (details && typeof details === "object") {
    const detailsStatus = (details as Record<string, unknown>).statusCode;
    if (typeof detailsStatus === "number" && Number.isFinite(detailsStatus)) {
      return detailsStatus;
    }
  }
  return 0;
}

function throwOnErpError(r: { error: unknown }): void {
  if (!r.error) return;
  const err = r.error;
  if (err && typeof err === "object" && "message" in (err as object)) {
    const e = err as Record<string, unknown>;
    throw new HttpError({
      status: httpStatusFromErrorBody(e),
      code: String(e.code ?? "UNKNOWN"),
      message: String(e.message ?? formatClientError(err)),
      details: e.details,
    } as ApiError);
  }
  throw new Error(formatClientError(err));
}

/** Throws on API error. Use for DELETE/POST where the body may be empty. */
export function requireErpSuccess(r: { data?: unknown; error: unknown }): void {
  throwOnErpError(r);
}

/** Throws {@link HttpError} when the API returns an error body; otherwise returns data. */
export function requireErpData<T>(r: { data: T | undefined; error: unknown }): T {
  throwOnErpError(r);
  if (r.data === undefined) {
    throw new Error("Không nhận được dữ liệu từ máy chủ");
  }
  return r.data;
}
