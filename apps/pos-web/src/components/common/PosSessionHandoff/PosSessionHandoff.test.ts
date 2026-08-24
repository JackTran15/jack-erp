import { beforeEach, describe, expect, it, vi } from "vitest";

const POS_REFRESH_TOKEN_KEY = "pos_refresh_token";

vi.mock("@erp/pos/services/auth.service", () => ({
  authService: {
    isAuthenticated: vi.fn(),
  },
}));

vi.mock("@erp/pos/lib/common/token-refresh", () => ({
  refreshOnce: vi.fn(),
}));

import { authService } from "@erp/pos/services/auth.service";
import { refreshOnce } from "@erp/pos/lib/common/token-refresh";
import type { restoreSessionIfNeeded as RestoreSessionIfNeeded } from "./PosSessionHandoff";

// `posHandoffParams` (imported transitively by PosSessionHandoff.tsx) reads
// `window.location` as a module-level side effect on import — this repo's
// vitest run has no jsdom environment, so `window` must be stubbed *before*
// the module is loaded. A static top-level import runs before any test code,
// so we import dynamically instead, after stubbing the global.
let restoreSessionIfNeeded: typeof RestoreSessionIfNeeded;

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

describe("restoreSessionIfNeeded", () => {
  let storage: ReturnType<typeof fakeLocalStorage>;

  beforeEach(async () => {
    vi.clearAllMocks();
    storage = fakeLocalStorage();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { location: { href: "http://localhost/" }, history: { state: null, replaceState: vi.fn() } });
    ({ restoreSessionIfNeeded } = await import("./PosSessionHandoff"));
  });

  it("refreshes exactly once when access token is expired but a refresh token exists (AC-04)", async () => {
    vi.mocked(authService.isAuthenticated).mockReturnValue(false);
    storage._store.set(POS_REFRESH_TOKEN_KEY, "some-refresh-token");

    await restoreSessionIfNeeded();

    expect(refreshOnce).toHaveBeenCalledTimes(1);
  });

  it("does not attempt a refresh when there is no refresh token to use (AC-05)", async () => {
    vi.mocked(authService.isAuthenticated).mockReturnValue(false);

    await restoreSessionIfNeeded();

    expect(refreshOnce).not.toHaveBeenCalled();
  });

  it("does not attempt a refresh when the session is already valid", async () => {
    vi.mocked(authService.isAuthenticated).mockReturnValue(true);
    storage._store.set(POS_REFRESH_TOKEN_KEY, "some-refresh-token");

    await restoreSessionIfNeeded();

    expect(refreshOnce).not.toHaveBeenCalled();
  });
});
