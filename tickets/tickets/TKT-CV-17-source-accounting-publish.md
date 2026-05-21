# TKT-CV-17 A-revised source accounting + publish needed (debt/GR/expense)

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only.

## Summary

Wire 3 source service để khi `paymentMethod=CASH`: trong cùng source TX gọi `CashService.recordMovement()` (balance + movement + JE atomic), rồi publish `needed.*` event mang `cashMovementId` + `journalEntryId`. Đây là phần "accounting đồng bộ ở source" của A-revised (xem EPIC sequence (f)/(g)/(h)).

## Deliverables

- **Debt collection** (`InvoiceDebtService.collectPayment()`): khi CASH → `recordMovement(DEPOSIT, contra=131, amount)` → `{movementId, jeId}`; UPDATE `debt_payments.journal_entry_id` + `invoice_debts.remainingAmount`; publish `needed.debt_payment`. DTO add `cashAccountId` (required khi CASH).
- **Goods receipt** (`GoodsReceiptService.post()`): khi CASH → `recordMovement(WITHDRAWAL, contra=inventoryAccountId, amount=total)` (insufficient → rollback toàn bộ post, 400); UPDATE `gr.journal_entry_id`; publish `needed.goods_receipt`. CREDIT → JE riêng (DR inventory / CR 331), không cash movement. DTO `CreateGoodsReceiptDto` add `paymentMethod` + `cashAccountId`.
- **Expense** (`ExpensesService.post()`): khi CASH → `recordMovement(WITHDRAWAL, contra=expense.accountId)` (insufficient → 400). PAYABLE/BANK → JE riêng. DTO `CreateExpenseDto` add `paymentMethod` + `cashAccountId`.

## Acceptance Criteria

- [x] Debt CASH: response time đã có `debt_payments.journal_entry_id` (JE DR cash / CR 131); balance tăng ngay (không chờ consumer); publish `needed.debt_payment` kèm movementId+jeId.
- [x] GR CASH: response có `goods_receipts.journal_entry_id` (DR inventory / CR cash) + balance giảm; publish `needed.goods_receipt`.
- [x] Expense CASH: response có `expenses.journal_entry_id` (DR expense / CR cash) + balance giảm; publish `needed.expense`.
- [x] **Insufficient balance đồng bộ**: GR/Expense CASH không đủ tiền → 400 ngay, source giữ DRAFT/APPROVED, KHÔNG movement/JE mồ côi, KHÔNG publish.
- [x] Non-CASH (CREDIT/PAYABLE/BANK): JE riêng đúng, không cash movement, không publish `needed.*`.
- [x] `contra_account_id` của GR CASH = inventory account derive trong service (không nhận từ client).
- [x] Verify không circular import `inventory`/`pos` → `accounting/cash` (forwardRef / shared token nếu cần — note trong PR).
- [x] `externalJournalEntryId` concept KHÔNG được dùng (recordMovement tự tạo JE).

## Definition of Done

- [x] Unit test mỗi source: CASH path (movement+JE+publish), insufficient → 400 + rollback (không movement/JE), non-CASH path (JE riêng, không publish).
- [x] DTO + Swagger cập nhật.
- [x] Source tiếng Anh.

## Tech Approach

- **1 LOCAL TX cho accounting**: source service mở TX, truyền `manager` xuống `recordMovement(dto, actor, manager)` (post-TKT-CV-00) để movement+JE+`UPDATE source`+`outbox.enqueue` cùng TX. `jeId` đẩy vào event lấy từ return mới `{ movement, journalEntryId }` (KHÔNG `findBySourceRef` thủ công).
- Inventory account derive từ cấu hình item/category; expense account từ `expense.accountId`.
- **Cảnh báo scope**: `GoodsReceiptService.post()` hiện KHÔNG tạo JE nào (chỉ stock movement); `ExpensesService.post()` hiện credit cash trong JE nhưng không tạo cash_movement / không update balance. Wiring CASH ở đây vừa là feature vừa là bugfix accounting — verify regression nhánh CREDIT/PAYABLE (xem epic refactor issue #8).

## Dependencies

- Phụ thuộc: **TKT-CV-00 (recordMovement nhận manager + trả jeId)**, TKT-CV-13 (cột mới), TKT-CV-14 (topics/payload), EPIC-009 (`recordMovement`).
- Blocks: TKT-CV-15 (consumer cần event), TKT-CV-18, TKT-CV-23, TKT-CV-OB3.
