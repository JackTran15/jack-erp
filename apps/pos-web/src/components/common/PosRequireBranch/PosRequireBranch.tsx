import { Navigate, Outlet } from "react-router-dom";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";

export function PosRequireBranch() {
  const branchId = usePosBranchStore((s) => s.branchId);
  if (!branchId) {
    return <Navigate to="/chon-chi-nhanh" replace />;
  }
  return <Outlet />;
}
