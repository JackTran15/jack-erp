# Cash vouchers: Category mô tả · Saga thu hồi nợ · Kiểm kê két · Auto Phiếu Thu/Chi

Branch: `EPIC-18052026-pick-ERP11-r`

Tài liệu mô tả thay đổi cho commit/PR. Gồm 3 hạng mục theo yêu cầu + 3 gap "tự động sinh Phiếu Thu/Chi".

---

## 1. Tóm tắt

| #      | Hạng mục                                                                | Trạng thái |
| ------ | ----------------------------------------------------------------------- | ---------- |
| 1      | Category (Phiếu Thu/Chi): thêm `description` + admin CRUD               | ✅          |
| 2      | Thu hồi nợ theo **saga** (ACID + saga-state): gạch nợ từng HĐ + vào két | ✅          |
| 3      | Kiểm kê **tiền mặt (két)**: lưu mục đích + diễn giải/dòng + số dư thật  | ✅          |
| Gap #1 | Hoàn tiền trả hàng (refund) → **Phiếu Chi**                             | ✅          |
| Gap #2 | Thu phải thu (Receivable) tiền mặt → **Phiếu Thu** + két                | ✅          |
| Gap #3 | Trả nợ NCC (Payable) tiền mặt → **Phiếu Chi** + két                     | ✅          |

---

## 2. Finished flows — coverage Phiếu Thu/Chi (sau thay đổi)

| Nghiệp vụ tiền mặt                     | Voucher       | Cơ chế                                                                |
| -------------------------------------- | ------------- | --------------------------------------------------------------------- |
| Bán hàng POS thu tiền mặt              | Phiếu Thu     | `PosCashSaleConsumer`                                                 |
| Thu hồi nợ KH (tiền mặt)               | Phiếu Thu     | **saga mới** + `DebtCollectionCashConsumer` (legacy `collectPayment`) |
| Nhập hàng trả tiền mặt                 | Phiếu Chi     | `GoodsReceiptCashConsumer`                                            |
| Chi phí trả tiền mặt                   | Phiếu Chi     | `ExpenseCashConsumer`                                                 |
| Kiểm kê quỹ lệch thừa/thiếu            | Phiếu Thu/Chi | `CashCountsService.post`                                              |
| **Hoàn tiền trả/đổi hàng**             | Phiếu Chi     | **`RefundCashConsumer` (mới)**                                        |
| **Thu phải thu (Receivable) tiền mặt** | Phiếu Thu     | **`receivables.service.collect` (mới)**                               |
| **Trả nợ NCC (Payable) tiền mặt**      | Phiếu Chi     | **`payables.service.settle` (mới)**                                   |

Còn lại (chưa tự động — thủ công, ngoài phạm vi): Chi lương (`SALARY`), `POST /cash/movements` (điều chỉnh kỹ thuật). Nhánh **non-cash** (bank/cheque) của Receivable/Payable vẫn chỉ post JE (xem mục TODO).

---

## 3. Chi tiết thay đổi

### 3.1 Category — thêm `description`
- `cash-voucher-category.entity.ts`: cột `description varchar(500)` (nullable).
- `cash-voucher-categories.service.ts`: thêm field `description` vào `CRUD config` → hiển thị ở `/admin/cash-voucher-categories`.
- Migration `1781500000000-AddDescriptionToCashVoucherCategories`.

### 3.2 Thu hồi nợ — Saga ACID + saga-state
- Entity `cash_debt_collection_saga` + enum `DebtCollectionSagaStatus` (PENDING/COMPLETED/COMPENSATED/FAILED), unique `(org, idempotency_key)`.
- `DebtCollectionSagaService.collect`: **1 transaction** → `recordMovement(DEPOSIT, contra=131)` (vào két, JE DR 1111/CR 131) → Phiếu Thu POSTED → gạch từng `invoice_debt` (giảm remaining, `PAID` khi hết) + `debt_payment` link voucher. Idempotent theo `X-Idempotency-Key`.
- Compensation: `CashReceiptsService.reverse` → khi `referenceType=INVOICE_DEBT` gọi `saga.compensate()` mở lại các hóa đơn nợ + trừ két (qua reversal).
- Endpoint: `POST /cash-receipts/debt-collection`, `GET /cash-receipts/debt-collection/sagas/:id`.
- FE: `ledgerDetailToDebtCollectionBody` (documentLines → allocations) + mutation `debtCollection` + nhánh trong `TreasuryCashReceiptsPage`.
- Migration `1781500000002-AddDebtCollectionSaga`.

### 3.3 Kiểm kê tiền mặt (két)
- BE: cột `cash_counts.purpose`; denomination jsonb thêm `description`; DTO/service lưu cả hai.
- FE: bỏ `mockBookBalanceForDate` → hiển thị **số dư két thật** (`accountBalance` từ `useCashAccount`, hoặc `expectedAmount` snapshot khi đã xử lý); adapter map `purpose` + diễn giải từng mệnh giá; sửa copy nút "Xử lý".
- Migration `1781500000001-AddPurposeToCashCounts` (denomination.description nằm trong jsonb — không migrate).

### 3.4 Gap #1 — Hoàn tiền trả hàng → Phiếu Chi
- `RefundCashConsumer` (mới, trong cash-vouchers) consume `CASH_REFUND`: 1 transaction → `WITHDRAWAL` (trừ két) + `createVoucherForMovement` Phiếu Chi (`purpose/referenceType=REFUND`, `referenceId=returnInvoiceId`). Dedupe bằng movement reference.
- Gỡ `CashRefundConsumer` cũ khỏi `CashModule` + **xoá file** (tránh CashModule↔CashVouchers circular; consumer mới ở cash-vouchers có sẵn `CashService` + `CashPaymentsService`).

### 3.5 Gap #2 — Receivable thu tiền mặt → Phiếu Thu + két
- `receivables.service.collect`: `method=CASH` → `recordMovement(DEPOSIT, contra=receivable.accountId)` + Phiếu Thu (`referenceType=RECEIVABLE`, `referenceId=settlement.id`, partner=CUSTOMER). Non-cash giữ JE-only.

### 3.6 Gap #3 — Payable trả tiền mặt → Phiếu Chi + két
- `payables.service.settle`: `method=CASH` → `recordMovement(WITHDRAWAL, contra=payable.accountId)` + Phiếu Chi (`purpose=SUPPLIER_PAYMENT`, `referenceType=MANUAL`, `payeeName=vendorName`). Non-cash giữ JE-only.
- Wire `CashModule` + `CashVouchersModule` vào `ReceivablesModule`/`PayablesModule`; export `CashVoucherCategoryResolverService`.

---

## 4. API mới
- `POST /cash-receipts/debt-collection` — body `{ voucherDate, partnerType?, partnerId?, payerName?, reason?, staffId?, cashAccountId?, allocations:[{invoiceDebtId, amount}] }`; header `X-Idempotency-Key`.
- `GET /cash-receipts/debt-collection/sagas/:id` — trạng thái saga.

> ⚠️ Endpoint này tiêu thụ qua **axios** ở FE (chưa nằm trong OpenAPI client). Cash-count dùng hand-type + path có sẵn.

---

## 5. Migrations (hand-written)
| File                                                  | Nội dung                                           |
| ----------------------------------------------------- | -------------------------------------------------- |
| `1781500000000-AddDescriptionToCashVoucherCategories` | `cash_voucher_categories.description varchar(500)` |
| `1781500000001-AddPurposeToCashCounts`                | `cash_counts.purpose text`                         |
| `1781500000002-AddDebtCollectionSaga`                 | enum + bảng `cash_debt_collection_saga` + indexes  |

Gap #1/#2/#3 **không có migration** (tái dùng enum value `REFUND`/`RECEIVABLE`/`MANUAL`).

---

## 6. Files changed
**Backend — new**
- `migrations/1781500000000…`, `…001`, `…002`
- `cash-vouchers/debt-collection/{debt-collection-saga.entity, .service, .controller, .service.spec, dto/create-debt-collection-receipt.dto}.ts`
- `cash-vouchers/cash-voucher-consumers/refund-cash.consumer.ts`

**Backend — modified**
- `cash-vouchers/enums.ts`, `cash-vouchers.module.ts`
- `cash-vouchers/cash-voucher-categories/{entity, service}.ts`
- `cash-vouchers/cash-counts/{cash-count.entity, cash-counts.service, dto/create, dto/update, dto/denomination}.ts`
- `cash-vouchers/cash-receipts/{cash-receipts.service, .service.spec}.ts`
- `cash/cash.module.ts`
- `receivables/{receivables.service, receivables.module}.ts`
- `payables/{payables.service, payables.module}.ts`

**Backend — deleted**
- `accounting/consumers/cash-refund.consumer.ts`

**Frontend (backoffice-web)**
- `hooks/treasury/use-cash-receipts.ts`
- `pages/treasury/{cash-vouchers.api-body, cash-vouchers.types}.ts`
- `pages/treasury/cash/cash-count/{CashCountFormDialog, TreasuryCashCountPage, cash-count.api-adapter}.tsx?`
- `pages/treasury/cash/receipts-expenses/TreasuryCashReceiptsPage.tsx`

---

## 7. Đã verify
- `tsc --noEmit`: API ✅, backoffice-web ✅.
- Unit tests: **97 pass** (accounting + cash-vouchers + saga + pos debt + consumers). Saga có spec riêng (full settle / over-collect).
- Không circular dependency (ReceivablesModule/PayablesModule → CashVouchersModule → CashModule, một chiều).

---

## 8. TODO trước/khi merge (cần hạ tầng — Postgres :5433 hiện tắt ở môi trường dev)
- [ ] `docker compose up -d`
- [ ] `pnpm migration:run` (áp 3 migration mới)
- [ ] (tùy chọn) `make dev-api` + `pnpm openapi:generate` → commit `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` (đồng bộ client; **không bắt buộc** để chạy).
- [ ] Manual test (mục 9).

### Tùy chọn / theo dõi sau (ngoài phạm vi đã yêu cầu)
- [ ] Non-cash JE của Receivable/Payable đang DR/CR **cùng `accountId`** (lỗi sẵn có) — cần TK tiền gửi NH để CR đúng nếu muốn fix.
- [ ] Refund Phiếu Chi chưa gắn `partnerId` khách (payload `CASH_REFUND` không mang `customerId`) — thêm vào payload + publisher nếu cần hiển thị đối tượng.

---

## 9. Manual test checklist
- [ ] **Thu nợ**: tạo Phiếu Thu mục đích "Thu nợ" → chọn HĐ + số thu = full → Lưu ⇒ danh sách nợ KH hết báo nợ, ledger két tăng đúng. Reverse phiếu ⇒ nợ mở lại + két hoàn.
- [ ] **Kiểm kê két**: chọn két (vd 3.700.000), nhập 3.800.000 ⇒ "Số dư theo quỹ" = **3.700.000 thật** (không mock), chênh lệch +10.000 → "Xử lý" sinh Phiếu Thu 10.000, két=3.800.000. Mục đích + diễn giải/mệnh giá lưu & hiện lại sau reload.
- [ ] **Hoàn tiền**: trả hàng hoàn tiền mặt ⇒ Phiếu Chi tự sinh + két giảm.
- [ ] **Receivable**: `POST /receivables/:id/collect` `method=CASH` ⇒ Phiếu Thu + két tăng. (`method=BANK_TRANSFER` ⇒ chỉ JE.)
- [ ] **Payable**: `POST /payables/:id/settle` `method=CASH` ⇒ Phiếu Chi + két giảm.
- [ ] **Category**: `/admin/cash-voucher-categories` thấy cột & input "Mô tả".

---

## 10. Gợi ý commit message
```
feat(cash-vouchers): debt-collection saga, cash-count fixes, category description + auto Phiếu Thu/Chi for refund/receivable/payable

- Category: add description column + admin CRUD field
- Debt collection: ACID saga (settle invoice_debts + credit cash + compensation) via POST /cash-receipts/debt-collection
- Cash count (két): persist purpose + per-denomination description; show real fund balance (drop mock)
- Auto Phiếu Thu/Chi for: POS return refund, receivable cash collect, payable cash settle
- 3 migrations; reuse existing reference-type enums; 97 unit tests pass
```
