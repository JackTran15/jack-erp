import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

/**
 * Declares the permission(s) a handler needs.
 *
 * Passing several keys means OR — the caller needs *any one* of them. That is
 * what lets one endpoint serve two audiences with different key namespaces,
 * e.g. `/v2/promotions/evaluate` accepting the back-office `promotion.read`
 * as well as the narrower cashier key `pos.promotion.evaluate`, without
 * granting cashiers the whole back-office permission.
 *
 * A single string is normalised to a one-element list by `PermissionGuard`,
 * so the several hundred existing single-key call sites are unaffected.
 */
export const RequirePermission = (permissionKey: string | string[]) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permissionKey);
