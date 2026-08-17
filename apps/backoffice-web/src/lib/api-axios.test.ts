import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios, { AxiosHeaders } from "axios";
import { AuthErrorCode } from "@erp/shared-interfaces";

const authStorageMocks = vi.hoisted(() => ({
  getRefreshToken: vi.fn(),
  persistRefreshResponse: vi.fn(),
  clearSession: vi.fn(),
}));

const accessTokenMocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  setAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
}));

vi.mock("./auth-storage", () => authStorageMocks);
vi.mock("./access-token", () => accessTokenMocks);

import { apiClient } from "./api-axios";

function buildConfig(isRetry: boolean): Record<string, unknown> {
  return {
    method: "get",
    url: "/protected-resource",
    headers: new AxiosHeaders(),
    ...(isRetry ? { __isRetry: true } : {}),
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

describe("backoffice-web api-axios response interceptor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { location: { href: "" } });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
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
    authStorageMocks.getRefreshToken.mockReturnValue("old-refresh");
    const postSpy = vi.spyOn(axios, "post").mockResolvedValue({
      data: { accessToken: "new-access", refreshToken: "new-refresh", expiresIn: 900 },
    });

    const handler = getRejectedHandler();
    await handler(build401({}));

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(String(postSpy.mock.calls[0][0])).toContain("/auth/refresh");
    expect(authStorageMocks.clearSession).not.toHaveBeenCalled();
  });

  it("attempts refresh for a 401 with an unrecognized code (AC-05)", async () => {
    authStorageMocks.getRefreshToken.mockReturnValue("old-refresh");
    const postSpy = vi.spyOn(axios, "post").mockResolvedValue({
      data: { accessToken: "new-access", refreshToken: "new-refresh", expiresIn: 900 },
    });

    const handler = getRejectedHandler();
    await handler(build401({ code: "9999999" }));

    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it("attempts refresh for a SESSION_REVOKED 401, then clears session and redirects when refresh itself fails (AC-07, AC-08)", async () => {
    authStorageMocks.getRefreshToken.mockReturnValue("old-refresh");
    const postSpy = vi.spyOn(axios, "post").mockRejectedValue(new Error("refresh rejected"));

    const error = build401({ code: AuthErrorCode.SESSION_REVOKED });
    const handler = getRejectedHandler();

    await expect(handler(error)).rejects.toThrow("refresh rejected");

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(accessTokenMocks.clearAccessToken).toHaveBeenCalled();
    expect(authStorageMocks.clearSession).toHaveBeenCalled();
    expect((window as unknown as { location: { href: string } }).location.href).toBe("/login");
    // AC-07: the interceptor never mutates the original error's response payload.
    expect(error.response.data).toEqual({ code: AuthErrorCode.SESSION_REVOKED });
  });

  it("clears session and redirects without a second refresh call for an already-retried request (AC-06)", async () => {
    const postSpy = vi.spyOn(axios, "post");

    const error = build401({ code: AuthErrorCode.TOKEN_EXPIRED }, true);
    const handler = getRejectedHandler();

    await expect(handler(error)).rejects.toBe(error);

    expect(postSpy).not.toHaveBeenCalled();
    expect(authStorageMocks.clearSession).toHaveBeenCalled();
    expect((window as unknown as { location: { href: string } }).location.href).toBe("/login");
  });
});
