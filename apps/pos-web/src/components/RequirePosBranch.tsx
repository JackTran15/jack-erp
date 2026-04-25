import { Navigate, Outlet } from "react-router-dom";
import { usePosBranchStore } from "../stores/usePosBranchStore";

export function RequirePosBranch() {
  const branchId = usePosBranchStore((s) => s.branchId);
  if (!branchId) {
    return <Navigate to="/chon-chi-nhanh" replace />;
  }
  return <Outlet />;
}
