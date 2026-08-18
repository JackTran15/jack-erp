import { useMemo } from "react";
import { getUserPermissions } from "../lib/permissions";

export interface PermissionCheckResult {
  /** Every permission key the signed-in user holds. */
  permissions: string[];
  /** The queried keys the user holds. */
  allowed: string[];
  /** The queried keys the user is missing. */
  denied: string[];
  has: (key: string) => boolean;
  hasAny: (...keys: string[]) => boolean;
  hasAll: (...keys: string[]) => boolean;
}

/**
 * Permission-based gate for components: pass the keys a screen cares about and
 * get back which of them are granted and which are not.
 *
 * Authorization here is decided by permission key only — never by role. "Is
 * this account above me?" is likewise answered server-side by comparing
 * permission sets (see `RoleSummary.assignable`), because roles carry no stable
 * code, only an editable name.
 *
 * Not reactive: the source is the `user_permissions` entry written to
 * localStorage on login, on `GET /auth/session`, and on branch switch — and
 * branch switch reloads the page (`BranchSelector`). Values are therefore fixed
 * for the lifetime of the mount; do not expect this to update in place.
 */
export function usePermissionCheck(
  keys: readonly string[] = [],
): PermissionCheckResult {
  const permissions = useMemo(() => getUserPermissions(), []);

  return useMemo(() => {
    const granted = new Set(permissions);
    return {
      permissions,
      allowed: keys.filter((key) => granted.has(key)),
      denied: keys.filter((key) => !granted.has(key)),
      has: (key: string) => granted.has(key),
      hasAny: (...wanted: string[]) => wanted.some((key) => granted.has(key)),
      hasAll: (...wanted: string[]) => wanted.every((key) => granted.has(key)),
    };
    // `keys` is typically an inline literal; join it so a new array with the
    // same contents does not recompute on every render.
  }, [permissions, keys.join("|")]);
}
