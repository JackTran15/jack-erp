import {
  POS_ACCESS_TOKEN_KEY,
  POS_REFRESH_TOKEN_KEY,
} from "@erp/pos/constants/common.constant";
import axios, {
  type AxiosInstance,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";
import { AuthErrorCode } from "@erp/shared-interfaces";
import { resolveApiBaseUrl } from "./api-base";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { refreshOnce } from "./token-refresh";


export const apiClient: AxiosInstance = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem(POS_ACCESS_TOKEN_KEY);
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }

  const posBranch = usePosBranchStore.getState().branchId;
  if (posBranch) {
    config.headers.set("X-Branch-Id", posBranch);
  }

  if (!config.headers.has("X-Request-Id")) {
    config.headers.set("X-Request-Id", crypto.randomUUID());
  }

  const method = (config.method ?? "get").toUpperCase();
  if (
    method !== "GET" &&
    method !== "HEAD" &&
    !config.headers.has("X-Idempotency-Key")
  ) {
    config.headers.set("X-Idempotency-Key", crypto.randomUUID());
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry
    ) {
      const authErrorCode = (error.response?.data as { code?: string } | undefined)
        ?.code as AuthErrorCode | undefined;
      if (authErrorCode === AuthErrorCode.TOKEN_EXPIRED) {
        // access token expired — refreshOnce() below runs exactly as today
      }
      // else: no code, or a code not special-cased yet — still falls through to the
      // same refreshOnce() call below (AC-05 regression guard, non-negotiable)

      originalRequest._retry = true;
      const refreshed = await refreshOnce();
      if (refreshed) {
        const token = localStorage.getItem(POS_ACCESS_TOKEN_KEY);
        if (token) {
          originalRequest.headers.set("Authorization", `Bearer ${token}`);
        }
        return apiClient(originalRequest);
      }

      localStorage.removeItem(POS_ACCESS_TOKEN_KEY);
      localStorage.removeItem(POS_REFRESH_TOKEN_KEY);
      window.location.href = `${import.meta.env.BASE_URL}dang-nhap`;
    }

    return Promise.reject(error);
  },
);
