import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import type { RefreshResponse } from "@erp/shared-interfaces";
import { resolveApiBaseUrl } from "./api-base";
import { getAccessToken, setAccessToken, clearAccessToken } from "./access-token";
import { getRefreshToken, persistRefreshResponse, clearSession } from "./auth-storage";

let failedQueue: {
  resolve: (token: string | null) => void;
  reject: (err: unknown) => void;
}[] = [];
let isRefreshing = false;

function processQueue(error: unknown, token: string | null): void {
  for (const { resolve, reject } of failedQueue) {
    if (error) reject(error);
    else resolve(token);
  }
  failedQueue = [];
}

function getBranchId(): string | null {
  return (
    localStorage.getItem("active_branch_id") ??
    localStorage.getItem("branch_id")
  );
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }

  const branch = getBranchId();
  if (branch) {
    config.headers.set("X-Branch-Id", branch);
  }

  if (!config.headers.has("X-Request-Id")) {
    config.headers.set("X-Request-Id", crypto.randomUUID());
  }

  const method = (config.method ?? "get").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && !config.headers.has("X-Idempotency-Key")) {
    config.headers.set("X-Idempotency-Key", crypto.randomUUID());
  }

  // Let the runtime set multipart boundary; default application/json breaks FormData uploads.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    config.headers.delete("Content-Type");
  }

  return config;
});

apiClient.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = error.config;
  if (!original || error.response?.status !== 401) {
    return Promise.reject(error);
  }

  if ((original as any).__isRetry) {
    clearSession();
    window.location.href = "/login";
    return Promise.reject(error);
  }

  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      failedQueue.push({
        resolve: (token) => {
          original.headers.set("Authorization", `Bearer ${token}`);
          (original as any).__isRetry = true;
          resolve(apiClient(original));
        },
        reject,
      });
    });
  }

  isRefreshing = true;
  const refreshToken = getRefreshToken();

  if (!refreshToken) {
    isRefreshing = false;
    clearSession();
    window.location.href = "/login";
    return Promise.reject(error);
  }

  try {
    const { data } = await axios.post<RefreshResponse>(
      `${resolveApiBaseUrl()}/auth/refresh`,
      { refreshToken },
    );
    persistRefreshResponse(data);
    processQueue(null, data.accessToken);

    original.headers.set("Authorization", `Bearer ${data.accessToken}`);
    (original as any).__isRetry = true;
    return apiClient(original);
  } catch (refreshError) {
    processQueue(refreshError, null);
    clearAccessToken();
    clearSession();
    window.location.href = "/login";
    return Promise.reject(refreshError);
  } finally {
    isRefreshing = false;
  }
});
