# TKT-PDR-10 Xuất → BE-generated .xlsx + post-launch hardening

## Epic

[EPIC-27072026 Báo cáo theo ngày (POS Daily Report)](../epics/EPIC-27072026-pos-daily-report.md)

## Summary

Post-launch round sau khi PDR-01..09 đã merge và feature lên môi trường dev thật. Hai mảng việc:

1. **Xuất chuyển từ client-side sang BE-generated `.xlsx`** — thay thế cách tiếp cận "HTML-table Blob zero-dep" ở PDR-08 bằng endpoint `POST /reports/pos/daily-summary/export` dùng `exceljs`, khớp **chính xác** cấu trúc/format file mẫu `Báo cáo tổng hợp (3).xls` (merge cells, border, font Times New Roman, `#,##0`, độ rộng cột, 2-level indent, row height đều nhau). Lý do đổi: HTML-table `.xls` không kiểm soát được merge/border/font chính xác như file mẫu thật; sinh trực tiếp bằng `exceljs` (đã là dependency sẵn có, cùng pattern với `stock-summary-export.service.ts`) cho kết quả đúng byte-for-byte về cấu trúc. **In vẫn giữ client-side** (A80 print window) — không đổi.
2. **Bug fix phát hiện khi đối chiếu số liệu với report `daily-sales-summary` đã có** (nguồn tham chiếu tin cậy) và khi test UI thật: tên nhân viên bị đảo Họ/Tên, branch scope bị "leak" toàn bộ chi nhánh với user có quyền consolidated, cash-refund không được net vào Thu tiền mặt, Chi/Công nợ không lọc được theo Thu ngân/NVBH.

## Deliverables

**BE — Xuất .xlsx:**
- `apps/api/src/modules/reporting/pos-daily-report/dto/pos-daily-summary-export.dto.ts` — mở rộng `PosDailySummaryDto` với snapshot form BÀN GIAO TIỀN (FE-only, không nguồn nào khác) + label Thu ngân/NVBH đã resolve.
- `apps/api/src/modules/reporting/pos-daily-report/pos-daily-summary-export.service.ts` — build workbook 5 cột (A margin, B/D label, C/E value) bằng `exceljs`, tái dùng `GetPosDailySummaryQuery` cho số liệu; branch name/address + "Người lập"/"Ngày lập" resolve server-side (không tin client).
- `PosDailyReportController.exportDailySummary` — `POST /reports/pos/daily-summary/export`, trả buffer `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- `pos-daily-summary-export.service.spec.ts` — assert khớp số liệu file mẫu thật (row-for-row), merge/border/font, 2-level indent (`SL hóa đơn bán hàng/đổi trả/đổi trả-mua thêm` dưới cả "V. Khác" và "II. Bàn giao"), row height đều nhau.

**FE — wire Xuất mới:**
- `http.postBlob` (mới trong `lib/common/http.ts`) — cùng auth/refresh flow như `post`, trả `Blob`.
- `dailyReportService.exportDailySummary` + `useExportDailySummaryMutation` (react-query mutation).
- `DailyReportPage.handleExport` gọi mutation, tải Blob trả về.
- Xoá `renderDailySummaryTableHtml` (dead code) + CSS export riêng trong `renderDailyReportHtml.ts`; `exportDailyReportXls.ts` đổi thành generic Blob-downloader.

**BE — bug fix (đối chiếu với `daily-sales-summary` + test UI thật):**
- `get-report-filter-options.handler.ts`: `fullName()` đổi thứ tự `[lastName, firstName]` → `[firstName, lastName]` (khớp `UserEntity` field comment + convention toàn codebase, vd `counterparty-name.util.ts`); thêm `metadata.name` (tên rút gọn, không kèm mã NV) để FE hiển thị name-only ở select trigger/print label.
- `get-pos-daily-summary.handler.ts`:
  - Branch scope: mặc định `actor.branchId` khi FE không gửi `branchId` — trước đây user có quyền `reporting.invoice.consolidated.read` bị unscoped (thấy toàn bộ chi nhánh) vì pos-web không có filter "Cửa hàng" để chọn "Tất cả" tường minh.
  - Cash-refund netting: `revenue.cash` trừ `invoice.refundedAmount` cho các invoice `refundMethod = CASH` (refund nằm ở header invoice, không phải `invoice_payments`, và không chắc có `cash_payments` voucher tương ứng) — mirror đúng logic `daily-sales-summary.report.ts`.
  - Công nợ (Ghi nợ/Giảm nợ) và Chi filter theo `cashierId`/`salespersonId`: join `invoice_debts`→`invoices`, `debt_payments`→`invoice_debts`→`invoices`; `cash_payments.staffId IN (cashierId, salespersonId)` (bảng chỉ có 1 field nhân viên, không tách cashier/salesperson như invoice).

**FE — polish:**
- `staffOptionName()` helper (`formatDailyReport.ts`) dùng chung cho mọi select trigger + label in ấn (Thu ngân/NVBH/Nhận từ/Người nhận bàn giao) — hiển thị tên, ẩn mã NV.
- `PosSelect.menuMinWidth` (mới) — menu mọc rộng hơn trigger, neo theo cạnh phải để không tràn viewport khi trigger nằm sát mép phải.
- In: `.receipt` margin cố định 4mm (không `auto`) — tránh nội dung bị căn giữa lệch khi in ra khổ giấy không phải 80mm (vd "Save as PDF").
- Tự động điền "Tiền bàn giao" = `openingAmount + revenue.cash − expense.cash` (Chênh lệch về 0) sau mỗi lần filter fetch data mới, và debounce 400ms khi user gõ "Số tiền bàn giao từ ban đầu".

## Acceptance Criteria

- [x] `POST /reports/pos/daily-summary/export` trả `.xlsx` mở được, cấu trúc khớp file mẫu (đã verify bằng cách đọc lại buffer thật qua `exceljs` — không chỉ trust unit test).
- [x] Số liệu Thu tiền mặt trong POS report khớp với report `daily-sales-summary` đã có (đối chiếu SQL trực tiếp, chênh lệch cash-refund đã fix).
- [x] User có quyền consolidated nhưng pos-web không gửi `branchId` vẫn bị scope đúng theo chi nhánh đang active.
- [x] Filter Thu ngân/NVBH áp đúng cho Công nợ; Chi lọc theo `cash_payments.staffId` khi 1 trong 2 filter được chọn.
- [x] Select Thu ngân/NVBH/Nhận từ/Người nhận bàn giao hiển thị tên (không mã NV) ở cả UI lẫn tài liệu in/xuất.

## Definition of Done

- [x] `pnpm --filter @erp/api test` (194 tests, `src/modules/reporting`) xanh.
- [x] `pnpm --filter @erp/api build` + `pnpm --filter @erp/pos-web build` xanh.
- [x] `pnpm openapi:generate` chạy lại cho endpoint export mới; snapshot + `schema.ts` committed.
- [x] Verify end-to-end trên app thật: login → export → đọc lại file `.xlsx` tải về bằng `exceljs` (không chỉ trust response 200).

## Tech Approach

Mirror pattern có sẵn `apps/api/src/modules/inventory/ledger/stock-summary-export.service.ts` (đã dùng `exceljs` + `applyWorkbookFont` cho export khác trong repo) thay vì tự chế binary `.xls`. Reuse `GetPosDailySummaryQuery` qua `QueryBus` trong controller — không duplicate logic tính số.

## Testing Strategy

- Unit: `pos-daily-summary-export.service.spec.ts` (giá trị + format), `get-pos-daily-summary.handler.spec.ts` (branch scope, cash-refund netting, Công nợ/Chi join theo staff).
- E2E thủ công: browser preview thật, click Xuất, đọc buffer response bằng `exceljs` trong Node để xác nhận không chỉ "trust the mock".
- Đối chiếu số liệu bằng `psql` trực tiếp trên `erp_dev` (không chỉ đọc code).

## Dependencies

- Depends on: TKT-PDR-08 (thay thế phần Xuất), toàn bộ chuỗi PDR-01..09 đã merge.
- Blocks: —
