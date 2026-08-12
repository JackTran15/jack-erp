const PERMISSIONS_KEY = "user_permissions";

export function getUserPermissions(): string[] {
  try {
    const raw = localStorage.getItem(PERMISSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function hasPermission(permission: string): boolean {
  return getUserPermissions().includes(permission);
}

export function hasAnyPermission(...permissions: string[]): boolean {
  const userPerms = getUserPermissions();
  return permissions.some((p) => userPerms.includes(p));
}

/** Any-of check for a nav/route gate declared as a single key or a list of keys. */
export function satisfiesPermission(permission: string | string[]): boolean {
  return Array.isArray(permission)
    ? hasAnyPermission(...permission)
    : hasPermission(permission);
}

/**
 * The "Chuỗi cửa hàng" view aggregates every branch, so it belongs to whoever may
 * read consolidated reports — Quản trị hệ thống and Quản lý tổng. Branch staff and
 * branch managers only ever see their own branch.
 */
export function canViewChain(): boolean {
  return hasPermission("reporting.dashboard.consolidated.read");
}
