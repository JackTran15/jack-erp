import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
  },
}));

import { refreshOnce } from "./token-refresh";
import {
  POS_ACCESS_TOKEN_KEY as ACCESS_TOKEN_KEY,
  POS_REFRESH_TOKEN_KEY as REFRESH_TOKEN_KEY,
} from "@erp/pos/constants/common.constant";

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

describe("token-refresh refreshOnce", () => {
  let storage: ReturnType<typeof fakeLocalStorage>;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = fakeLocalStorage();
    vi.stubGlobal("localStorage", storage);
    storage._store.set(REFRESH_TOKEN_KEY, "old-refresh");
  });

  it("issues a single network call for two concurrent calls (AC-07)", async () => {
    (axios.post as any).mockResolvedValue({
      data: { accessToken: "new-access", refreshToken: "new-refresh" },
    });

    const [first, second] = [refreshOnce(), refreshOnce()];
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(firstResult).toBe(true);
    expect(secondResult).toBe(true);
    expect(storage.getItem(ACCESS_TOKEN_KEY)).toBe("new-access");
  });

  it("resolves both concurrent callers to false and clears tokens once on rejection (AC-08)", async () => {
    (axios.post as any).mockRejectedValue(new Error("network error"));
    storage._store.set(ACCESS_TOKEN_KEY, "stale-access");

    const [first, second] = [refreshOnce(), refreshOnce()];
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(firstResult).toBe(false);
    expect(secondResult).toBe(false);
    expect(storage.removeItem).toHaveBeenCalledWith(ACCESS_TOKEN_KEY);
    expect(storage.removeItem).toHaveBeenCalledWith(REFRESH_TOKEN_KEY);
    expect(storage.removeItem).toHaveBeenCalledTimes(2);
  });

  it("resolves both concurrent callers to false and clears tokens once when response lacks accessToken (AC-08)", async () => {
    (axios.post as any).mockResolvedValue({ data: {} });
    storage._store.set(ACCESS_TOKEN_KEY, "stale-access");

    const [first, second] = [refreshOnce(), refreshOnce()];
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(firstResult).toBe(false);
    expect(secondResult).toBe(false);
    expect(storage.removeItem).toHaveBeenCalledTimes(2);
  });
});
