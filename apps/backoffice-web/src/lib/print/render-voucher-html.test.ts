import { describe, expect, it } from "vitest";

import {
  ReportColumnDataType,
  VoucherKind,
  VoucherPrintPayload,
} from "@erp/shared-interfaces";

import { renderVoucherHtml } from "./render-voucher-html";

function payload(overrides: Partial<VoucherPrintPayload> = {}): VoucherPrintPayload {
  return {
    kind: VoucherKind.GOODS_RECEIPT,
    paper: "A4",
    title: "PHIẾU NHẬP KHO",
    docNo: "IMP000001",
    docDate: "09/07/2026",
    branch: { name: "Chi nhánh Hồ Chí Minh", address: null, phone: null },
    info: [
      { label: "Đối tượng", value: "Nhân viên HCM" },
      { label: "Người giao", value: "NV 01" },
    ],
    lineColumns: [
      { col: "sku", label: "Mã SKU", type: ReportColumnDataType.STRING },
      { col: "quantity", label: "Số lượng", type: ReportColumnDataType.NUMBER },
    ],
    lines: [{ sku: "ABA2777-D-38", quantity: 10 }],
    totals: { sku: null, quantity: 10 },
    signatures: ["Người giao hàng", "Người nhận hàng", "Thủ kho"],
    ...overrides,
  };
}

describe("renderVoucherHtml", () => {
  it("renders header, info rows, line table, and signature labels", () => {
    const html = renderVoucherHtml(payload());

    expect(html).toContain("PHIẾU NHẬP KHO");
    expect(html).toContain("IMP000001");
    expect(html).toContain("Chi nhánh Hồ Chí Minh");
    expect(html).toContain("Đối tượng");
    expect(html).toContain("Nhân viên HCM");
    expect(html).toContain("ABA2777-D-38");
    expect(html).toContain("Người giao hàng");
    expect(html).toContain("Thủ kho");
  });

  it("switches @page size with the payload's paper size", () => {
    const a4 = renderVoucherHtml(payload({ paper: "A4" }));
    const a5 = renderVoucherHtml(payload({ paper: "A5" }));

    expect(a4).toContain("size: A4;");
    expect(a5).toContain("size: A5;");
  });

  it("omits the amount-in-words block when absent, includes it when present", () => {
    const withoutAmount = renderVoucherHtml(payload());
    expect(withoutAmount).not.toContain("Số tiền bằng chữ");

    const withAmount = renderVoucherHtml(
      payload({ amountInWords: "Một triệu đồng chẵn" }),
    );
    expect(withAmount).toContain("Số tiền bằng chữ");
    expect(withAmount).toContain("Một triệu đồng chẵn");
  });

  it("has no kind-specific branch — goods receipt and transfer order render through the same function", () => {
    const receipt = renderVoucherHtml(payload({ kind: VoucherKind.GOODS_RECEIPT }));
    const transfer = renderVoucherHtml(
      payload({ kind: VoucherKind.TRANSFER_ORDER, title: "LỆNH ĐIỀU CHUYỂN" }),
    );
    expect(receipt).toContain("PHIẾU NHẬP KHO");
    expect(transfer).toContain("LỆNH ĐIỀU CHUYỂN");
  });

  it("escapes values instead of emitting real tags", () => {
    const html = renderVoucherHtml(
      payload({ info: [{ label: "Đối tượng", value: "<script>alert(1)</script>" }] }),
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
