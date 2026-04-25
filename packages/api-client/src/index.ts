import type { AxiosInstance } from "axios";

export type ErpApiClient = ReturnType<typeof createErpApiClient>;

export function createErpApiClient(axiosInstance: AxiosInstance) {
  async function GET<T = unknown>(
    path: string,
    options?: { params?: { path?: Record<string, string>; query?: Record<string, unknown> } },
  ): Promise<{ data: T | undefined; error: unknown }> {
    const url = resolvePath(path, options?.params?.path);
    try {
      const res = await axiosInstance.get<T>(url, {
        params: options?.params?.query,
      });
      return { data: res.data, error: undefined };
    } catch (err) {
      return { data: undefined, error: extractErrorBody(err) };
    }
  }

  async function POST<T = unknown>(
    path: string,
    options?: {
      params?: { path?: Record<string, string> };
      body?: unknown;
    },
  ): Promise<{ data: T | undefined; error: unknown }> {
    const url = resolvePath(path, options?.params?.path);
    try {
      const res = await axiosInstance.post<T>(url, options?.body);
      return { data: res.data, error: undefined };
    } catch (err) {
      return { data: undefined, error: extractErrorBody(err) };
    }
  }

  async function PATCH<T = unknown>(
    path: string,
    options?: {
      params?: { path?: Record<string, string> };
      body?: unknown;
    },
  ): Promise<{ data: T | undefined; error: unknown }> {
    const url = resolvePath(path, options?.params?.path);
    try {
      const res = await axiosInstance.patch<T>(url, options?.body);
      return { data: res.data, error: undefined };
    } catch (err) {
      return { data: undefined, error: extractErrorBody(err) };
    }
  }

  async function DELETE<T = unknown>(
    path: string,
    options?: { params?: { path?: Record<string, string> } },
  ): Promise<{ data: T | undefined; error: unknown }> {
    const url = resolvePath(path, options?.params?.path);
    try {
      const res = await axiosInstance.delete<T>(url);
      return { data: res.data, error: undefined };
    } catch (err) {
      return { data: undefined, error: extractErrorBody(err) };
    }
  }

  return { GET, POST, PATCH, DELETE };
}

function resolvePath(
  template: string,
  pathParams?: Record<string, string>,
): string {
  if (!pathParams) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const val = pathParams[key];
    if (val === undefined) return `{${key}}`;
    return encodeURIComponent(val);
  });
}

function extractErrorBody(err: unknown): unknown {
  if (
    err &&
    typeof err === "object" &&
    "response" in err &&
    (err as any).response?.data
  ) {
    return (err as any).response.data;
  }
  return err;
}

export function formatClientError(error: unknown): string {
  if (error == null) {
    return "Request failed";
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error !== "object") {
    return "Request failed";
  }
  const e = error as Record<string, unknown>;
  if (typeof e.message === "string") {
    return e.message;
  }
  if (Array.isArray(e.message)) {
    return e.message.map(String).join(", ");
  }
  if (typeof e.error === "string") {
    return e.error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Request failed";
  }
}
