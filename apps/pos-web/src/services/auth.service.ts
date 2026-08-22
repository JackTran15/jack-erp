import {
  POS_ACCESS_TOKEN_KEY,
  POS_REFRESH_TOKEN_KEY,
  POS_ORGANIZATION_ID_KEY,
} from "@erp/pos/constants/common.constant";
import type {
  ExchangeHandoffResponse,
  LoginResponse,
  SwitchBranchResponse,
} from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "@erp/pos/lib/common/erp-api";
import { parseAccessTokenPayload } from "@erp/pos/lib/common/parseJwt";
import type { PosLoginInput } from "@erp/pos/dtos/auth.dto";


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

    localStorage.setItem(POS_ACCESS_TOKEN_KEY, login.accessToken);
    localStorage.setItem(POS_REFRESH_TOKEN_KEY, login.refreshToken);
    localStorage.setItem(POS_ORGANIZATION_ID_KEY, input.organizationId);
  },

  /**
   * Đổi mã bàn giao (`?handoff=`) từ ERP lấy phiên POS riêng — không cần đăng
   * nhập lại. Mã dùng một lần, hết hạn sau 60s; phiên tạo ra độc lập với phiên
   * ERP nên đổi chi nhánh hay đăng xuất bên này không đá bên kia ra.
   */
  exchangeHandoff: async (code: string): Promise<void> => {
    const res = requireErpData(
      await erpApi.POST<ExchangeHandoffResponse>("/auth/handoff/exchange", {
        body: { code },
      }),
    );

    if (!res.accessToken || !res.refreshToken) {
      throw new Error("Phản hồi bàn giao phiên không hợp lệ.");
    }

    localStorage.setItem(POS_ACCESS_TOKEN_KEY, res.accessToken);
    localStorage.setItem(POS_REFRESH_TOKEN_KEY, res.refreshToken);
    localStorage.setItem(POS_ORGANIZATION_ID_KEY, res.session.organizationId);
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

    localStorage.setItem(POS_ACCESS_TOKEN_KEY, res.accessToken);
    localStorage.setItem(POS_REFRESH_TOKEN_KEY, res.refreshToken);
  },

  getStoredOrganizationId: (): string | null =>
    localStorage.getItem(POS_ORGANIZATION_ID_KEY),

  clearSession: (): void => {
    localStorage.removeItem(POS_ACCESS_TOKEN_KEY);
    localStorage.removeItem(POS_REFRESH_TOKEN_KEY);
    localStorage.removeItem(POS_ORGANIZATION_ID_KEY);
  },

  isAuthenticated: (): boolean => {
    const token = localStorage.getItem(POS_ACCESS_TOKEN_KEY);
    if (!token || !token.trim()) return false;

    const payload = parseAccessTokenPayload(token);
    if (!payload) return false;
    if (payload.exp == null) return true;

    const nowSec = Math.floor(Date.now() / 1000);
    return payload.exp > nowSec;
  },
};
