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
    docNo: "NK000383",
    docDate: "28 tháng 7 năm 2026",
    branch: {
      name: "Chi nhánh 211 TP. Đà Nẵng",
      address: "211 Lê Duẩn, Thanh Khê - Đà Nẵng",
      phone: null,
    },
    info: [
      { label: "Đối tượng", value: "CHÂU" },
      { label: "Người giao", value: "A VINH" },
    ],
    lineColumns: [
      { col: "stt", label: "STT", type: ReportColumnDataType.NUMBER, align: "center" },
      { col: "sku", label: "Mã SKU", type: ReportColumnDataType.STRING },
      { col: "name", label: "Tên hàng hóa", type: ReportColumnDataType.STRING, span: 4 },
      { col: "quantity", label: "SL", type: ReportColumnDataType.NUMBER },
      { col: "lineTotal", label: "Thành tiền", type: ReportColumnDataType.CURRENCY },
      {
        col: "salePrice",
        label: "Giá bán",
        type: ReportColumnDataType.CURRENCY,
        hidden: true,
      },
      {
        col: "saleTotal",
        label: "Thành tiền giá bán",
        type: ReportColumnDataType.CURRENCY,
        hidden: true,
      },
    ],
    lines: [
      {
        stt: 1,
        sku: "TH10520-D-35",
        name: "Giày nữ TH10520-D-35",
        quantity: 2,
        lineTotal: 500000,
        salePrice: 400000,
        saleTotal: 800000,
      },
    ],
    totals: {
      stt: null,
      sku: null,
      name: null,
      quantity: 2,
      lineTotal: 500000,
      salePrice: null,
      saleTotal: 800000,
    },
    totalsLabel: "Tổng",
    signatures: [
      "Người lập phiếu",
      "Người nhận hàng",
      "Thủ kho",
      "Kế toán trưởng",
      "Giám đốc",
    ],
    ...overrides,
  };
}

describe("renderVoucherHtml", () => {
  it("renders header, info rows, line table, and signature labels", () => {
    const html = renderVoucherHtml(payload());

    expect(html).toContain("PHIẾU NHẬP KHO");
    expect(html).toContain("NK000383");
    expect(html).toContain("Chi nhánh 211 TP. Đà Nẵng");
    expect(html).toContain("Đối tượng");
    expect(html).toContain("CHÂU");
    expect(html).toContain("TH10520-D-35");
    expect(html).toContain("Người lập phiếu");
    expect(html).toContain("Giám đốc");
  });

  it("prints in the same face as the exported workbook", () => {
    expect(renderVoucherHtml(payload())).toContain('"Times New Roman"');
  });

  it("puts the date and the number on two separate centred lines", () => {
    const html = renderVoucherHtml(payload());

    expect(html).toContain('<div class="doc-date">Ngày 28 tháng 7 năm 2026</div>');
    expect(html).toContain('<div class="doc-no">Số: NK000383</div>');
    // The word "Ngày" belongs to the template, not the value.
    expect(html).not.toContain("Ngày Ngày");
    expect(html).not.toContain("Số: NK000383 —");
  });

  it("left-aligns the branch block", () => {
    const html = renderVoucherHtml(payload());

    expect(html).toContain(".branch-line { text-align: left; }");
  });

  it("stacks the info rows instead of laying them out in two columns", () => {
    const html = renderVoucherHtml(payload());

    expect(html).not.toContain("flex: 1 1 45%");
    expect(html).toContain(".info-row { text-align: left; }");
  });

  it("leaves the table header unshaded", () => {
    const html = renderVoucherHtml(payload());

    expect(html).not.toContain("background: #f0f0f0");
  });

  it("labels the totals row and spans the label over the leading text columns", () => {
    const html = renderVoucherHtml(payload());

    // STT is numeric but first, so the label covers only column 1.
    expect(html).toContain('<tr class="totals"><td colspan="1" class="align-left">Tổng</td>');
    expect(html).toContain("500.000");
  });

  it("leaves hidden columns off the printed page", () => {
    const html = renderVoucherHtml(payload());

    expect(html).not.toContain("Giá bán");
    expect(html).not.toContain("Thành tiền giá bán");
    // ...and their values go with them.
    expect(html).not.toContain("800.000");
  });

  it("prints one header cell per visible column", () => {
    const html = renderVoucherHtml(payload());

    // `<th[ >]` and not `<th`, which also matches `<thead>`.
    expect(html.match(/<th[ >]/g)).toHaveLength(5);
  });

  it("gives a spanned column the same colspan in the header and the body", () => {
    const html = renderVoucherHtml(payload());

    expect(html).toContain('<th colspan="4">Tên hàng hóa</th>');
    expect(html).toContain('<td colspan="4" class="align-left">Giày nữ TH10520-D-35</td>');
  });

  it("counts a span when working out how far the totals label reaches", () => {
    const html = renderVoucherHtml(
      payload({
        lineColumns: [
          { col: "sku", label: "Mã SKU", type: ReportColumnDataType.STRING },
          { col: "name", label: "Tên", type: ReportColumnDataType.STRING, span: 4 },
          { col: "quantity", label: "SL", type: ReportColumnDataType.NUMBER },
        ],
        lines: [{ sku: "A", name: "B", quantity: 1 }],
        totals: { sku: null, name: null, quantity: 1 },
      }),
    );

    // Two logical columns ahead of the first figure, but five grid columns.
    expect(html).toContain('<td colspan="5" class="align-left">Tổng</td>');
  });

  it("uses the label the payload asks for", () => {
    const html = renderVoucherHtml(payload({ totalsLabel: "Cộng" }));

    expect(html).toContain(">Cộng</td>");
  });

  it("spans the totals label over every leading text column", () => {
    const html = renderVoucherHtml(
      payload({
        lineColumns: [
          { col: "sku", label: "Mã SKU", type: ReportColumnDataType.STRING },
          { col: "name", label: "Tên", type: ReportColumnDataType.STRING },
          { col: "quantity", label: "SL", type: ReportColumnDataType.NUMBER },
        ],
        lines: [{ sku: "A", name: "B", quantity: 1 }],
        totals: { sku: null, name: null, quantity: 1 },
      }),
    );

    expect(html).toContain('<td colspan="2" class="align-left">Tổng</td>');
  });

  it("renders a table with no span or hidden exactly as before", () => {
    const html = renderVoucherHtml(
      payload({
        lineColumns: [
          { col: "sku", label: "Mã SKU", type: ReportColumnDataType.STRING },
          { col: "quantity", label: "SL", type: ReportColumnDataType.NUMBER },
        ],
        lines: [{ sku: "A", quantity: 1 }],
        totals: { sku: null, quantity: 1 },
      }),
    );

    expect(html).toContain("<th>Mã SKU</th>");
    expect(html).toContain('<td class="align-left">A</td>');
    expect(html).not.toContain("colspan=\"1\"><");
  });

  it("switches @page size with the payload's paper size", () => {
    expect(renderVoucherHtml(payload({ paper: "A4" }))).toContain("size: A4;");
    expect(renderVoucherHtml(payload({ paper: "A5" }))).toContain("size: A5;");
  });

  it("omits the amount-in-words block when absent, and words it the way the reference does", () => {
    expect(renderVoucherHtml(payload())).not.toContain("Số tiền viết bằng chữ");

    const withAmount = renderVoucherHtml(
      payload({ amountInWords: "Mười tám triệu đồng chẵn." }),
    );
    expect(withAmount).toContain("Số tiền viết bằng chữ:");
    expect(withAmount).toContain("Mười tám triệu đồng chẵn.");
    // The reference says "viết bằng chữ", not "bằng chữ".
    expect(withAmount).not.toContain(">Số tiền bằng chữ:<");
  });

  it("prints the signing date line above the signature block", () => {
    const html = renderVoucherHtml(payload());

    expect(html).toContain("Ngày.......tháng.......năm............");
    expect(html.indexOf("Ngày.......tháng")).toBeLessThan(
      html.indexOf("Người lập phiếu"),
    );
  });

  it("gives every signature its own hint", () => {
    const html = renderVoucherHtml(payload());

    expect(html.split("(Ký, họ tên)").length - 1).toBe(5);
  });

  it("follows the payload when the signature count differs", () => {
    const html = renderVoucherHtml(payload({ signatures: ["Thủ kho", "Giám đốc"] }));

    expect(html.split("(Ký, họ tên)").length - 1).toBe(2);
  });

  it("has no kind-specific branch — goods receipt and transfer order render through the same function", () => {
    const receipt = renderVoucherHtml(payload({ kind: VoucherKind.GOODS_RECEIPT }));
    const transfer = renderVoucherHtml(
      payload({ kind: VoucherKind.TRANSFER_ORDER, title: "PHIẾU CHUYỂN KHO" }),
    );

    expect(receipt).toContain("PHIẾU NHẬP KHO");
    expect(transfer).toContain("PHIẾU CHUYỂN KHO");
  });

  it("escapes values instead of emitting real tags", () => {
    const html = renderVoucherHtml(
      payload({ info: [{ label: "Đối tượng", value: "<script>alert(1)</script>" }] }),
    );

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
