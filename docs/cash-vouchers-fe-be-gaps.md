# Chênh lệch BE ↔ FE — Quỹ tiền

> Epic BE: EPIC-18052026. Cập nhật: 2026-05-25 (PM).
> BE đã bổ sung `PartnerLookupController`, cash-ledger offset pagination, payment `source` filter, `documentNumber` on CreateCashCountDto.
> FE: enum consolidation (`PartnerLookupType`), React Query cache, auto document numbering (PT/PC/KKQ), payment purpose mapping, debt repayment placeholder, auto-select két tiền, cash count dialog refactor (always-mounted, open prop).

## Resolved (đã xử lý)

| ID | Màn | FE / UI | Cách xử lý | Ngày |
|----|-----|---------|-------------|------|
| G5 | Thu/chi | Đối tượng nộp / NV thu | `GET /cash-vouchers/partners?type=…` thay 3 API gộp. FE dùng unified endpoint + React Query cache. | 2026-05-25 |
| G11 | Sổ | Offset pages | BE trả `page`/`pageSize`; FE `useCashLedgerOffsetPage` khớp BE. | 2026-05-25 |
| G13 | Chung | cashAccountId picker | Auto-select két tiền đầu tiên (`cashAccounts?.[0]?.id`). Bỏ `CashAccountSelect` khỏi UI. | 2026-05-25 |
| G14 | Thu/chi | Lookup đối tượng | `GET /cash-vouchers/partners` thay by-kind 3-API merge. | 2026-05-25 |
| G17 | Thu/chi/KK | Số phiếu thu/chi/KK | Auto-generate via `useGenerateDocumentNumber` (`DocumentType.CASH_RECEIPT` / `CASH_PAYMENT` / `CASH_COUNT`). Required field. `documentNumber` gửi qua BE create DTO. | 2026-05-25 |
| G18 | Chi | Mục đích chi | Map `CashPaymentPurpose` enum trực tiếp từ BE. Radio "Khác" (sub-select) / "Trả nợ". | 2026-05-25 |
| G19 | Chi | Mục chi (category) | Dropdown từ `GET /admin/entities/cash-voucher-categories/records?direction=OUT`. | 2026-05-25 |
| G20 | Thu | Mục thu (category) | Dropdown từ `GET /admin/entities/cash-voucher-categories/records?direction=IN`. | 2026-05-25 |

## Partially resolved (FE đã cập nhật, BE backlog)

| ID | Màn | FE / UI | BE hiện có | Xử lý FE | BE (backlog) |
|----|-----|---------|------------|----------|--------------|
| G3 | Thu | Tab **Chứng từ** (thu nợ): `documentLines` từ dialog chọn HĐ | `GET /cash-vouchers/partners/debts` trả công nợ mở; `GET :id` không trả documentLines | **Done:** khi VIEW phiếu thu `DEBT_COLLECTION` → auto-fetch debts từ `/cash-vouchers/partners/debts` | Embed `documentLines` / debt allocations on receipt DTO |
| G15 | Chi | **Trả nợ NCC** — dialog chọn HĐ trả nợ nhà cung cấp | Không có API supplier debts (`suppliers-with-debt`, `supplier-debts`) | Placeholder UI: `DebtRepaymentPickDialog` — lookup NCC, "Lấy dữ liệu" → toast "API trả nợ NCC chưa sẵn sàng" | `GET /cash-vouchers/partners/suppliers-with-debt`, `GET /cash-vouchers/partners/supplier-debts` |
| G16 | Thu | Lưu phiếu thu thu nợ nhiều HĐ (`debtId`, `collectAmount` / dòng) | `CreateCashReceiptDto`: 1 `referenceType`/`referenceId`, không `documentLines` | FE gửi 1 dòng Chi tiết tổng hợp + lưu local | Multi-debt lines / allocations on POST |

## Still open (không thay đổi BE)

| ID | Màn | FE / UI | BE hiện có | Xử lý FE |
|----|-----|---------|------------|----------|
| G1 | Thu/chi | List gộp PT+PC | 2 endpoint riêng | FE merge client + type union |
| G2 | Thu/chi | List embed `lines` | List không lines | `GET :id` on select |
| G4 | Thu/chi | Modal HĐ full SKU | `sourceLink` minimal | Tạm dừng — cần `GET /invoices/by-code/:code` BE |
| G6 | Kiểm kê | Tab Thành viên | — | Local-only UI (localStorage) |
| G8 | Kiểm kê | Denom `description` | `denom`+`count` only | UI-only column |
| G10 | Kiểm kê | Lọc kỳ server | No dateFrom/To query | Client filter |
| G12 | Sổ | Dòng HĐ trực tiếp | Movement-based | Chỉ qua phiếu |

## BE backlog — Cần bổ sung

| # | Mô tả | Ưu tiên |
|---|-------|---------|
| BE-1 | `DELETE /cash-counts/:id` — soft-delete DRAFT cash counts (entity đã có `@DeleteDateColumn`). FE: nút Xóa đã có nhưng hiện toast placeholder. | P1 |
| BE-2 | Thêm cột `purpose` vào `cash_counts` entity (tách khỏi `notes`/`conclusion`). FE form có 2 field riêng "Mục đích" và "Kết luận" nhưng BE chỉ có `notes`. | P2 |
| BE-3 | Thêm `description` vào `DenominationDto` jsonb (`{denom, count, description}`). FE column "Diễn giải" hiện UI-only, không lưu xuống BE. | P2 |
| BE-4 | `GET /cash-vouchers/partners/suppliers-with-debt` + `GET /cash-vouchers/partners/supplier-debts` — trả nợ NCC (G15). | P1 |
| BE-5 | Multi-debt allocations on `POST /cash-receipts` (G16). | P2 |
| BE-6 | `GET /invoices/by-code/:code` — modal hóa đơn SKU (G4). | P3 |

**Không ghi gap:** nhân bản phiếu, label VN, column filter client-side, OpenAPI regen.

### FE files — Tham chiếu chính

| Thành phần | File |
|------------|------|
| Phiếu thu + tab Chi tiết / Chứng từ | `documents/receipt-voucher-dialog/ReceiptVoucherDialog.tsx` |
| Dialog chọn HĐ thu nợ | `documents/receipt-voucher-dialog/DebtCollectionPickDialog.tsx` |
| Phiếu chi + radio Khác/Trả nợ | `documents/payment-voucher-dialog/PaymentVoucherDialog.tsx` |
| Dialog chọn HĐ trả nợ NCC (placeholder) | `documents/payment-voucher-dialog/DebtRepaymentPickDialog.tsx` |
| API công nợ mở (qua BE mới) | `documents/receipt-voucher-dialog/debt-collection.api.ts` |
| Lookup KH có nợ (BE mới) | `documents/receipt-voucher-dialog/debt-collection-search.ts` |
| Tra cứu đối tượng (unified + React Query) | `documents/_shared/voucher-partner-search.ts` |
| Modal chọn đối tượng (loại) | `documents/_shared/VoucherEntitySearchModal.tsx` |
| Constants + enums | `documents/_shared/voucher-dialog.constants.ts`, `voucher-partner.constants.ts` |
| Auto document number | `hooks/document-numbering/useGenerateDocumentNumber.ts` |
| React Query keys (treasury) | `hooks/treasury/treasury-query-keys.ts` |
| Body builders (create receipt/payment) | `cash-vouchers.api-body.ts` |
| Adapters (BE → FE detail) | `cash-vouchers.adapters.ts` |
| Kiểm kê dialog (always-mounted, open prop) | `cash/cash-count/CashCountFormDialog.tsx` |
| Kiểm kê page + save/process | `cash/cash-count/TreasuryCashCountPage.tsx` |
| Kiểm kê API adapter | `cash/cash-count/cash-count.api-adapter.ts` |
| Kiểm kê denomination columns | `cash/cash-count/useCashCountDenominationColumns.tsx` |
