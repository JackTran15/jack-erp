import { createErpApiClient, formatClientError } from "@erp/api-client";
import { apiClient } from "./api-axios";

export const erpApi = createErpApiClient(apiClient);

function throwOnErpError(r: { error: unknown }): void {
  if (!r.error) return;
  throw new Error(formatClientError(r.error));
}

/** Throws on API error. Use for DELETE/POST where the body may be empty. */
export function requireErpSuccess(r: { data?: unknown; error: unknown }): void {
  throwOnErpError(r);
}

/** Throws when the API returns an error body; otherwise returns data. */
export function requireErpData<T>(r: { data: T | undefined; error: unknown }): T {
  throwOnErpError(r);
  if (r.data === undefined) {
    throw new Error("Không nhận được dữ liệu từ máy chủ");
  }
  return r.data;
}
