import type {
  LoginResponse,
  SwitchBranchResponse,
} from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "@erp/pos/lib/common/erp-api";
import { parseAccessTokenPayload } from "@erp/pos/lib/common/parseJwt";
import type { PosLoginInput } from "@erp/pos/dtos/auth.dto";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const ORGANIZATION_ID_KEY = "organization_id";

export const authService = {
  login: async (input: PosLoginInput): Promise<void> => {
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
  },

  switchBranch: async (branchId: string): Promise<void> => {
    const res = requireErpData(
      await erpApi.POST<SwitchBranchResponse>("/auth/switch-branch", {
        body: { branchId },
      }),
    );

    if (!res.accessToken || !res.refreshToken) {
      throw new Error("Phản hồi đổi chi nhánh không hợp lệ.");
    }

    localStorage.setItem(ACCESS_TOKEN_KEY, res.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
  },

  getStoredOrganizationId: (): string | null =>
    localStorage.getItem(ORGANIZATION_ID_KEY),

  clearSession: (): void => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },

  isAuthenticated: (): boolean => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token || !token.trim()) return false;

    const payload = parseAccessTokenPayload(token);
    if (!payload) return false;
    if (payload.exp == null) return true;

    const nowSec = Math.floor(Date.now() / 1000);
    return payload.exp > nowSec;
  },
};
