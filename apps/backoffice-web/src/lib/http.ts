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

function toHttpError(err: unknown): never {
  if (err instanceof AxiosError && err.response) {
    const body = err.response.data;
    const apiErr: ApiError =
      body && typeof body === "object" && "message" in body
        ? (body as ApiError)
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
