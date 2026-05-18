import type { TempWarehouseDirection } from "@erp/shared-interfaces";

export const tempWarehouseQueryKeys = {
  all: ["temp-wh"] as const,
  active: (branchId: string) => ["temp-wh", "active", branchId] as const,
  lines: (branchId: string, direction: TempWarehouseDirection) =>
    ["temp-wh", "lines", branchId, direction] as const,
  linesNetted: (sessionId: string) =>
    ["temp-wh", "lines-netted", sessionId] as const,
  session: (sessionId: string) => ["temp-wh", "session", sessionId] as const,
  carriers: (
    branchId: string,
    search: string,
    page: number,
    pageSize: number,
  ) => ["temp-wh", "carriers", branchId, search, page, pageSize] as const,
};
