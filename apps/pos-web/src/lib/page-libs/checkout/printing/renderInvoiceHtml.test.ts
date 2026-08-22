import { describe, expect, it } from "vitest";

import { renderInvoiceHtml } from "@erp/pos/lib/page-libs/checkout/printing/renderInvoiceHtml";
import type { InvoicePayload } from "@erp/pos/dtos/invoice-printing.dto";

const payload = (overrides: Partial<InvoicePayload> = {}): InvoicePayload => ({
  store: { name: "Giày MT", address: "211 Lê Duẩn", phone: "0236 3825 656" },
  issuedAt: new Date("2026-08-21T17:09:00+07:00"),
  info: { customerName: "CHI LOAN" },
  lines: [
    {
      index: 1,
      name: "Dép nữ MY2A26-9-K-38",
      qty: 1,
      unitPrice: 780_000,
      lineTotal: 780_000,
    },
  ],
  totals: { subtotal: 780_000, grandTotal: 780_000, totalPaid: 780_000 },
  payments: [{ label: "Tiền mặt", amount: 780_000 }],
  policy: { title: "", body: "" },
  closingMessage: "Giày MT hân hạnh phục vụ quý khách!",
  ...overrides,
});

describe("renderInvoiceHtml — dòng số hoá đơn", () => {
  it("in đúng số khi hoá đơn đã được server cấp số", () => {
    const html = renderInvoiceHtml(payload({ invoiceNumber: "2608210001" }));

    expect(html).toContain("Số: 2608210001");
    expect(html).toContain("<title>Hóa đơn 2608210001</title>");
  });

  // Thiếu số còn hơn sai số: một con số trông đúng mà tra không ra hoá đơn nào
  // chính là bug mà feature này đi sửa.
  it("ẩn hẳn dòng Số khi chưa có số", () => {
    const html = renderInvoiceHtml(payload({ invoiceNumber: undefined }));

    expect(html).not.toContain("Số:");
    expect(html).not.toContain("undefined");
  });

  it("chuỗi rỗng cũng bị coi là chưa có số, không in ra dòng trống", () => {
    const html = renderInvoiceHtml(payload({ invoiceNumber: "" }));

    expect(html).not.toContain("Số:");
    expect(html).not.toContain('class="doc-number"');
  });

  it("phiếu tạm tính ra tiêu đề riêng và không mang số (AC-13)", () => {
    const html = renderInvoiceHtml(payload({ provisional: true }));

    expect(html).toContain("HÓA ĐƠN TẠM TÍNH");
    expect(html).not.toContain("Số:");
  });
});
