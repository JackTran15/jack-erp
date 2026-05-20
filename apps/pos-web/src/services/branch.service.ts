import { http } from "@erp/pos/lib/common/http";
import type { BranchRow } from "@erp/pos/interfaces/branch.interface";

export const branchService = {
  getById: (id: string): Promise<BranchRow> =>
    http.get<BranchRow>(`/branches/${id}`),
};
