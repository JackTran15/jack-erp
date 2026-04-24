const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function requestId(): string {
  return crypto.randomUUID();
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  const token = localStorage.getItem("access_token");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  headers.set("Content-Type", "application/json");
  headers.set("X-Request-Id", requestId());

  if (
    init.method &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(init.method.toUpperCase())
  ) {
    headers.set("X-Idempotency-Key", requestId());
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export const http = {
  get<T>(path: string): Promise<T> {
    return request<T>(path, { method: "GET" });
  },

  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
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
