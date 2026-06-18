import { AxiosError } from "axios";
import { apiClient } from "./api-axios";

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

function httpStatusFromErrorBody(
  body: Record<string, unknown>,
  fallback: number,
): number {
  const status = body.status;
  if (typeof status === "number" && Number.isFinite(status)) return status;
  const statusCode = body.statusCode;
  if (typeof statusCode === "number" && Number.isFinite(statusCode)) {
    return statusCode;
  }
  const httpCode =
    typeof body.code === "string" ? body.code.match(/^HTTP_(\d+)$/) : null;
  if (httpCode) return Number(httpCode[1]);
  return fallback;
}

function toHttpError(err: unknown): never {
  if (err instanceof AxiosError && err.response) {
    const body = err.response.data;
    const apiErr: ApiError =
      body && typeof body === "object" && "message" in body
        ? {
            status: httpStatusFromErrorBody(
              body as Record<string, unknown>,
              err.response.status,
            ),
            code: String((body as Record<string, unknown>).code ?? "UNKNOWN"),
            message: String((body as Record<string, unknown>).message),
            details: (body as Record<string, unknown>).details,
          }
        : {
            status: err.response.status,
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
