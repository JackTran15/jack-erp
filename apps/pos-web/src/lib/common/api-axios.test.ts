import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios, { AxiosHeaders } from "axios";
import { AuthErrorCode } from "@erp/shared-interfaces";
import { apiClient } from "./api-axios";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    _store: store,
  };
}

function buildConfig(isRetry: boolean): Record<string, unknown> {
  return {
    method: "get",
    url: "/protected-resource",
    headers: new AxiosHeaders(),
    ...(isRetry ? { _retry: true } : {}),
  };
}

function build401(data: unknown, isRetry = false) {
  return {
    isAxiosError: true,
    name: "AxiosError",
    message: "Request failed with status code 401",
    config: buildConfig(isRetry),
    response: { status: 401, data, statusText: "Unauthorized", headers: {}, config: {} },
    toJSON: () => ({}),
  } as any;
}

function getRejectedHandler(): (error: unknown) => Promise<unknown> {
  const handlers = (apiClient.interceptors.response as any).handlers;
  return handlers[0].rejected;
}

describe("pos-web api-axios response interceptor", () => {
  let storage: ReturnType<typeof fakeLocalStorage>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { location: { href: "" } });
    storage = fakeLocalStorage();
    vi.stubGlobal("localStorage", storage);
    storage._store.set(REFRESH_TOKEN_KEY, "old-refresh");
    apiClient.defaults.adapter = vi.fn(async (config: any) => ({
      data: {},
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    })) as any;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("attempts refresh for a 401 with no code (AC-05)", async () => {
    const postSpy = vi.spyOn(axios, "post").mockResolvedValue({
      data: { accessToken: "new-access", refreshToken: "new-refresh" },
    });

    const handler = getRejectedHandler();
    await handler(build401({}));

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(String(postSpy.mock.calls[0][0])).toContain("/auth/refresh");
    expect(storage.getItem(ACCESS_TOKEN_KEY)).toBe("new-access");
  });

  it("attempts refresh for a 401 with an unrecognized code (AC-05)", async () => {
    const postSpy = vi.spyOn(axios, "post").mockResolvedValue({
      data: { accessToken: "new-access", refreshToken: "new-refresh" },
    });

    const handler = getRejectedHandler();
    await handler(build401({ code: "9999999" }));

    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it("attempts refresh for a SESSION_REVOKED 401, then clears tokens and redirects when refresh itself fails (AC-07, AC-08)", async () => {
    const postSpy = vi.spyOn(axios, "post").mockRejectedValue(new Error("refresh rejected"));
    storage._store.set(ACCESS_TOKEN_KEY, "stale-access");

    const error = build401({ code: AuthErrorCode.SESSION_REVOKED });
    const handler = getRejectedHandler();

    await expect(handler(error)).rejects.toBe(error);

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(storage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(storage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect((window as unknown as { location: { href: string } }).location.href).toContain(
      "dang-nhap",
    );
    // AC-07: the interceptor never mutates the original error's response payload.
    expect(error.response.data).toEqual({ code: AuthErrorCode.SESSION_REVOKED });
  });

  it("does not attempt a second refresh for an already-retried request (AC-06)", async () => {
    // Pre-existing pos-web behavior (unchanged by this feature, confirmed by reading
    // apps/pos-web/src/lib/common/api-axios.ts:93-122): unlike backoffice-web's dedicated
    // `__isRetry` terminal branch, pos-web's `!originalRequest._retry` guard wraps *both*
    // the refresh attempt *and* the clear-tokens-and-redirect fallback in one `if` block.
    // When `_retry` is already true, that whole block — refresh attempt included — is
    // skipped and the handler just re-rejects; it does not itself clear tokens or redirect
    // a second time. This ticket's plan text describes AC-05/AC-06 "parity" with
    // backoffice-web; the no-second-refresh-call guarantee holds (asserted below), but the
    // clear+redirect side effect does not apply here — flagged as a live-code deviation
    // from the ticket's assumption rather than silently asserted as true.
    const postSpy = vi.spyOn(axios, "post");
    storage._store.set(ACCESS_TOKEN_KEY, "stale-access");

    const error = build401({ code: AuthErrorCode.TOKEN_EXPIRED }, true);
    const handler = getRejectedHandler();

    await expect(handler(error)).rejects.toBe(error);

    expect(postSpy).not.toHaveBeenCalled();
    // Unchanged from before this feature: no side effects on the already-retried path.
    expect(storage.getItem(ACCESS_TOKEN_KEY)).toBe("stale-access");
    expect((window as unknown as { location: { href: string } }).location.href).toBe("");
  });
});
