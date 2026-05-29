import { http } from "@erp/pos/lib/common/http";
import type { SalesmanAssignmentRow } from "@erp/pos/interfaces/sales-hierarchy.interface";

/**
 * Gọi module sales-hierarchy của API. `http` đã tự gắn `Authorization` +
 * `X-Branch-Id` (đọc từ `usePosBranchStore`); endpoint `@RequireBranchScope()`
 * yêu cầu header `X-Branch-Id` khớp `:id` trên path, nên truyền đúng branchId
 * đang active vào path.
 */
export const salesHierarchyService = {
  listSalesmen: (branchId: string): Promise<SalesmanAssignmentRow[]> =>
    http.get<SalesmanAssignmentRow[]>(`/branches/${branchId}/salesmen`),
};
