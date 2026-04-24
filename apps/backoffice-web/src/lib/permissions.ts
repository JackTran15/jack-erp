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
