# TKT-PDR-08 FE: In + Xuất client-side (BÁO CÁO TỔNG HỢP, Tổng hợp only)

## Epic

[EPIC-27072026 Báo cáo theo ngày (POS Daily Report)](../epics/EPIC-27072026-pos-daily-report.md)

## Summary

In (print) và Xuất (Excel) tài liệu "BÁO CÁO TỔNG HỢP" cho **tab Tổng hợp** — render client-side từ (số liệu `daily-summary` API) + (state form BÀN GIAO TIỀN nhập tay). Dùng chung 1 renderer HTML. Tab "Doanh thu theo mặt hàng" **không** In/Xuất (tạm hoãn).

> **Cập nhật (PDR-10):** phần **Xuất** ở ticket này (`.xls` HTML-table client-side) đã bị thay thế bằng endpoint BE `POST /reports/pos/daily-summary/export` (`exceljs`) để khớp chính xác merge/border/font file mẫu — xem [TKT-PDR-10](./TKT-PDR-10-export-be-rewrite-hardening.md). **In** vẫn giữ nguyên client-side như mô tả dưới đây.

## Deliverables

- `apps/pos-web/src/lib/page-libs/daily-report/renderDailyReportHtml.ts` — build HTML tài liệu (grid 2 cột label|value; section I. Tổng tiền / 1. Thu / 2. Chi / II. Công nợ / III. Hàng bán / IV. Hàng trả / V. Khác + BÀN GIAO TIỀN: I. Tiền nhận bàn giao / II. Bàn giao / III. Chênh lệch / Ghi chú / Người lập-Người nhận). Khớp cấu trúc file mẫu `Báo cáo tổng hợp (3).xls`. Nhận `(summary, handoverForm, meta{branchName, address, now, range, user, cashierFilter, nvbhFilter})`.
- `apps/pos-web/src/lib/page-libs/daily-report/printDailyReport.ts` — tái dùng `lib/page-libs/checkout/printing/BrowserWindowInvoicePrinter.ts` mở print window + `window.print()`.
- `apps/pos-web/src/lib/page-libs/daily-report/exportDailyReportXls.ts` — bọc HTML table vào `Blob(['﻿' + html], {type:'application/vnd.ms-excel'})`, tải file `Báo cáo tổng hợp.xls` (zero-dep).
- Nối vào `DailyReportToolbar` (In/Xuất) + nút "In bàn giao" trong `HandoverPanel` (In).

## Acceptance Criteria

- [ ] Tab Tổng hợp: **In** mở print window đúng layout (header chi nhánh/địa chỉ/ngày lập/thời gian/người lập/NVBH/thu ngân + các section số liệu + BÀN GIAO TIỀN gồm field nhập tay).
- [ ] **Xuất** tải `.xls` mở được bằng Excel/LibreOffice, nội dung + thứ tự khớp file mẫu; số hiển thị đúng (vi-VN hoặc raw number Excel parse được).
- [ ] Tài liệu lấy số bàn giao/ghi chú/người lập-nhận từ state form FE (không từ backend).
- [ ] Tab Doanh thu theo mặt hàng: nút In/Xuất ẩn/disabled (từ PDR-06).

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` xanh.
- [ ] Không thêm dependency mới (HTML-table .xls zero-dep).
- [ ] Tuân thủ pos-web CLAUDE.md.

## Tech Approach

```ts
export function exportDailyReportXls(html: string, filename = 'Báo cáo tổng hợp.xls') {
  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
```

## Testing Strategy

- Verify In (print window) + Xuất (.xls mở bằng Excel) trên app thật ở TKT-PDR-09.

## Dependencies

- Depends on: TKT-PDR-06, TKT-PDR-07
- Blocks: TKT-PDR-09
