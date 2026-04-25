import type { LoginResponse } from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "./erp-api";
import { parseAccessTokenPayload } from "./parseJwt";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const ORGANIZATION_ID_KEY = "organization_id";

export interface PosLoginInput {
  email: string;
  password: string;
  organizationId: string;
}

export async function loginPos(input: PosLoginInput): Promise<void> {
  const login = requireErpData(
    await erpApi.POST<LoginResponse>("/auth/login", {
      body: {
        email: input.email,
        password: input.password,
        organizationId: input.organizationId,
      },
    }),
  );

  if (!login.accessToken || !login.refreshToken) {
    throw new Error("Phản hồi đăng nhập không hợp lệ.");
  }

  localStorage.setItem(ACCESS_TOKEN_KEY, login.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, login.refreshToken);
  localStorage.setItem(ORGANIZATION_ID_KEY, input.organizationId);
}

export function getStoredOrganizationId(): string | null {
  return localStorage.getItem(ORGANIZATION_ID_KEY);
}

export function clearPosSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function isPosAuthenticated(): boolean {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token || !token.trim()) return false;

  const payload = parseAccessTokenPayload(token);
  if (!payload) return false;
  if (payload.exp == null) return true;

  const nowSec = Math.floor(Date.now() / 1000);
  return payload.exp > nowSec;
}
