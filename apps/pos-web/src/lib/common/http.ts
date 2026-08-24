import {
  POS_ACCESS_TOKEN_KEY,
  POS_REFRESH_TOKEN_KEY,
} from "@erp/pos/constants/common.constant";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { resolveApiBaseUrl } from "./api-base";
import { refreshOnce } from "./token-refresh";


function requestId(): string {
  return crypto.randomUUID();
}

function buildHeaders(init: RequestInit = {}): Headers {
  const headers = new Headers(init.headers);

  const token = localStorage.getItem(POS_ACCESS_TOKEN_KEY);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const posBranch = usePosBranchStore.getState().branchId;
  if (posBranch) {
    headers.set("X-Branch-Id", posBranch);
  }

  headers.set("Content-Type", "application/json");
  headers.set("X-Request-Id", requestId());

  if (
    init.method &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(init.method.toUpperCase())
  ) {
    headers.set("X-Idempotency-Key", requestId());
  }

  return headers;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${resolveApiBaseUrl()}${path}`;
  const headers = buildHeaders(init);

  let res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      const retryHeaders = buildHeaders(init);
      res = await fetch(url, { ...init, headers: retryHeaders });
    }
  }

  if (res.status === 401) {
    localStorage.removeItem(POS_ACCESS_TOKEN_KEY);
    localStorage.removeItem(POS_REFRESH_TOKEN_KEY);
    window.location.href = `${import.meta.env.BASE_URL}dang-nhap`;
    throw new Error("Phiên hết hạn. Đang chuyển hướng đăng nhập.");
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

async function requestBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const url = `${resolveApiBaseUrl()}${path}`;
  const headers = buildHeaders(init);

  let res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      const retryHeaders = buildHeaders(init);
      res = await fetch(url, { ...init, headers: retryHeaders });
    }
  }

  if (res.status === 401) {
    localStorage.removeItem(POS_ACCESS_TOKEN_KEY);
    localStorage.removeItem(POS_REFRESH_TOKEN_KEY);
    window.location.href = `${import.meta.env.BASE_URL}dang-nhap`;
    throw new Error("Phiên hết hạn. Đang chuyển hướng đăng nhập.");
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  return res.blob();
}

export const http = {
  get<T>(path: string): Promise<T> {
    return request<T>(path, { method: "GET" });
  },

  /**
   * `signal` lets a caller cancel a request that is no longer relevant — the
   * promotion preview fires on every cart change, so a slow reply for an old
   * cart must not land after a newer one and overwrite the amount on screen.
   */
  post<T>(
    path: string,
    body?: unknown,
    opts?: { signal?: AbortSignal },
  ): Promise<T> {
    return request<T>(path, {
      method: "POST",
      body: body != null ? JSON.stringify(body) : undefined,
      signal: opts?.signal,
    });
  },

  /** For binary responses (e.g. file exports) — same auth/refresh flow as `post`, returns a Blob. */
  postBlob(path: string, body?: unknown): Promise<Blob> {
    return requestBlob(path, {
      method: "POST",
      body: body != null ? JSON.stringify(body) : undefined,
    });
  },

  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: "PUT",
      body: body != null ? JSON.stringify(body) : undefined,
    });
  },

  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: "PATCH",
      body: body != null ? JSON.stringify(body) : undefined,
    });
  },

  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: "DELETE" });
  },
};
