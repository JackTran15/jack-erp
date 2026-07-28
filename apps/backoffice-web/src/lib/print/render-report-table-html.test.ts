import { describe, expect, it } from "vitest";

import { ReportColumnDataType, ReportDocumentPayload } from "@erp/shared-interfaces";

import { renderReportTableHtml } from "./render-report-table-html";

function payload(overrides: Partial<ReportDocumentPayload> = {}): ReportDocumentPayload {
  return {
    title: "TỔNG HỢP BÁN HÀNG THEO NGÀY",
    branch: { name: "Chi nhánh Hồ Chí Minh", address: null, phone: null },
    subtitleLines: ["Từ ngày: 2026-07-01; Đến ngày: 2026-07-31"],
    columns: [
      { col: "date", label: "Ngày", type: ReportColumnDataType.STRING },
      { col: "revenue", label: "Doanh thu", type: ReportColumnDataType.CURRENCY },
    ],
    rows: [{ date: "2026-07-09", revenue: 10_500_000 }],
    totals: { date: null, revenue: 10_500_000 },
    ...overrides,
  };
}

describe("renderReportTableHtml", () => {
  it("renders the right labels and values for a minimal 2-column payload", () => {
    const html = renderReportTableHtml(payload());

    expect(html).toContain("Ngày");
    expect(html).toContain("Doanh thu");
    expect(html).toContain("2026-07-09");
    expect(html).toContain("10.500.000");
  });

  it("escapes values instead of emitting real tags", () => {
    const html = renderReportTableHtml(
      payload({ rows: [{ date: "<script>alert(1)</script>", revenue: 0 }] }),
    );

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("switches @page size with the requested orientation", () => {
    const landscape = renderReportTableHtml(payload(), "landscape");
    const portrait = renderReportTableHtml(payload(), "portrait");

    expect(landscape).toContain("size: A4 landscape");
    expect(portrait).toContain("size: A4 portrait");
  });

  it("renders the totals row when present", () => {
    const html = renderReportTableHtml(payload());
    expect(html).toContain('class="totals"');
  });

  it("omits the totals row when null", () => {
    const html = renderReportTableHtml(payload({ totals: null }));
    expect(html).not.toContain('class="totals"');
  });
});
