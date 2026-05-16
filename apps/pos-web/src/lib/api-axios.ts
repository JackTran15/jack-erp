import axios, {
  type AxiosInstance,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";
import { resolveApiBaseUrl } from "./api-base";
import { usePosBranchStore } from "../stores/common/branch.store";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

export const apiClient: AxiosInstance = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
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

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return false;

  try {
    const res = await axios.post(
      `${resolveApiBaseUrl()}/auth/refresh`,
      { refreshToken },
      { headers: { "Content-Type": "application/json" } },
    );

    const data = res.data as {
      accessToken?: string;
      refreshToken?: string;
    };

    if (data.accessToken) {
      localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
    }
    if (data.refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
    }
    return !!data.accessToken;
  } catch {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = tryRefreshToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

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
      originalRequest._retry = true;
      const refreshed = await refreshOnce();
      if (refreshed) {
        const token = localStorage.getItem(ACCESS_TOKEN_KEY);
        if (token) {
          originalRequest.headers.set("Authorization", `Bearer ${token}`);
        }
        return apiClient(originalRequest);
      }

      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      window.location.href = `${import.meta.env.BASE_URL}dang-nhap`;
    }

    return Promise.reject(error);
  },
);
