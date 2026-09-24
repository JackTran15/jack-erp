---
feature: cash-report-voucher-detail
slug: 2026092401-cash-report-voucher-detail
owner: Akenzy
created: 2026-09-24
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Bấm Số chứng từ / Số hóa đơn / Tham chiếu trong báo cáo Quỹ tiền để xem chi tiết phiếu

## Problem

Nhóm báo cáo "Quỹ tiền" (5 báo cáo, feature `2026091802-cash-fund-reports`) liệt kê chứng từ
nhưng không cho mở chứng từ. Kế toán thấy một dòng "PC000123 — 1.200.000" trên Bảng kê thu
chi và phải sang Sổ quỹ tiền mặt / tiền gửi, lọc lại theo số, rồi mới xem được phiếu; với
phiếu thu bán hàng thì phải sang thêm Báo cáo bán hàng để xem hóa đơn.

Hiện trạng cụ thể trong repo:

- Cột "Số chứng từ" của #3 `cash-in-out-list` và #5 `expense-list-by-category` được backend
  khai `link: true` (`cash-in-out-list.report.ts:194`, `expense-list-by-category.report.ts:222`)
  và 02-requirements của feature trước ghi "Số chứng từ là link mở phiếu", nhưng
  `DRILL_DOWNS` (`pages/chain-store/reports/_lib/report-drilldown.ts:417`) không có resolver
  nào cho hai báo cáo này ⇒ ô không bấm được. UOW-02 của feature trước ghi rõ "dialog chi
  tiết phiếu trong báo cáo là việc sau" — đây là việc sau đó.
- Dòng chứng từ đã mang khoá ẩn `voucherId` + `voucherKind`
  (`CASH_FUND_ROW_KEYS`, `packages/shared-interfaces/src/cash-fund-report/column.ts:123`),
  nhưng không mang id hóa đơn; cột "Số hóa đơn" / "Tham chiếu" chỉ có mã.
- Phiếu chi hoàn tiền (`reference_type = REFUND`) trỏ tới `invoices.id` (erp_dev_3008:
  44/44 dòng khớp) nhưng không nằm trong `INVOICE_REFERENCE_TYPES` của hai báo cáo, nên
  "Số hóa đơn" trống và "Tham chiếu" chỉ in "REFUND".

"Giống các hóa đơn khác": báo cáo bán hàng đã mở hóa đơn bằng `InvoiceDetailDialog` của
trang báo cáo (`setDetailInvoice({ code, id })` → `GET /reports/invoices/detail`); Sổ quỹ
tiền mặt / tiền gửi đã mở phiếu bằng `ReceiptVoucherDialog` / `PaymentVoucherDialog` /
`DepositReceiptVoucherDialog` / `DepositPaymentVoucherDialog` ở chế độ VIEW. Feature này nối
hai cơ chế đó vào báo cáo Quỹ tiền.

## Affected personas

| Persona | Hành vi hiện tại | Hành vi mong muốn |
| --- | --- | --- |
| Kế toán / chủ chuỗi | Thấy số chứng từ trên báo cáo, phải sang Sổ quỹ tìm lại phiếu | Bấm Số chứng từ → dialog phiếu (xem, in, xuất khẩu) ngay trên báo cáo |
| Kế toán đối soát bán hàng | Thấy "INVOICE HD…" ở Tham chiếu, phải sang Báo cáo bán hàng | Bấm Số hóa đơn / Tham chiếu → dialog "Chi tiết hóa đơn" như Bảng kê hóa đơn |
| Người chỉ có quyền báo cáo quỹ, không có quyền xem phiếu / hóa đơn | — | Ô hiển thị text thường, không có link dẫn tới 403 |

## Success signal

Trên erp_dev_3008, từ cả 5 báo cáo Quỹ tiền (trực tiếp ở #3/#5, qua drill-down ở #2/#4/#6):
mỗi loại phiếu (Phiếu thu, Phiếu chi, Thu tiền gửi, Chi tiền gửi) mở đúng dialog xem phiếu
với đúng số chứng từ và số tiền của dòng đã bấm; một phiếu thu POS và một phiếu chi REFUND mở
đúng hóa đơn qua Số hóa đơn và Tham chiếu. Kiểm bằng script `aidlc-verify` có ảnh chụp.

## Out of scope

- **Tham chiếu không phải hóa đơn** — GOODS_RECEIPT (phiếu nhập), FUND_SWAP, TRANSFER,
  PAYABLE, MANUAL, REVERSAL: vẫn là text (A-01).
- **Sửa / xoá phiếu từ báo cáo** — dialog chỉ ở chế độ VIEW, không truyền `onRequestEdit`
  nên không có nút "Sửa".
- **Endpoint chi tiết riêng dưới `/reports/cash-fund`** cho người thiếu quyền phiếu (A-03).
- **Đổi cách phân loại dòng của "Tình hình thu chi"** — REFUND vẫn thuộc "Chi khác" theo
  A-02 của feature trước; chỉ thay đổi phép JOIN hóa đơn của #3/#5 (A-04).
- **Xuất khẩu Excel của dialog hóa đơn** — giữ nguyên toast "sẽ được bổ sung".

## Constraints

| Kind | Detail |
| --- | --- |
| Tái sử dụng | Dialog phiếu = 4 dialog của `pages/treasury/documents` ở `TreasuryVoucherDialogModeEnum.VIEW`, dữ liệu qua `useCashReceipt` / `useCashPayment` / `useBankReceipt` / `useBankPayment` + adapter `cash-vouchers.adapters.ts` như Sổ quỹ. Dialog hóa đơn = `chain-store/reports/InvoiceDetailDialog` sẵn có. |
| Cơ chế click | Qua registry `DRILL_DOWNS` + `DrillDownAction` (ADR-02 của feature sales-report-km-and-drilldown: cờ `link` chỉ tô màu, registry quyết định click). |
| Dialog lồng | Mọi dialog mở từ ô phải được mount cả ở `ReportPage` và trong `ReportDrillDownDialog` (store lồng) — nếu không ô trong dialog drill-down bấm không ra gì. |
| Quyền | FE ẩn link theo `usePermissionCheck`: `accounting.cash_receipt.read`, `accounting.cash_payment.read`, `accounting.bank_receipt.read`, `accounting.bank_payment.read`, `reporting.invoice.branch.read`. Backend không đổi quyền. |
| Phạm vi chi nhánh | `GET /v2/cash-receipts/:id` … và `/reports/invoices/detail?id=` đều chỉ lọc theo `organizationId` ⇒ dòng của chi nhánh khác ở chế độ Chuỗi vẫn mở được. |
| Contract | Không đổi envelope; id hóa đơn đi trong khoá ẩn `REPORT_ROW_INVOICE_ID` (`_invoiceId`) sẵn có ⇒ không cần `openapi:generate`. |
| Test | Jest unit cho hai `*.report.ts` + e2e `cash-fund-report-list` / `-expenses` trên `erp_test`; backoffice-web không có test runner → `tsc --noEmit` + script `aidlc-verify` (Vite :3005 theo memory "Backoffice :3000 serves erp2"). |
| UI | Chuỗi tiếng Việt; không thêm component mới ngoài một wrapper chọn dialog. |

## Existing surface touched

- Reused components: `ReportPageTableView` (`runDrillDown`), `_lib/report-drilldown.ts`
  (`invoiceDetail` resolver), `store/page-stores/report/*`, `InvoiceDetailDialog` (báo cáo),
  `ReportDrillDownDialog`, `pages/treasury/documents/*VoucherDialog`,
  `pages/treasury/cash-vouchers.adapters.ts`, `hooks/treasury/use-{cash,bank}-{receipts,payments}.ts`,
  `hooks/usePermissionCheck.ts`.
- Adjacent features: `2026091802-cash-fund-reports` (5 báo cáo), `sales-report-km-and-drilldown`
  (registry drill-down + dialog hóa đơn), `transfer-summary-drilldown` (dialog lồng).
- Entry points: không route mới; thay đổi trong `/reports/cash-fund`.
