# EPIC-21052026 Cash Vouchers — Follow-up Refactor (Backend-only)

> **Scope: chỉ BACKEND.** Epic này gom các scope-item phát hiện khi review lại [EPIC-18052026](./EPIC-18052026-cash-vouchers.md) (issue #7–#11). Đây là **hardening / sửa semantic kế toán**, không phải feature mới — tách riêng để không phình epic gốc, ưu tiên làm **sau** khi Phase 2 của EPIC-18052026 ổn định.

## Summary

Khi đối chiếu plan EPIC-18052026 với code thực tế, ngoài 6 blocker/factual đã vá ngay trong epic gốc (TKT-CV-00 + sửa ledger/DocumentType/table-name), còn 5 vấn đề về **phạm vi và semantic** đáng tách thành đợt refactor riêng:

| # | Vấn đề | Mức |
|---|--------|-----|
| 7 | POS là ngoại lệ thật sự với Outbox: mất event = **mất kế toán** (không chỉ mất chứng từ) | 🟠 |
| 8 | `GoodsReceiptService.post()` hôm nay **không tạo JE nào**; `ExpensesService` cash-path tạo JE credit cash nhưng **không** cash_movement/không update balance | 🟠 |
| 9 | Variance voucher của kiểm kê **không reference được `cash_counts`** (enum reference_type thiếu `CASH_COUNT`) | 🟡 |
| 10 | Reverse voucher `POS_SALE` đảo luôn doanh thu trong khi invoice giữ POSTED → lệch sổ cái vs invoice | 🟡 |
| 11 | Refactor POS consumer: payload thực tế có thêm field + dedup-by-`reference` hiện có dễ bị bỏ rơi | 🟡 |

## Dependencies

- **EPIC-18052026 Phase 2 hoàn thành** (auto-create vouchers + Outbox). Các item dưới đây sửa/đắp lên hành vi Phase 2.
- TKT-CV-00 (recordMovement TX+jeId) đã merge.

## Scope items

### Item #7 — POS Outbox: mất event = mất kế toán, không chỉ mất chứng từ

**Vấn đề**: Section "Failure semantics" của EPIC-18052026 gộp cả 4 flow là "failure chỉ ảnh hưởng document layer". **Sai cho POS.** Với 3 flow A-revised (debt/GR/expense), accounting commit **đồng bộ ở source TX** → mất `needed.*` chỉ thiếu chứng từ (an toàn). Nhưng POS làm accounting **trong consumer** (`PosCashSaleConsumer.createAndPostInternal` tạo movement+JE+balance). Mất event `erp.cash.movement.from.payment` ⟹ **không có movement/JE/balance** ⟹ sai sổ cái, không chỉ thiếu badge.

Ngoài ra publisher POS nằm ở `pos/services/checkout-invoice.service.ts` (publish **sau** commit checkout), KHÔNG ở consumer. Để Outbox cứu được POS, phải `outbox.enqueue(manager, …)` **trong TX của checkout** — TKT-CV-OB3 chỉ ghi "POS needed.pos_sale (TKT-CV-16)" mà chưa giao rõ việc sửa checkout service.

**Đề xuất**:
- Sửa `CheckoutInvoiceService` để enqueue event POS qua outbox trong chính TX checkout (cần checkout đang có `manager`/transaction — verify).
- Cập nhật section "Failure semantics" epic gốc: tách POS thành nhóm riêng "accounting-in-consumer" với rủi ro khác.
- Cân nhắc dài hạn: đưa POS về model A-revised (accounting đồng bộ ở checkout TX) cho nhất quán — đánh giá chi phí refactor checkout đang chạy ổn định.

**AC**: Tắt relay + POST checkout cash → 1 outbox row commit cùng invoice; bật relay → movement+JE+balance+voucher xuất hiện; KHÔNG có cửa sổ "invoice POSTED nhưng không có cash movement" vĩnh viễn.

### Item #8 — Goods receipt / expense accounting hiện chưa hoàn chỉnh

**Vấn đề (verified)**:
- `GoodsReceiptService.post()` chỉ `stockLedger.recordBatchMovements()` — **không tạo journal entry** cho cả CASH lẫn CREDIT. TKT-CV-17 lần đầu thêm JE cho GR ⇒ động cả nhánh CREDIT (DR inventory / CR 331) đang chạy không-JE → là thay đổi kế toán net-new, không chỉ "wire cash".
- `ExpensesService.post()` hiện tạo JE credit cash trực tiếp (khi không có payableId) **nhưng không tạo `cash_movement` và không update `cash_account.balance`** → balance két không phản ánh expense cash đã chi. Đây là **bug accounting sẵn có**; chuyển sang `recordMovement` ở TKT-CV-17 vừa là feature vừa là bugfix.

**Đề xuất**:
- Tách rõ trong TKT-CV-17 (hoặc ticket con của epic này): regression test đầy đủ nhánh GR CREDIT (JE DR inventory / CR 331 mới) + GR CASH; backfill/đánh giá expense cash cũ (JE-only, balance chưa trừ) — có cần data-fix lịch sử không.
- Quyết định: GR CREDIT có nên sinh JE ngay (Phase 2) hay tách riêng — vì đây là behavior kế toán mới cho toàn bộ goods receipt, không chỉ cash.

**AC**: GR CREDIT post → JE DR inventory / CR 331 đúng, không cash movement; GR CASH → JE + movement + balance; expense cash cũ (nếu có) được liệt kê để ops quyết định fix.

### Item #9 — Variance voucher không trace được về cash_count

**Vấn đề**: `cash_receipt_reference_type` (INVOICE/INVOICE_DEBT/RECEIVABLE/MANUAL/REVERSAL) và `cash_payment_reference_type` **không có value `CASH_COUNT`**. TKT-CV-06 vì thế đặt variance voucher `reference_type=MANUAL`/null → mất link hai chiều cash_count ↔ voucher. Thêm value enum sau này vướng `ALTER TYPE ADD VALUE` (không revert trong TX).

**Đề xuất**:
- Migration thêm value `CASH_COUNT` vào cả 2 reference_type enum (tạo enum mới qua `CREATE TYPE` + swap nếu cần revert-safe).
- `CashCountService.post()` set `reference_type=CASH_COUNT, reference_id=cashCount.id` cho variance voucher; `cash_counts.variance_voucher_id` đã có sẵn → trace hai chiều.
- Cập nhật unique `uniq_*_reference` để bao gồm nhánh CASH_COUNT đúng.

**AC**: Từ cash_count POSTED có variance → voucher có `sourceLink` trỏ về cash_count, và ngược lại.

### Item #10 — Reverse voucher POS_SALE làm lệch invoice vs sổ cái

**Vấn đề**: `journalService.reverse(originalJEId)` swap DR cash/CR revenue → DR revenue/CR cash. Reverse một Phiếu thu `purpose=POS_SALE` vì thế **đảo cả doanh thu** trong khi `invoices` vẫn POSTED → trạng thái invoice và ledger mâu thuẫn. EPIC gốc chỉ ghi "ops void invoice riêng".

**Đề xuất** (chọn 1, quyết định trong PR):
- (a) **Chặn** reverse trực tiếp với voucher `purpose=POS_SALE` (reference_type=INVOICE) → buộc ops void invoice, void cascade voucher.
- (b) Cho reverse nhưng **đồng bộ unpost/void invoice** trong cùng flow (coupling cao hơn).
- (c) Giữ nguyên nhưng thêm cảnh báo + audit rõ ràng (semantic có chủ đích).

**AC**: Hành vi reverse voucher có nguồn (referenceType≠MANUAL) được định nghĩa tường minh + test; không còn trạng thái "im lặng lệch sổ".

### Item #11 — Refactor POS consumer giữ payload + dedup hiện có

**Vấn đề (verified)**: `CashMovementFromPaymentPayload` thực tế có thêm `invoicePaymentId` + `sessionId` (epic gốc bỏ 2 field). Consumer hiện **dedup bằng `reference=invoiceCode`** trước khi `recordMovement`. TKT-CV-16 chuyển sang `createAndPostInternal` nhưng không nói giữ dedup; unique constraint thay thế (`uniq_*_reference` trên `(INVOICE, invoiceId)`) chỉ về ở Phase 2 TKT-CV-13.

**Đề xuất**:
- TKT-CV-16/CV-15: bảo toàn dedup — hoặc giữ check `reference`, hoặc đảm bảo `uniq_cash_receipts_reference (INVOICE, invoiceId)` đã có trước khi gỡ binding cũ.
- Giữ `invoicePaymentId`/`sessionId` trong payload + map vào voucher/movement (`sessionId` → `cash_movements.sessionId` đang dùng).

**AC**: POS cash sale lặp event → đúng 1 voucher + 1 movement; `sessionId` vẫn được set trên movement như trước refactor.

## Epic acceptance criteria

- [ ] #7: POS event đi qua outbox trong TX checkout; không còn cửa sổ "invoice POSTED, cash movement mất".
- [ ] #8: Behavior JE của goods receipt (CASH + CREDIT) và expense (CASH) tường minh + regression pass; expense cash cũ được kiểm kê.
- [ ] #9: Variance voucher trace hai chiều về cash_count qua enum `CASH_COUNT`.
- [ ] #10: Hành vi reverse voucher-có-nguồn được định nghĩa + test.
- [ ] #11: Dedup POS bảo toàn; payload giữ `invoicePaymentId`/`sessionId`.

## Epic Definition of Done

- [ ] Mỗi item có ticket riêng (đặt số trong dải `TKT-CVR-*`) đạt DoD.
- [ ] Cập nhật section "Failure semantics" của EPIC-18052026 (POS tách nhóm).
- [ ] `docs/architecture-cash-flow.md` phản ánh semantic reverse + GR/expense JE mới.
- [ ] Source tiếng Anh; không vỡ E2E Phase 1/Phase 2 hiện có.
