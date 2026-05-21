# Cash Flow & Checkout Architecture

> Discussion summary — 2026-05-11

---

## 1. Tổng quan hệ thống lưu trữ sổ cái thu chi

Sổ cái thu chi được phân tán qua 3 tầng:

| Bảng                                | Tầng       | Ý nghĩa                       |
| ----------------------------------- | ---------- | ----------------------------- |
| `invoice_payments`                  | POS        | POS biết khách trả bằng gì    |
| `cash_movements`                    | Treasury   | Két tiền thay đổi như thế nào |
| `journal_entries` + `journal_lines` | Accounting | Kế toán ghi nhận bút toán kép |

---

## 2. Luồng Checkout Invoice

### Bước 1 — DB Transaction chính (atomic)s
- `invoices` — UPDATE: `isDraft=false`, `status`, `code` thật, `totalPaid`, `amountDue`, `issuedAt`
- `invoice_payments` — INSERT: từng phương thức thanh toán (CASH / CARD / BANK_TRANSFER)
- `invoice_debts` — INSERT: nếu còn nợ (`remainder > 0`)
- `invoice_promotions` — UPDATE: đánh dấu khuyến mãi đã dùng

### Bước 2 — Stock deduction (ngoài transaction)
- Ghi vào `stock_ledger` với `SALE_ISSUE`, số lượng âm
- Nếu fail → compensating transaction: revert invoice về DRAFT, xóa payments + debts

### Bước 3 — Journal entry (non-critical, try-catch)
- Post vào `journal_entries` + `journal_lines` với `source = SALE`
- **Hiện đang fail silently** vì phụ thuộc:
  - Chart of Accounts (COA) phải được seed cho organization
  - Document numbering sequence `JOURNAL` phải được khởi tạo cho branch

### Bước 4 — Async
- Loyalty points → `membership_cards`
- Kafka: `SALE_POSTED`
- WebSocket: `POS_CHECKOUT_ACKNOWLEDGED`

---

## 3. Kafka Architecture

### Quyết định chuyển sang event-driven

Thay vì gọi trực tiếp trong checkout service, 3 operations sau sẽ được publish qua Kafka:

| Event           | Kafka Key    | Lý do chọn key                                          |
| --------------- | ------------ | ------------------------------------------------------- |
| Stock deduction | `productId`  | Serialize deduction per product, tránh concurrent write |
| Loyalty points  | `customerId` | Serialize point updates per customer                    |
| Journal posting | `branchId`   | Serialize document numbering per branch                 |

### Checkout service sau khi refactor

```
Invoice committed
    ↓
Publish: STOCK_DEDUCTION   key = productId
Publish: POINTS_AWARD      key = customerId
Publish: JOURNAL_POST      key = branchId
    ↓
Return response ngay
```

Checkout service không còn depend vào `StockLedgerService`, `MembershipCardService`, hay `JournalService`.

### Error handling — DLQ + dead_letter_events

```
Consumer fail → retry 1 → retry 2 → retry 3 → INSERT dead_letter_events → alert admin
                                                         ↓
                                            Admin xem log, fix root cause → manual replay
```

**Không dùng Saga** — business chấp nhận stock âm, không có gì cần rollback khi downstream fail.

**Không dùng Outbox** — DLQ + `dead_letter_events` đủ cho scale hiện tại.

### Bảng `dead_letter_events`

```sql
CREATE TABLE dead_letter_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic       VARCHAR NOT NULL,
  partition   INT,
  offset      BIGINT,
  key         VARCHAR,
  payload     JSONB NOT NULL,
  error       TEXT,
  retry_count INT DEFAULT 3,
  status      VARCHAR DEFAULT 'PENDING', -- PENDING | RESOLVED | IGNORED
  resolved_by VARCHAR,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### Idempotency keys

| Event           | Idempotency key                       |
| --------------- | ------------------------------------- |
| Stock deduction | `invoiceId + itemId`                  |
| Loyalty points  | `invoiceId`                           |
| Journal posting | `invoiceId` (via `sourceReferenceId`) |

---

## 4. Cash Management

### Ba khái niệm cần phân biệt

```
invoice_payments   →  POS biết khách trả bằng gì
cash_movements     →  Thủ quỹ biết két có bao nhiêu tiền
journal_entries    →  Kế toán biết doanh nghiệp lời/lỗ bao nhiêu
```

Một giao dịch bán hàng hoàn chỉnh cần cả 3:
```
Bán hàng 500,000đ (cash 300k + card 200k)
       ↓
invoice_payments   ghi: CASH 300k + CARD 200k      (POS layer)
cash_movements     ghi: +300k vào két quầy 1        (Treasury layer)
journal_entries    ghi: DR Cash/Bank, CR Revenue    (Accounting layer)
```

### Thiết kế `cash_accounts` — thêm `type`

```
cash_accounts
  ├─ id
  ├─ name          "Quầy 1", "Két chính HN", "Petty Cash"
  ├─ type          REGISTER | SAFE | PETTY_CASH   ← cần thêm
  ├─ balance
  └─ accountId     (link COA)
```

| Type         | Ý nghĩa                            | Ai quản lý           |
| ------------ | ---------------------------------- | -------------------- |
| `REGISTER`   | Két tại quầy POS, gắn với terminal | Thu ngân             |
| `SAFE`       | Két chính của chi nhánh            | Quản lý ca / kế toán |
| `PETTY_CASH` | Quỹ lẻ chi phí vặt                 | Hành chính           |

### Thiết kế `cash_movements` — thêm `toAccountId`

```
cash_movements
  ├─ cashAccountId   két nguồn  (bắt buộc)
  ├─ toAccountId     két đích   ← cần thêm, chỉ dùng khi type = TRANSFER
  ├─ type            DEPOSIT | WITHDRAWAL | TRANSFER | ADJUSTMENT
  └─ amount
```

**Validation**: `toAccountId` bắt buộc khi và chỉ khi `type = TRANSFER`.

**Luồng TRANSFER:**
```
Quầy 1 → chuyển 2tr → Két chính

cash_movement:
  cashAccountId = Quầy 1      ← trừ balance
  toAccountId   = Két chính   ← cộng balance
  type          = TRANSFER
  amount        = 2,000,000

Journal tự động:
  DR  Két chính (TK 111-2)   2,000,000
  CR  Quầy 1   (TK 111-1)   2,000,000
```

### Luồng quản lý ca (shift)

```
Mở ca:    Két chính → TRANSFER float → Quầy 1
Bán hàng: Khách trả cash → DEPOSIT vào Quầy 1
Giữa ca:  Quầy 1 → TRANSFER → Két chính  (rút bớt tiền)
Chốt ca:  Đếm thực tế → so sánh với expectedCash → ghi variance
Cuối ca:  Quầy 1 → TRANSFER toàn bộ → Két chính
```

**Chốt ca — `pos_session_reconciliations`:**
```
expectedCash = openingCashAmount + tổng DEPOSIT cash - tổng WITHDRAWAL cash
actualCash   = thu ngân đếm thực tế
variance     = actualCash - expectedCash
  > 0 → thừa tiền
  < 0 → thiếu tiền (cần manager duyệt)
```

---

## 5. Các vấn đề còn tồn đọng (chưa implement)

| Vấn đề                                 | Mô tả                                                       |
| -------------------------------------- | ----------------------------------------------------------- |
| `cash_movements` chưa ghi khi checkout | POS payment chỉ vào `invoice_payments`, không cập nhật két  |
| `pos_sessions` thiếu `cashAccountId`   | Không biết ca đang dùng két nào                             |
| `cash_movements` thiếu `sessionId`     | Khó filter movements theo ca khi chốt                       |
| `cash_accounts` thiếu `type`           | Không phân biệt két quầy vs két chính                       |
| `cash_movements` thiếu `toAccountId`   | TRANSFER không biết két đích                                |
| Bug journal trong `CashService`        | Debit và credit cùng 1 account → bút toán vô nghĩa          |
| Journal fail silently                  | COA và document numbering chưa được seed cho org/branch mới |

---

## 6. Cash voucher document layer (EPIC-18052026)

A document-level cash layer sits on top of `cash_accounts` / `cash_movements`:

- **Phiếu thu** (`cash_receipts` + `cash_receipt_lines`) — header + lines, state `DRAFT → POSTED → REVERSED`. On post: `CashService.recordMovement(DEPOSIT, contra=…)` creates the movement + journal entry (DR cash / CR contra) and bumps the balance.
- **Phiếu chi** (`cash_payments` + `cash_payment_lines`) — symmetric; post = `WITHDRAWAL` (DR contra / CR cash), insufficient balance → 400.
- **Reverse** copies the lines verbatim (amount > 0) and posts the opposite movement (`WITHDRAWAL` for a reversed receipt, `DEPOSIT` for a reversed payment), which produces the DR↔CR-swapped reversing journal entry. The original is flagged `REVERSED` with `reversed_by_voucher_id`; the reversal carries `reverses_voucher_id`, `reference_type=REVERSAL`, `reversal_reason`.
- **Sổ chi tiết tiền mặt** (`GET /cash-ledger`) — cursor-paginated; opening/closing/totals via scalar SQL `SUM` (no GROUP BY), running balance computed in RAM. Filter is `(cash_account_id = X OR to_account_id = X)` so a TRANSFER shows in both accounts' ledgers (signed by direction).
- **Kiểm kê tiền mặt** (`cash_counts`) — `expected_amount` is snapshotted at POST under `SELECT FOR UPDATE`; `variance > 0` auto-posts a Phiếu thu (TK 711), `variance < 0` a Phiếu chi (TK 811), `variance = 0` posts with no voucher.

`CashService.recordMovement()` / `JournalService.post()/reverse()` accept an optional `EntityManager` so the movement, journal entry, voucher document and outbox row commit in **one transaction** (TKT-CV-00). `recordMovement` returns `{ movement, journalEntryId }`.

### TKT-CV-00 fixes the historical bugs

The "bug journal trong CashService" and "cash_movements chưa ghi khi checkout" rows above are resolved: `recordMovement` posts a correct DR/CR pair, and POS cash sales now flow through `PosCashSaleConsumer` which records the movement + JE + Phiếu thu.

## 7. Auto-create vouchers + Transactional Outbox (Phase 2)

`paymentMethod=CASH` on a source document triggers an auto Phiếu thu/chi:

| Source | Flow |
| ------ | ---- |
| POS cash sale | `CheckoutInvoiceSvc` publishes `erp.cash.movement.from.payment` → `PosCashSaleConsumer.createAndPostInternal()` (movement + JE + Phiếu thu, atomic in the consumer). |
| Debt collection | `InvoiceDebtService.collectPayment(CASH)` → `recordMovement(DEPOSIT, contra=131)` in the source TX → enqueue `needed.debt_payment` → `DebtCollectionCashConsumer.createVoucherForMovement()` (links existing movement+JE). |
| Goods receipt | `GoodsReceiptService.post(CASH)` → `recordMovement(WITHDRAWAL, contra=156)` → enqueue `needed.goods_receipt` → `GoodsReceiptCashConsumer`. |
| Expense | `ExpensesService.post(CASH)` → `recordMovement(WITHDRAWAL, contra=expense.accountId)` → enqueue `needed.expense` → `ExpenseCashConsumer`. |

Each voucher consumer publishes `cash.voucher.created`; link-back consumers in the source modules back-fill `debt_payments.cash_receipt_id` / `goods_receipts.cash_payment_id` / `expenses.cash_payment_id`.

### Transactional Outbox (`modules/events/outbox/`)

Closes the dual-write gap: instead of publishing after commit, source services `OutboxService.enqueue(manager, topic, event)` **inside** the business transaction. `OutboxRelayService` polls `published_at IS NULL AND next_attempt_at <= now()` with `FOR UPDATE SKIP LOCKED`, publishes to Kafka, marks `published_at`; failures back off exponentially. Invariant: **source committed ⟺ outbox row exists ⟺ event is published ⟺ voucher is created** — self-recovering after a crash. `event_id` is deterministic (`uuidv5` over `(sourceType, sourceId)`) so at-least-once delivery is idempotent via `processed_events` + the unique `(org, reference_type, reference_id)` index. Set `OUTBOX_RELAY_DISABLED=1` to disable the relay (used to simulate crash-recovery in tests).
