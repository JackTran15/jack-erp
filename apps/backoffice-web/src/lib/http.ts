export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

export class HttpError extends Error {
  constructor(public readonly error: ApiError) {
    super(error.message);
    this.name = "HttpError";
  }
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function getAuthToken(): string | null {
  return localStorage.getItem("access_token");
}

function uuid(): string {
  return crypto.randomUUID();
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Request-Id": uuid(),
  };

  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (method !== "GET") {
    headers["X-Idempotency-Key"] = uuid();
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error: ApiError = await res.json().catch(() => ({
      status: res.status,
      code: "UNKNOWN",
      message: res.statusText,
    }));
    throw new HttpError(error);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const http = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
