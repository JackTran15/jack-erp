import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./token-refresh", () => ({
  refreshOnce: vi.fn(async () => {
    localStorage.setItem("pos_access_token", "new-access");
    return true;
  }),
}));

vi.mock("@erp/pos/stores/common/branch.store", () => ({
  usePosBranchStore: { getState: () => ({ branchId: "branch-1" }) },
}));

import { http } from "./http";

function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

function ok() {
  return new Response("{}", { status: 200 });
}

function keysSent(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(([, init]) =>
    (init.headers as Headers).get("X-Idempotency-Key"),
  );
}

describe("pos-web http idempotency header", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal("localStorage", fakeLocalStorage());
    localStorage.setItem("pos_access_token", "old-access");
    fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
  });

  it("sends the caller's key verbatim instead of minting one", async () => {
    await http.post("/v2/pos/checkout", { invoiceId: "inv-1" }, {
      idempotencyKey: "inv-1",
    });

    expect(keysSent(fetchMock)).toEqual(["inv-1"]);
  });

  it("still mints a key when the caller supplies none", async () => {
    await http.post("/anything", {});

    expect(keysSent(fetchMock)[0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reuses the same key on the retry after a token refresh", async () => {
    // Đây đúng là trường hợp idempotency sinh ra để chặn: request đầu đã có thể
    // chạm BE rồi mới 401. Dựng lại headers cho lần gửi lại (bản cũ làm vậy) là
    // mint key mới, BE coi như một mutation khác → bán hai lần.
    fetchMock
      .mockImplementationOnce(async () => new Response("{}", { status: 401 }))
      .mockImplementationOnce(async () => ok());

    await http.post("/v2/pos/checkout", { invoiceId: "inv-1" }, {
      idempotencyKey: "inv-1",
    });

    const [first, second] = keysSent(fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(second).toBe(first);
    expect(
      (fetchMock.mock.calls[1][1].headers as Headers).get("Authorization"),
    ).toBe("Bearer new-access");
  });

  it("keeps a minted key across the refresh retry too", async () => {
    fetchMock
      .mockImplementationOnce(async () => new Response("{}", { status: 401 }))
      .mockImplementationOnce(async () => ok());

    await http.post("/invoices", { items: [] });

    const [first, second] = keysSent(fetchMock);
    expect(second).toBe(first);
  });
});
