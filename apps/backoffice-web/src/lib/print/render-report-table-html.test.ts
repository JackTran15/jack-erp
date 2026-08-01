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

  describe("column formula notation (desc)", () => {
    it("renders the formula in a separate span under the label", () => {
      const html = renderReportTableHtml(
        payload({
          columns: [
            { col: "date", label: "Ngày", type: ReportColumnDataType.STRING },
            {
              col: "unitPrice",
              label: "Đơn giá TB",
              type: ReportColumnDataType.CURRENCY,
              desc: "(2)=(3)/(1)",
            },
          ],
        }),
      );

      expect(html).toContain(
        '<th>Đơn giá TB<span class="formula">(2)=(3)/(1)</span></th>',
      );
    });

    it("omits the formula span for a column with no desc", () => {
      const html = renderReportTableHtml(payload());
      expect(html).toContain("<th>Ngày</th>");
      expect(html).not.toContain('class="formula"');
    });

    it("escapes the formula text like any other value", () => {
      const html = renderReportTableHtml(
        payload({
          columns: [
            {
              col: "x",
              label: "X",
              type: ReportColumnDataType.STRING,
              desc: "<b>(1)</b>",
            },
          ],
        }),
      );

      expect(html).toContain("&lt;b&gt;(1)&lt;/b&gt;");
      expect(html).not.toContain("<b>(1)</b>");
    });
  });

  describe("column band header (DocumentColumn.group)", () => {
    const banded = () =>
      payload({
        columns: [
          { col: "date", label: "Ngày", type: ReportColumnDataType.STRING },
          {
            col: "cash",
            label: "Tiền mặt",
            type: ReportColumnDataType.CURRENCY,
            group: "Doanh thu",
          },
          {
            col: "card",
            label: "Thẻ",
            type: ReportColumnDataType.CURRENCY,
            group: "Doanh thu",
          },
          {
            col: "debt",
            label: "Công nợ",
            type: ReportColumnDataType.CURRENCY,
            group: "Khách hàng thanh toán",
          },
        ],
        rows: [{ date: "2026-07-09", cash: 1, card: 2, debt: 3 }],
        totals: { date: null, cash: 1, card: 2, debt: 3 },
      });

    it("renders two thead rows when any column carries a band", () => {
      const html = renderReportTableHtml(banded());
      const thead = html.slice(html.indexOf("<thead>"), html.indexOf("</thead>"));

      expect(thead.match(/<tr>/g)).toHaveLength(2);
    });

    it("spans a band across exactly the columns that carry it", () => {
      const html = renderReportTableHtml(banded());

      expect(html).toContain('<th colspan="2">Doanh thu</th>');
      expect(html).toContain('<th colspan="1">Khách hàng thanh toán</th>');
    });

    it("gives an unbanded column both rows and does not repeat it below", () => {
      const html = renderReportTableHtml(banded());
      const thead = html.slice(html.indexOf("<thead>"), html.indexOf("</thead>"));
      const secondRow = thead.slice(thead.lastIndexOf("<tr>"));

      expect(thead).toContain('<th rowspan="2">Ngày</th>');
      expect(secondRow).not.toContain("Ngày");
      expect(secondRow).toContain("Tiền mặt");
      expect(secondRow).toContain("Công nợ");
    });

    it("renders a single thead row when no column carries a band", () => {
      // The debt and profit domains emit no bands; their printout must not grow
      // a second header row.
      const html = renderReportTableHtml(payload());
      const thead = html.slice(html.indexOf("<thead>"), html.indexOf("</thead>"));

      expect(thead.match(/<tr>/g)).toHaveLength(1);
      expect(thead).not.toContain("colspan");
      expect(thead).not.toContain("rowspan");
    });

    it("keeps the formula notation on both banded and unbanded columns", () => {
      const html = renderReportTableHtml(
        payload({
          columns: [
            {
              col: "date",
              label: "Ngày",
              type: ReportColumnDataType.STRING,
              desc: "(0)",
            },
            {
              col: "cash",
              label: "Tiền mặt",
              type: ReportColumnDataType.CURRENCY,
              group: "Doanh thu",
              desc: "(7)",
            },
          ],
          rows: [{ date: "2026-07-09", cash: 1 }],
          totals: null,
        }),
      );

      expect(html).toContain(
        '<th rowspan="2">Ngày<span class="formula">(0)</span></th>',
      );
      expect(html).toContain('<th>Tiền mặt<span class="formula">(7)</span></th>');
    });

    it("escapes a band label like any other value", () => {
      const html = renderReportTableHtml(
        payload({
          columns: [
            {
              col: "x",
              label: "X",
              type: ReportColumnDataType.STRING,
              group: "<b>DT</b>",
            },
          ],
          rows: [{ x: "1" }],
          totals: null,
        }),
      );

      expect(html).toContain("&lt;b&gt;DT&lt;/b&gt;");
      expect(html).not.toContain("<b>DT</b>");
    });
  });
});
