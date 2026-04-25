import type { LoginResponse, RefreshResponse } from "@erp/shared-interfaces";
import { setAccessToken, clearAccessToken } from "./access-token";

const REFRESH = "refresh_token";
const ORG = "organization_id";
const BRANCH = "active_branch_id";

export function persistSession(login: LoginResponse): void {
  setAccessToken(login.accessToken);
  localStorage.setItem(REFRESH, login.refreshToken);
  localStorage.setItem(ORG, login.session.organizationId);
  const firstBranch = login.session.branchIds[0];
  if (firstBranch) {
    localStorage.setItem(BRANCH, firstBranch);
  } else {
    localStorage.removeItem(BRANCH);
  }
  localStorage.removeItem("access_token");
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
  localStorage.removeItem("access_token");
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
