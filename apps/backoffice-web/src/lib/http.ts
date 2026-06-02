import { AxiosError } from "axios";
import { apiClient } from "./api-axios";

export interface ApiError {
  status: number;
  statusCode?: number;
  code: string;
  message: string;
  timestamp?: string;
  path?: string;
  requestId?: string;
  details?: unknown;
}

export class HttpError extends Error {
  constructor(public readonly error: ApiError) {
    super(error.message);
    this.name = "HttpError";
  }
}

function statusFromApiBody(body: Record<string, unknown>, fallback: number): number {
  const fromStatusCode = body.statusCode;
  if (typeof fromStatusCode === "number" && Number.isFinite(fromStatusCode)) {
    return fromStatusCode;
  }
  const fromStatus = body.status;
  if (typeof fromStatus === "number" && Number.isFinite(fromStatus)) {
    return fromStatus;
  }
  const details = body.details;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const fromDetails = (details as Record<string, unknown>).statusCode;
    if (typeof fromDetails === "number" && Number.isFinite(fromDetails)) {
      return fromDetails;
    }
  }
  return fallback;
}

function stringFromBody(
  body: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = body[key];
  return typeof value === "string" ? value : undefined;
}

function toHttpError(err: unknown): never {
  if (err instanceof AxiosError && err.response) {
    const body = err.response.data;
    const apiErr: ApiError =
      body && typeof body === "object" && "message" in body
        ? {
            status: statusFromApiBody(
              body as Record<string, unknown>,
              err.response.status,
            ),
            statusCode: statusFromApiBody(
              body as Record<string, unknown>,
              err.response.status,
            ),
            code: stringFromBody(body as Record<string, unknown>, "code") ?? "UNKNOWN",
            message: String((body as Record<string, unknown>).message),
            timestamp: stringFromBody(body as Record<string, unknown>, "timestamp"),
            path: stringFromBody(body as Record<string, unknown>, "path"),
            requestId: stringFromBody(body as Record<string, unknown>, "requestId"),
            details: (body as Record<string, unknown>).details,
          }
        : {
            status: err.response.status,
            statusCode: err.response.status,
            code: "UNKNOWN",
            message: err.response.statusText || `HTTP ${err.response.status}`,
          };
    throw new HttpError(apiErr);
  }
  throw err;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    const res = await apiClient.request<T>({
      method,
      url: path,
      data: body,
    });
    return res.data;
  } catch (err) {
    toHttpError(err);
  }
}

export const http = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
