import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isPosAuthenticated } from "../lib/posAuth";

export function RequirePosAuth() {
  const location = useLocation();
  if (!isPosAuthenticated()) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/dang-nhap" replace state={{ from }} />;
  }
  return <Outlet />;
}
