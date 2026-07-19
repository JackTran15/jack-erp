import type {
  LoginResponse,
  RefreshResponse,
  SwitchBranchResponse,
} from "@erp/shared-interfaces";
import { getAccessToken, setAccessToken, clearAccessToken } from "./access-token";

const REFRESH = "refresh_token";
const ORG = "organization_id";
const USER_ID = "user_id";
const BRANCH = "active_branch_id";
const PERMISSIONS = "user_permissions";

function persistPermissions(permissions: string[]): void {
  localStorage.setItem(PERMISSIONS, JSON.stringify(permissions));
}

export function persistSession(login: LoginResponse): void {
  setAccessToken(login.accessToken);
  localStorage.setItem(REFRESH, login.refreshToken);
  localStorage.setItem(ORG, login.session.organizationId);
  localStorage.setItem(USER_ID, login.session.userId);
  persistPermissions(login.session.permissions ?? []);
  const firstBranch = login.session.branchIds[0];
  if (firstBranch) {
    localStorage.setItem(BRANCH, firstBranch);
  } else {
    localStorage.removeItem(BRANCH);
  }
  localStorage.removeItem("access_token");
}

export function persistSessionInfo(session: LoginResponse["session"]): void {
  localStorage.setItem(USER_ID, session.userId);
  persistPermissions(session.permissions ?? []);
}

export function persistRefreshResponse(res: RefreshResponse): void {
  setAccessToken(res.accessToken);
  localStorage.setItem(REFRESH, res.refreshToken);
  localStorage.removeItem("access_token");
}

export function persistSwitchBranchResponse(
  res: SwitchBranchResponse,
  branchId: string,
): void {
  setAccessToken(res.accessToken);
  localStorage.setItem(REFRESH, res.refreshToken);
  localStorage.setItem(BRANCH, branchId);
  localStorage.setItem(USER_ID, res.session.userId);
  persistPermissions(res.session.permissions ?? []);
  localStorage.removeItem("access_token");
}

export function clearSession(): void {
  clearAccessToken();
  localStorage.removeItem(REFRESH);
  localStorage.removeItem(ORG);
  localStorage.removeItem(USER_ID);
  localStorage.removeItem(BRANCH);
  localStorage.removeItem(PERMISSIONS);
  localStorage.removeItem("access_token");
}

export function getActiveBranch(): string | null {
  return localStorage.getItem(BRANCH);
}

export function setActiveBranch(id: string): void {
  localStorage.setItem(BRANCH, id);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH);
}

export function hasRefreshToken(): boolean {
  return Boolean(localStorage.getItem(REFRESH)?.trim());
}

export function getStoredOrganizationId(): string | null {
  return localStorage.getItem(ORG);
}

/**
 * Best-effort decode of `userId` from the current access token's JWT payload
 * (no signature check — read-only for UI prefill). Fallback for a session
 * that logged in before USER_ID started being persisted; never used for
 * anything security-sensitive (the server independently derives the actor
 * from the same token on every request).
 */
function decodeUserIdFromAccessToken(): string | null {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const decoded = JSON.parse(json) as { userId?: string };
    return decoded.userId ?? null;
  } catch {
    return null;
  }
}

export function getStoredUserId(): string | null {
  return localStorage.getItem(USER_ID) ?? decodeUserIdFromAccessToken();
}
