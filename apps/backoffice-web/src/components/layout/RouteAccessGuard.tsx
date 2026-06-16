import { useEffect, useMemo, useRef } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  useBranchStore,
  useCurrentView,
} from "../../store/common/branch/branch.store";
import { resolveRouteAccess } from "./routeAccess";

/**
 * Enforces route access for the current view. A page gated to another view is
 * resolved differently depending on what triggered the mismatch:
 * - the user navigated/deep-linked into it → follow the page (switch the view);
 * - the user manually switched the view → respect the choice and go to the
 *   dashboard (never snap the view back).
 * A page allowed in no view always redirects to the dashboard.
 */
export function RouteAccessGuard() {
  const { pathname } = useLocation();
  const view = useCurrentView();
  const setView = useBranchStore((s) => s.setView);
  const navigate = useNavigate();

  const decision = useMemo(
    () => resolveRouteAccess(pathname, view),
    [pathname, view],
  );

  const prevPath = useRef(pathname);
  const prevView = useRef(view);

  useEffect(() => {
    const pathnameChanged = pathname !== prevPath.current;
    const viewChanged = view !== prevView.current;
    prevPath.current = pathname;
    prevView.current = view;

    if (decision.type !== "switchView") return;

    if (viewChanged && !pathnameChanged) {
      // Manual view switch onto a page the new view can't show → leave the view
      // as chosen and send the user to the dashboard.
      navigate("/", { replace: true });
      return;
    }
    // Navigation/deep-link into a page gated to another view → follow the page.
    setView(decision.view);
  }, [pathname, view, decision, setView, navigate]);

  if (decision.type === "deny") return <Navigate to="/" replace />;
  // Hold rendering for one frame while the effect switches view or redirects,
  // so the page never flashes content for a view it isn't allowed in.
  if (decision.type === "switchView") return null;
  return <Outlet />;
}
