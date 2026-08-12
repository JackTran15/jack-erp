import { STORE_TYPE } from "../../constants/store.constant";
import { satisfiesPermission } from "../../lib/permissions";
import { findNavMatch, isVisibleInView } from "./navConfig";

/**
 * Outcome of evaluating whether the current view may render a route:
 * - `allow`      — render the route as-is.
 * - `switchView` — route is gated to another view; switch to it, then render.
 * - `deny`       — route is reachable in no view; send the user to the dashboard.
 */
export type RouteAccessDecision =
  | { type: "allow" }
  | { type: "switchView"; view: STORE_TYPE }
  | { type: "deny" };

/**
 * Single source of truth for route access, gating by permission first and then by
 * view. Both are evaluated against the matched nav entry; add further conditions
 * (role, feature flag) here and return `deny` on a terminal failure.
 */
export function resolveRouteAccess(
  pathname: string,
  view: STORE_TYPE,
): RouteAccessDecision {
  const match = findNavMatch(pathname);
  if (!match) return { type: "allow" }; // route not tied to a nav menu -> not gated

  // Deep-linking into a page the role can't open (the API would 403 anyway).
  const { permission } = match.child;
  if (permission && !satisfiesPermission(permission)) return { type: "deny" };

  const allowed = Object.values(STORE_TYPE).filter(
    (v) =>
      isVisibleInView(match.module.views, v) &&
      isVisibleInView(match.section.views, v) &&
      isVisibleInView(match.child.views, v),
  );

  if (allowed.length === 0) return { type: "deny" };
  if (allowed.includes(view)) return { type: "allow" };
  return { type: "switchView", view: allowed[0] };
}
