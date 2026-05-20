import { Navigate, Outlet, useLocation } from "react-router-dom";
import { authService } from "@erp/pos/services/auth.service";

export function PosRequireAuth() {
  const location = useLocation();
  if (!authService.isAuthenticated()) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/dang-nhap" replace state={{ from }} />;
  }
  return <Outlet />;
}
