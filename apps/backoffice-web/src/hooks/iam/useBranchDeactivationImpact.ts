import { erpApi, requireErpData } from "../../lib/erp-api";

export interface BranchDeactivationBlocker {
  code: string;
  message: string;
}

export interface BranchDeactivationWarning {
  code: string;
  label: string;
  count: number;
}

export interface BranchDeactivationImpact {
  branchId: string;
  branchName: string;
  isMainBranch: boolean;
  blockers: BranchDeactivationBlocker[];
  warnings: BranchDeactivationWarning[];
}

/**
 * Fetched on demand when the user ticks "Ngừng hoạt động", not with the form:
 * it counts across five tables and most saves never open the dialog.
 */
export async function fetchBranchDeactivationImpact(
  branchId: string,
): Promise<BranchDeactivationImpact> {
  return requireErpData(
    await erpApi.GET<BranchDeactivationImpact>(
      `/branches/${branchId}/deactivation-impact`,
    ),
  );
}
