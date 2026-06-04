import type { LoginResponse, RefreshResponse } from "@erp/shared-interfaces";
import { setAccessToken, clearAccessToken } from "./access-token";

const REFRESH = "refresh_token";
const ORG = "organization_id";
const BRANCH = "active_branch_id";
const PERMISSIONS = "user_permissions";

function persistPermissions(permissions: string[]): void {
  localStorage.setItem(PERMISSIONS, JSON.stringify(permissions));
}

export function persistSession(login: LoginResponse): void {
  setAccessToken(login.accessToken);
  localStorage.setItem(REFRESH, login.refreshToken);
  localStorage.setItem(ORG, login.session.organizationId);
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
  persistPermissions(session.permissions ?? []);
}

export function persistRefreshResponse(res: RefreshResponse): void {
  setAccessToken(res.accessToken);
  localStorage.setItem(REFRESH, res.refreshToken);
  localStorage.removeItem("access_token");
}

export function clearSession(): void {
  clearAccessToken();
  localStorage.removeItem(REFRESH);
  localStorage.removeItem(ORG);
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
