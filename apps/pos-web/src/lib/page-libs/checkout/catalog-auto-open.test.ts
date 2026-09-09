import { describe, expect, it } from "vitest";

import { shouldAutoOpenVariant } from "@erp/pos/lib/page-libs/checkout/catalog-auto-open";

/**
 * CẢNH BÁO: repo chưa cài test runner nào cho pos-web. `pnpm --filter @erp/pos-web test`
 * là `echo test`, và không có vitest/jest trong node_modules — 10+ file `.test.ts` sẵn
 * có ở workspace này cũng không chạy được.
 *
 * File này viết theo đúng khuôn `fast-stock-transfer-scan-resolve.test.ts` để chạy được
 * ngay khi có runner. Cho tới lúc đó nó là đặc tả chứ **không** phải bằng chứng — bằng
 * chứng cho T-03-01 là Demo script trong `uow.md`.
 */

const base = {
  search: "ABA2777",
  total: 1,
  hasCard: true,
  lastOpenedFor: null,
};

describe("shouldAutoOpenVariant", () => {
  it("opens when exactly one card matches a fresh term", () => {
    expect(shouldAutoOpenVariant(base)).toBe(true);
  });

  it("stays shut while the search box is empty", () => {
    // Đây là nhánh chặn một lần quét mã vạch: nhánh `added` xoá ô tìm.
    expect(shouldAutoOpenVariant({ ...base, search: "" })).toBe(false);
    expect(shouldAutoOpenVariant({ ...base, search: "   " })).toBe(false);
  });

  it("stays shut when nothing matches", () => {
    expect(shouldAutoOpenVariant({ ...base, total: 0, hasCard: false })).toBe(
      false,
    );
  });

  it("stays shut when more than one card matches", () => {
    expect(shouldAutoOpenVariant({ ...base, total: 6 })).toBe(false);
  });

  it("reads the total, not the size of the page", () => {
    // Trang cuối của một kết quả 21 card cũng chỉ có 1 card trên trang. `hasCard`
    // đúng, nhưng `total` mới là câu trả lời cho "khớp đúng một món".
    expect(shouldAutoOpenVariant({ ...base, total: 21 })).toBe(false);
  });

  it("does not reopen for a term it already opened", () => {
    expect(
      shouldAutoOpenVariant({ ...base, lastOpenedFor: "ABA2777" }),
    ).toBe(false);
  });

  it("opens again once the term changes", () => {
    expect(
      shouldAutoOpenVariant({
        ...base,
        search: "ABA2778",
        lastOpenedFor: "ABA2777",
      }),
    ).toBe(true);
  });

  it("compares the trimmed term, so padding is not a new search", () => {
    expect(
      shouldAutoOpenVariant({
        ...base,
        search: "  ABA2777  ",
        lastOpenedFor: "ABA2777",
      }),
    ).toBe(false);
  });

  it("waits for the card before opening", () => {
    expect(shouldAutoOpenVariant({ ...base, hasCard: false })).toBe(false);
  });
});
