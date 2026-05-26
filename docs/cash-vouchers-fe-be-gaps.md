# Chênh lệch FE ↔ BE — Quỹ tiền (Cập nhật 2026-05-26 PM2)

> 3 trang: **Thu chi tiền mặt** · **Kiểm kê tiền mặt** · **Sổ chi tiết tiền mặt**
> Latest BE commit: `e7d7b2d` · FE mapping: supplier-debt dialog wired, closingBalance rendered, transferAccountId wired

---

## Resolved (đã xử lý)

| ID | Màn | Mô tả | Cách xử lý | Commit |
|----|-----|-------|-------------|--------|
| RC-2 | Chi | Payment sub-options luôn map → `OTHER` | BE: `CashPaymentPurpose` giờ có `SUPPLIER_PAYMENT`, `PURCHASE`, `EXPENSE`, `SALARY`, `REFUND`. FE maps `detail.paymentPurpose` trực tiếp. | `e7d7b2d` |
| RC-4 | Chi | Supplier debt repayment API không có | BE: `GET /partners/suppliers-with-debt`, `GET /partners/supplier-debts`, `POST /cash-payments/supplier-debt-payment` (ACID saga). Entity `SupplierDebtEntity` + `SupplierDebtPaymentEntity`. | `e7d7b2d` |
| RC-7 | Thu/Chi | `counterpartyCode`, `employeeName` không snapshot | BE: `partnerNameSnapshot` + `partnerAddressSnapshot` frozen at post time trong cả Receipt + Payment service. | `e7d7b2d` |
| RC-8 | Thu/Chi | Post/Reverse buttons chưa hiển thị | FE: `useCashReceiptMutations().post/reverse`, `useCashPaymentMutations().post/reverse` đã wired. Debt-collection saga auto-posts. | `e7d7b2d` |
| BE-4 | Chi | Payment purpose enums thiếu | BE: Full enum set. `ReceivingAccountController` tại `GET /cash-vouchers/receiving-accounts` cung cấp bank/deposit accounts (112x). | `e7d7b2d` |
| BE-5 | KK | Cash count purpose + denomination description | BE: `cash_counts.purpose` (text), `denomination.description` (JSONB). DTOs accept cả hai. FE adapter maps đúng. Migration `1781500000001`. | `e7d7b2d` |
| CC-7 | KK | BE `post()` overwrite documentNumber | BE: `count.documentNumber \|\| generate()` — giữ FE-generated number. | `4a67053` |
| G5 | Thu/Chi | Đối tượng nộp / NV thu | `GET /cash-vouchers/partners?type=…` unified endpoint + React Query cache. | trước |
| G13 | Chung | cashAccountId picker | Auto-select két tiền đầu tiên (`cashAccounts?.[0]?.id`). | trước |
| G17 | Thu/Chi/KK | Số phiếu PT/PC/KKQ | Auto-generate via `useGenerateDocumentNumber`. | trước |
| G18 | Chi | Mục đích chi | Map `CashPaymentPurpose` enum trực tiếp từ BE. | trước |
| G19/G20 | Thu/Chi | Mục thu/chi (category) | Dropdown từ `/admin/entities/cash-voucher-categories/records`. `categoryId` UUID gửi BE. | trước |
| — | Thu | Debt Collection Saga | `POST /cash-receipts/debt-collection` — ACID saga: deposit ket → POSTED Phiếu thu → settle invoice debts. Idempotent via `X-Idempotency-Key`. | `4a67053` |
| — | Chi | Supplier Debt Payment Saga | `POST /cash-payments/supplier-debt-payment` — ACID saga: withdraw ket → POSTED Phiếu chi → settle supplier debts. | `e7d7b2d` |
| RC-3 | Chi | `transferAccountId` không gửi khi chọn Chuyển TM | FE: `PaymentVoucherDialog` truyền `transferAccountId` qua `buildPaymentDetailFromForm`. Body builder dùng `detail.transferAccountId \|\| contraAccountId`. | FE |
| RC-9 | Chi | FE `DebtRepaymentPickDialog` chưa wire | FE: `supplier-debt.api.ts` + `supplier-debt-search.ts` + `useSupplierOpenDebts` + `useSupplierDebtSearch`. Dialog gọi API thực. `TreasuryCashReceiptsPage` gọi saga `supplierDebtPayment`. | FE |
| LD-2 | Sổ | `closingBalance` FE chưa render | FE: `LedgerCashTable` render "Số dư cuối kỳ" footer row khi `closingBalance != null`. | FE |

---

## 1 — Thu chi tiền mặt (Receipts & Payments)

### 1.1 Chức năng

| # | Chức năng | Trạng thái |
|---|-----------|------------|
| 1 | List gộp Phiếu thu + Phiếu chi, lọc kỳ, column filter | ✅ Hoạt động |
| 2 | Tạo Phiếu thu (Khác) | ✅ |
| 3 | Tạo Phiếu thu — Thu nợ (Debt Collection saga) | ✅ ACID saga, auto-post, auto-settle |
| 4 | Tạo Phiếu chi (Khác / Chuyển TM→TG / Chuyển CH) | ✅ |
| 5 | Tạo Phiếu chi — Trả nợ NCC | ✅ BE saga + FE dialog wired |
| 6 | Xem / Sửa / Xóa phiếu (chỉ DRAFT) | ✅ |
| 7 | Nhân bản phiếu | ✅ |
| 8 | Xem phiếu nhập hàng (GoodsReceiptPaymentDialog) | ✅ Read-only |
| 9 | Auto-generate số phiếu (PT/PC) | ✅ |
| 10 | Mục thu / Mục chi (categoryId → BE) | ✅ |
| 11 | Chứng từ ref hiển thị tất cả INV từ documentLines | ✅ |
| 12 | Drill-down Invoice (xem chi tiết HĐ) | ⛔ Mock — cần `GET /invoices?code=` |
| 13 | Post / Reverse phiếu | ✅ Hook wired, saga auto-posts |
| 14 | Tải tệp đính kèm | ⛔ Stub |

### 1.2 API Endpoints

| Method | Path | Hook / Function | Ghi chú |
|--------|------|-----------------|---------|
| GET | `/cash-receipts` | `useCashReceiptsList` | pageSize=100 client merge |
| GET | `/cash-receipts/{id}` | `useCashReceipt` | Drill-down detail |
| POST | `/cash-receipts` | `mutations.create` | |
| PATCH | `/cash-receipts/{id}` | `mutations.update` | `documentNumber` stripped |
| DELETE | `/cash-receipts/{id}` | `mutations.remove` | |
| POST | `/cash-receipts/debt-collection` | `mutations.debtCollection` | ACID saga — idempotent |
| GET | `/cash-receipts/debt-collection/sagas/{id}` | — | Read saga state |
| GET | `/cash-payments` | `useCashPaymentsList` | pageSize=100 client merge |
| GET | `/cash-payments/{id}` | `useCashPayment` | |
| POST | `/cash-payments` | `mutations.create` | |
| PATCH | `/cash-payments/{id}` | `mutations.update` | `documentNumber` stripped |
| DELETE | `/cash-payments/{id}` | `mutations.remove` | |
| POST | `/cash-payments/supplier-debt-payment` | `mutations.supplierDebtPayment` | ACID saga — idempotent |
| GET | `/cash-payments/supplier-debt-payment/sagas/{id}` | — | Read saga state |
| GET | `/cash-vouchers/partners` | `usePartnerSearch` | Unified partner search |
| GET | `/cash-vouchers/partners/customers-with-debt` | `useDebtCollectionSearch` | |
| GET | `/cash-vouchers/partners/debts` | `useCustomerOpenDebts` | |
| GET | `/cash-vouchers/partners/suppliers-with-debt` | `useSupplierDebtSearch` | NCC có nợ |
| GET | `/cash-vouchers/partners/supplier-debts` | `useSupplierOpenDebts` | Công nợ NCC |
| GET | `/cash-vouchers/receiving-accounts` | `usePaymentAccounts` | Bank/deposit accounts (112x) |
| GET | `/admin/entities/cash-voucher-categories/records` | `useCashVoucherCategories` | direction=IN/OUT |
| POST | `/document-numbers/generate` | `useGenerateDocumentNumber` | PT / PC |

### 1.3 FE/BE Gaps (còn lại)

| ID | Vấn đề | Fix ở | Approach |
|----|--------|-------|----------|
| RC-1 | `countAsRevenue` / `countAsExpense` checkbox không gửi BE | **BE** | Thêm `countAsRevenue: boolean` vào `CreateCashReceiptDto`, `countAsExpense` vào Payment DTO |
| RC-5 | Invoice detail cần API by code | **BE** | Thêm `code` filter vào `InvoiceQueryDto` hoặc `GET /invoices/by-code/:code` |
| RC-6 | Client-side 200-record cap (100 PT + 100 PC) | **BE** | Endpoint gộp `GET /cash-vouchers?type=all` với server-side pagination |

---

## 2 — Kiểm kê tiền mặt (Cash Count)

### 2.1 Chức năng

| # | Chức năng | Trạng thái |
|---|-----------|------------|
| 1 | List kiểm kê, lọc kỳ, column filter | ✅ |
| 2 | Tạo phiếu kiểm kê (auto doc number KKQ) | ✅ |
| 3 | Sửa phiếu (chỉ UNPROCESSED) | ✅ |
| 4 | Xử lý (Post) — snapshot balance, tạo phiếu thu/chi chênh lệch | ✅ |
| 5 | Xóa phiếu | ⛔ Toast placeholder — entity có `@DeleteDateColumn` nhưng BE chưa expose endpoint |
| 6 | Denomination lines (9 mệnh giá VND) | ✅ |
| 7 | Diễn giải từng dòng denomination | ✅ `description` persist BE |
| 8 | Mục đích kiểm kê | ✅ `purpose` persist BE |
| 9 | Kết luận | ✅ Map → BE `notes` |
| 10 | Thành viên kiểm kê | ⚠️ localStorage only — không persist BE |
| 11 | Số dư + Chênh lệch | ✅ `accountBalance` prop + `expectedAmount` snapshot |
| 12 | Giờ kiểm kê default = current time | ✅ |
| 13 | Tải tệp đính kèm | ⛔ Stub |

### 2.2 API Endpoints

| Method | Path | Hook / Function | Ghi chú |
|--------|------|-----------------|---------|
| GET | `/cash-counts` | `useCashCountsList` | pageSize=100 client filter |
| GET | `/cash-counts/{id}` | `useCashCount` | |
| POST | `/cash-counts` | `mutations.create` | Gửi documentNumber, purpose, denomination.description |
| PATCH | `/cash-counts/{id}` | `mutations.update` | Strip cashAccountId + documentNumber |
| POST | `/cash-counts/{id}/post` | `mutations.post` | Giữ documentNumber, snapshot expectedAmount, auto variance voucher |
| POST | `/document-numbers/generate` | `useGenerateDocumentNumber` | CASH_COUNT |

### 2.3 FE/BE Gaps (còn lại)

| ID | Vấn đề | Fix ở | Approach |
|----|--------|-------|----------|
| CC-1 | Không có DELETE endpoint | **BE** | `DELETE /cash-counts/:id` soft-delete DRAFT only (entity đã có `@DeleteDateColumn`) |
| CC-2 | `inventoryUntilDate` không persist BE | **BE** | Thêm column `inventory_until_date` vào entity + DTO |
| CC-3 | Thành viên chỉ lưu localStorage | **BE** | Thêm `participants` JSONB column hoặc relation table |
| CC-5 | `reference` field luôn undefined | **Cả hai** | BE populate reference hoặc FE bỏ field |
| CC-6 | Client-side 100-record cap | **BE** | Server-side date filter + pagination |

---

## 3 — Sổ chi tiết tiền mặt (Cash Ledger)

### 3.1 Chức năng

| # | Chức năng | Trạng thái |
|---|-----------|------------|
| 1 | Bảng sổ chi tiết + số dư đầu kỳ + tổng thu/chi | ✅ |
| 2 | Lọc kỳ (period filter) | ✅ |
| 3 | Phân trang server-side | ✅ |
| 4 | Drill-down Phiếu thu (PT) | ✅ |
| 5 | Drill-down Phiếu chi (PC) | ✅ |
| 6 | Drill-down Invoice (HĐ bán hàng) | ⛔ Mock data |
| 7 | Số dư cuối kỳ | ✅ Footer "Số dư cuối kỳ" rendered from BE `closingBalance` |
| 8 | Xuất khẩu | ⛔ Stub toast |

### 3.2 API Endpoints

| Method | Path | Hook / Function | Ghi chú |
|--------|------|-----------------|---------|
| GET | `/cash-ledger` | `useCashLedgerOffsetPage` | dateFrom, dateTo, page, pageSize, closingBalance |
| GET | `/cash-receipts/{id}` | `useCashReceipt` | Drill-down PT |
| GET | `/cash-payments/{id}` | `useCashPayment` | Drill-down PC |
| GET | `/admin/entities/cash-voucher-categories/records` | `useCategoryNameMap` | Map categoryId → name |

### 3.3 FE/BE Gaps (còn lại)

| ID | Vấn đề | Fix ở | Approach |
|----|--------|-------|----------|
| LD-1 | Invoice drill-down dùng mock data | **BE** | Cần `GET /invoices?code=` hoặc `/invoices/by-code/:code` (= RC-5) |
| LD-3 | `employee` field luôn rỗng | **BE** | Thêm staffName/staffCode vào `CashLedgerRow` response |
| LD-4 | Mock data file 500+ dòng còn trong bundle | **FE** | Xóa `mock-ledger-cash.ts` khi invoice API sẵn sàng |
| LD-5 | Xuất khẩu chưa implement | **Cả hai** | BE: export endpoint; FE: download file |

---

## Next Steps — Ưu tiên

### BE (cần làm)

| # | Task | Ưu tiên | Liên quan |
|---|------|---------|-----------|
| BE-1 | `DELETE /cash-counts/:id` soft-delete DRAFT | P1 | CC-1 |
| BE-2 | Invoice lookup by code (`GET /invoices?code=`) | P2 | RC-5, LD-1 |
| BE-3 | `inventoryUntilDate`, `participants` JSONB cho cash count | P2 | CC-2, CC-3 |
| BE-4 | Staff name trong `CashLedgerRow` response | P3 | LD-3 |
| BE-5 | Merged voucher list endpoint hoặc tăng pageSize | P3 | RC-6, CC-6 |
| BE-6 | `countAsRevenue`/`countAsExpense` trên receipt/payment DTO | P3 | RC-1 |

### FE — Đã hoàn thành

| # | Task | Liên quan |
|---|------|-----------|
| ~~FE-1~~ | ✅ Wire `DebtRepaymentPickDialog` với BE supplier-debt API — `supplier-debt.api.ts`, `supplier-debt-search.ts`, `useSupplierOpenDebts`, `useSupplierDebtSearch`, saga mutation `supplierDebtPayment` | RC-9 |
| ~~FE-2~~ | ✅ Render `closingBalance` ở footer sổ chi tiết — `LedgerCashTable` footer row "Số dư cuối kỳ" | LD-2 |
| ~~FE-3~~ | ✅ Wire `transferAccountId` → `contraAccountId` — `PaymentVoucherDialog` truyền `transferAccountId` qua `buildPaymentDetailFromForm`, body builder ưu tiên `detail.transferAccountId` | RC-3 |

### FE — Còn lại (phụ thuộc BE)

| # | Task | Ưu tiên | Liên quan |
|---|------|---------|-----------|
| FE-4 | Xóa mock-ledger-cash.ts khi BE-2 xong | P3 | LD-4 |
| FE-5 | Wire `countAsRevenue`/`countAsExpense` vào body builder (sau khi BE-6) | P3 | RC-1 |

---

## QA Checklist

### Thu chi tiền mặt

- [ ] Tạo Phiếu thu (Khác) → lưu → xem lại → category hiển thị đúng
- [ ] Tạo Phiếu thu (Thu nợ) → chọn HĐ → saga tạo + post → nợ KH giảm
- [ ] Reverse Phiếu thu thu nợ → nợ KH mở lại (saga compensate)
- [ ] Sửa Phiếu thu → `documentNumber` không gửi update payload
- [ ] Tạo Phiếu chi (Chi khác) → lưu → category hiển thị đúng
- [ ] Tạo Phiếu chi (Trả nợ NCC) → saga tạo + post → nợ NCC giảm
- [ ] Reverse Phiếu chi trả nợ NCC → nợ NCC mở lại
- [ ] Tạo Phiếu chi (Chuyển TM→TG) → "Tài khoản Thu" dropdown hiển thị
- [ ] Tạo Phiếu chi (Chuyển CH) → tương tự
- [ ] Nhân bản phiếu → số phiếu mới, dữ liệu copy
- [ ] Xóa phiếu DRAFT → thành công
- [ ] Chứng từ ref hiển thị tất cả mã INV (flex, line-clamp)
- [ ] Partner name snapshot đúng sau post

### Kiểm kê tiền mặt

- [ ] Tạo KKQ → doc number auto-generate, giờ = current
- [ ] Nhập denomination → actualAmount tính đúng
- [ ] Mục đích (`purpose`) lưu đúng xuống BE
- [ ] Diễn giải dòng (`description`) lưu đúng xuống BE
- [ ] Số dư sổ quỹ hiển thị (accountBalance prop → expectedAmount)
- [ ] Chênh lệch = Thực tế − Số dư
- [ ] Sửa KKQ → lưu → purpose + denomination description persist
- [ ] Xử lý KKQ → documentNumber giữ nguyên từ create
- [ ] Xử lý KKQ thừa → tạo phiếu thu (711)
- [ ] Xử lý KKQ thiếu → tạo phiếu chi (811)

### Sổ chi tiết tiền mặt

- [ ] Số dư đầu kỳ hiển thị đúng (page 1)
- [ ] Tổng thu / tổng chi ở footer
- [ ] Số dư cuối kỳ hiển thị đúng ở footer table
- [ ] Click PT → mở ReceiptVoucherDialog VIEW
- [ ] Click PC → mở PaymentVoucherDialog VIEW
- [ ] Phân trang server-side hoạt động
- [ ] Lọc kỳ → "Nạp dữ liệu" → data cập nhật

---

## FE Files Reference

| Thành phần | File |
|------------|------|
| Page Thu chi | `cash/receipts-expenses/TreasuryCashReceiptsPage.tsx` |
| Phiếu thu dialog | `documents/receipt-voucher-dialog/ReceiptVoucherDialog.tsx` |
| Phiếu chi dialog | `documents/payment-voucher-dialog/PaymentVoucherDialog.tsx` |
| Dialog thu nợ KH | `documents/receipt-voucher-dialog/DebtCollectionPickDialog.tsx` |
| Dialog trả nợ NCC | `documents/payment-voucher-dialog/DebtRepaymentPickDialog.tsx` |
| Supplier debt API | `documents/payment-voucher-dialog/supplier-debt.api.ts` |
| Supplier debt search | `documents/payment-voucher-dialog/supplier-debt-search.ts` |
| Phiếu nhập hàng dialog | `documents/goods-receipt-payment-dialog/GoodsReceiptPaymentDialog.tsx` |
| Page Kiểm kê | `cash/cash-count/TreasuryCashCountPage.tsx` |
| Kiểm kê dialog | `cash/cash-count/CashCountFormDialog.tsx` |
| Kiểm kê adapter | `cash/cash-count/cash-count.api-adapter.ts` |
| Page Sổ chi tiết | `ledger-cash/LedgerCashPage.tsx` |
| Sổ table + columns | `ledger-cash/components/ledger/LedgerCashTable.tsx` |
| Body builders | `cash-vouchers.api-body.ts` |
| Adapters (BE→FE) | `cash-vouchers.adapters.ts` |
| Types | `cash-vouchers.types.ts`, `ledger-cash/ledger-cash.types.ts` |
| Constants | `documents/_shared/voucher-dialog.constants.ts` |
| Partner search | `documents/_shared/voucher-partner-search.ts` |
| Hooks | `hooks/treasury/use-cash-receipts.ts`, `use-cash-payments.ts`, `use-cash-counts.ts`, `use-cash-ledger.ts` |
| Query keys | `hooks/treasury/treasury-query-keys.ts` |
| Doc numbering | `hooks/document-numbering/useGenerateDocumentNumber.ts` |
| Payment accounts | `hooks/treasury/use-payment-accounts.ts` |
| Categories | `hooks/treasury/use-cash-voucher-categories.ts` |

## BE Files Reference (new)

| Thành phần | File |
|------------|------|
| Debt collection saga | `cash-vouchers/debt-collection/debt-collection-saga.service.ts` |
| Debt collection controller | `cash-vouchers/debt-collection/debt-collection.controller.ts` |
| Debt collection entity | `cash-vouchers/debt-collection/debt-collection-saga.entity.ts` |
| Supplier debt payment saga | `cash-vouchers/supplier-debt-payment/supplier-debt-payment-saga.service.ts` |
| Supplier debt payment controller | `cash-vouchers/supplier-debt-payment/supplier-debt-payment.controller.ts` |
| Supplier debt payment entity | `cash-vouchers/supplier-debt-payment/supplier-debt-payment-saga.entity.ts` |
| Partner lookup (debts) | `cash-vouchers/shared/partner-lookup.controller.ts`, `partner-lookup.service.ts` |
| Receiving accounts | `cash-vouchers/shared/receiving-account.controller.ts` |
| Supplier debt entity | `inventory/supplier-debt/supplier-debt.entity.ts` |
| Supplier debt payment entity | `inventory/supplier-debt/supplier-debt-payment.entity.ts` |
| Enums | `cash-vouchers/enums.ts` |
| Payables (cash settle) | `accounting/payables/payables.service.ts` |
| Receivables (cash collect) | `accounting/receivables/receivables.service.ts` |
