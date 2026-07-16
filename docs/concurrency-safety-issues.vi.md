# Báo cáo vấn đề An toàn Đồng thời (Concurrency-Safety)

**Phạm vi:** `apps/api/src/` — rà soát Idempotency, Distributed Locking, Optimistic Concurrency Control (OCC), và **toàn bộ luồng insert/update DB** (không chỉ các endpoint HTTP), tìm các lỗi race dạng read-modify-write, chuyển trạng thái (status-transition), và check-then-insert.

**Ngày:** 2026-07-09 · **Loại:** Rà soát tĩnh, chỉ đọc. Thống kê lệnh ghi: `.save()`×285, `.update()`×118, `.insert()`×13, `.upsert()`×5, `.increment()`×3, `.decrement()`×2 trên toàn codebase. **Không chỉnh sửa code.**

**Chú thích mức độ:** 🔴 Nghiêm trọng (hỏng dữ liệu) · 🟠 Cao · 🟡 Trung bình · 🔵 Thấp / mang tính thông tin.

**Nguyên nhân gốc chung của hầu hết phát hiện:** **không có `@VersionColumn` ở bất kỳ đâu** (không có lớp dự phòng OCC) và **không có distributed lock**. Pessimistic row lock của Postgres chỉ tồn tại ở một số ít luồng. Ở tất cả nơi còn lại, một read-modify-write hoặc check-then-act không khóa sẽ **âm thầm mất cập nhật** — không bao giờ ném lỗi.

---

## Bảng tổng hợp

| # | Mức | Vấn đề | Vị trí |
|---|-----|--------|--------|
| **A. Mất cập nhật số dư / bộ đếm (read-modify-write không khóa)** ||||
| A1 | 🔴 | **Số dư tài khoản tiền mặt** — điểm hội tụ của TẤT CẢ giao dịch tiền, RMW không khóa | `cash.service.ts` |
| A2 | 🔴 | **Số dư tồn kho** — luồng ghi tồn dùng chung, RMW không khóa → bán âm kho | `stock-ledger.service.ts` |
| A3 | 🟠 | Thu nợ POS `collectPayment` — `paidAmount`/`remainingAmount` RMW không khóa | `invoice-debt.service.ts` |
| A4 | 🟠 | Bù trừ nợ khi trả/hoàn hàng — cùng dòng `invoice_debts`, không khóa | `checkout-return.service.ts` |
| A5 | 🟠 | Thu công nợ `collect` — `settledAmount` RMW không khóa, guard đọc dữ liệu cũ | `receivables.service.ts` |
| A6 | 🟠 | Thanh toán phải trả `settle` — `settledAmount` RMW không khóa | `payables.service.ts` |
| A7 | 🟠 | Điểm thành viên `adjustPoints` — increment nguyên tử nhưng **guard sàn không khóa** → điểm âm | `membership-card.service.ts` |
| A8 | 🟡 | Tín dụng cửa hàng `redeem` — rút quá không khóa (tiềm ẩn: chưa có caller) | `customer-credit.service.ts` |
| **B. Ghi trùng khi chuyển trạng thái (đọc trạng thái rồi update, không khóa / không kiểm tra lại trong tx)** ||||
| B1 | 🟠 | Nhập kho post/cancel | `goods-receipt.service.ts` |
| B2 | 🟠 | Xuất kho post/cancel | `goods-issue.service.ts` |
| B3 | 🟠 | Điều chỉnh post/approve/cancel | `stock-adjustment.service.ts` |
| B4 | 🟠 | Kiểm kê post/cancel/merge | `stock-take.service.ts` |
| B5 | 🟠 | Đơn mua approve/receive/cancel | `purchase-order.service.ts` |
| B6 | 🟠 | Lệnh chuyển kho export/import/update | `transfer-order.service.ts` |
| B7 | 🟡 | Bút toán `reverse` — guard không khóa → đảo bút toán 2 lần | `journal.service.ts` |
| B8 | 🟡 | Guard bản nháp checkout — không khóa → checkout 2 lần | `checkout-invoice.service.ts` |
| **C. Lỗi race check-then-insert (trùng bản ghi)** ||||
| C1 | 🟠 | pos-session `openSession` — **không có unique constraint** → trùng phiên OPEN cho một quầy | `pos-session.service.ts` |
| C2 | 🟠 | variant `resolveOrCreateVariant` — tuyên bố "atomic" sai; kiểm tra ngoài tx, không constraint tổ hợp | `variant-generation.service.ts` |
| C3 | 🟡 | registration `approve` — duyệt 2 lần → trùng org/branch | `registration.service.ts` |
| C4 | 🟡 | Dedup của stock-deduction consumer không có constraint bảo chứng | `stock-deduction.consumer.ts` |
| C5 | 🔵 | Các helper resolve-or-create — có constraint nhưng không bắt `23505` → 500 (lỗi tính sẵn sàng, không phải đúng-đắn) | `inventory-location*.service.ts`, pos-session recon |
| **D. Lỗ hổng cơ chế mang tính cấu trúc** ||||
| D1 | 🟠 | Idempotency HTTP là opt-in — request không có header sẽ bỏ qua dedupe | `idempotency.interceptor.ts` |
| D2 | 🟠 | Không tồn tại distributed lock (chỉ có Postgres row lock) | toàn app |
| D3 | 🟡 | Không có OCC; kiểm tra version thủ công duy nhất là code chết | `base-crud.service.ts` |
| D4 | 🔵 | Lỗi ghi vào idempotency store bị nuốt → retry có thể chạy lại | `idempotency.interceptor.ts` |

---

# A. Race mất cập nhật số dư / bộ đếm

Tất cả đều `findOne` (không khóa) → tính toán bằng JS → `save`. Các luồng ghi đồng thời đọc cùng một giá trị ban đầu; lệnh ghi cuối cùng thắng; guard (thiếu số dư / trả dư) kiểm tra trên dữ liệu **cũ** nên cũng có thể bị vượt qua.

## A1 🔴 Số dư tài khoản tiền mặt — điểm bỏ sót trung tâm

**Vị trí:** `apps/api/src/modules/accounting/cash/cash.service.ts`
- `recordSingleAccountMovementInTx`: `findOne(CashAccountEntity)` L122-124 (không khóa) → `newBalance = Number(balance) + delta` L243 → `save` L276-277.
- `recordTransferInTx`: `findOne` đích L149 (không khóa) → `source.balance -= amount; dest.balance += amount` L175-177 → `save([source, dest])`.

**Vì sao nghiêm trọng:** đây là **điểm hội tụ duy nhất của mọi thay đổi số dư tiền mặt** — mọi lần thu tiền công nợ, thanh toán phải trả, và thu nợ POS đều gọi `cashService.recordMovement`, tất cả cùng nhắm vào quầy của chi nhánh (qua `cashFundResolver.resolveOrDefault`). Các pessimistic lock trong `cash-receipts.service.ts`/`cash-payments.service.ts` (L251/L327) khóa **dòng chứng từ (voucher)** cho việc chuyển trạng thái của chính nó — **không** khóa tài khoản tiền mặt. Nên kể cả một lần post chứng từ "an toàn" đã khóa vẫn thay đổi `cash_accounts.balance` qua luồng không khóa này.

**Tác động:** hai lần post đồng thời trên cùng một quầy đều đọc balance=100 (+50, +30) → balance cuối cùng thành 130 hoặc 150 thay vì 180. Cả hai dòng `cash_movements` và cả hai bút toán vẫn được lưu, nên **sổ cái và cột `balance` phi chuẩn hóa âm thầm lệch nhau**. Guard thiếu số dư (L165/L245) kiểm tra trên dữ liệu cũ → có thể bị vượt qua.

## A2 🔴 Số dư tồn kho — bán âm kho

**Vị trí:** `apps/api/src/modules/inventory/ledger/stock-ledger.service.ts:621-667` (`upsertBalance`)

`recordMovement` (`:147`) và `recordBatchMovements` (`:248`) — dùng bởi **checkout, xuất kho, nhập kho, điều chỉnh, kiểm kê** — hội tụ vào `upsertBalance`: `findOne(StockBalanceEntity)` không khóa (`:625-631`) → `newQuantity = quantity + qty` → `update()` (`:634-647`). Không `pessimistic_write`, mặc định READ COMMITTED (tx tại `:267`, `checkout-invoice.service.ts:216`). Chỉ `stock-transfer.service.ts:630,767,1102` khóa trước dòng số dư; năm luồng còn lại thì không. Số dư âm chỉ *ghi cảnh báo* (`:636-641`), không bao giờ chặn. Constraint `@Unique(org,item,location)` giới hạn định danh dòng nhưng không giới hạn RMW của `quantity`.

## A3 🟠 Thu nợ POS — `collectPayment`

**Vị trí:** `apps/api/src/modules/pos/services/invoice-debt.service.ts` (endpoint `POST invoice/debts/:debtId/payments`, `invoice.controller.ts:128-136`)

`findOne(InvoiceDebtEntity)` L155-157 (không `setLock`) → `paidAmount += amount; remainingAmount = originalAmount - paidAmount` L189-190 → `save` L198. Guard trả dư L167 trên dữ liệu cũ. **Khác** với debt-collection saga (đã được khóa). Hai lần thanh toán 100 đồng thời cho một khoản nợ còn 100 đều đi qua → `paidAmount` mất cập nhật, tạo 2 dòng `debt_payments` + 2 cash movement cho khoản nợ chỉ nợ 100.

## A4 🟠 Bù trừ nợ khi trả/hoàn hàng

**Vị trí:** `apps/api/src/modules/pos/services/checkout-return.service.ts` (~L450-480)

`findOne(InvoiceDebtEntity, {invoiceId, org})` L452-457 (không khóa) → `applied = min(refund, remaining); paidAmount += applied; remainingAmount = originalAmount - paidAmount` L470-474 → `save` L480. Đua với luồng `collectPayment` (A3) trên **cùng dòng `invoice_debts`** → mất một cập nhật, số dư nợ bị hỏng.

## A5 🟠 Thu công nợ `collect`

**Vị trí:** `apps/api/src/modules/accounting/receivables/receivables.service.ts` → `collect`

`findOne` L140-143 (không khóa, **trước khi** tx mở tại L166) → `settledAmount += dto.amount` L181-182 → `save` L191. Guard trả dư L158-160 trên dữ liệu cũ. Các dòng settlement là append-only (an toàn); running total `settledAmount` phi chuẩn hóa là bề mặt mất cập nhật, và trạng thái PARTIALLY_SETTLED/SETTLED được tính từ nó.

## A6 🟠 Thanh toán phải trả `settle`

**Vị trí:** `apps/api/src/modules/accounting/payables/payables.service.ts` → `settle` — cấu trúc giống hệt A5. `findOne` L132-135 (không khóa, trước tx tại L157) → `settledAmount += dto.amount` L171 → `save` L179. Guard L150-151 trên dữ liệu cũ.

## A7 🟠 Điểm thành viên `adjustPoints` — guard sàn không khóa

**Vị trí:** `apps/api/src/modules/customer/services/membership-card.service.ts:84-122`

Lệnh *ghi* là nguyên tử (`manager.increment` L107-118), nhưng *guard thiếu điểm* thì không: `findOne` L89 (không khóa, khác với `redeemPointsForInvoice` ở L177 có khóa) → `resultingPoints = card.points + dto.delta` guard `>= 0` L100-105 trên dữ liệu **cũ**. Hai lần REDEEM đồng thời — hoặc một `adjustPoints` REDEEM đua với checkout `redeemPointsForInvoice` trên cùng thẻ — đều đọc `points=100`, đều qua `100 + (-80) >= 0`, đều trừ → **điểm âm / vượt mức**. Increment nguyên tử ngăn mất cập nhật nhưng không thực thi giá trị sàn.

## A8 🟡 Tín dụng cửa hàng `redeem` — rút quá tiềm ẩn

**Vị trí:** `apps/api/src/modules/customer/services/customer-credit.service.ts:72-113`

`findOne` L80 (không khóa) → `if (remaining < amt) throw` L96 trên dữ liệu cũ → `remaining - amt` bằng JS → `save(credit)` L102-108. Không khóa, không version, không `UPDATE ... WHERE remaining_amount >= :amt` nguyên tử. **Hiện là code chết** — chỉ `issue()` được nối dây (`checkout-return.service.ts:253`); `redeem()` chưa có caller. Sẽ thành lỗi rút quá thực sự ngay khi một luồng thanh toán bằng tín dụng cửa hàng gọi nó. Sửa trước khi nối dây.

---

# B. Race ghi trùng khi chuyển trạng thái

Mỗi post/cancel chứng từ đọc dòng **không khóa, bên ngoài** transaction thay đổi, kiểm tra trạng thái bằng JS, rồi update bên trong một transaction mới **không** đọc lại hay kiểm tra lại trạng thái. Tất cả đều định nghĩa một map `TRANSITIONS` + `validateTransition`, nhưng việc kiểm tra chạy trên trạng thái cũ trong bộ nhớ; không có gì tuần tự hóa việc đọc so với việc ghi. Hai lần post đồng thời đều thấy `DRAFT` → đều ghi stock movement / bút toán → **tồn kép + kế toán kép**.

| ID | Service | Luồng post (đọc không khóa → update vô điều kiện) | Luồng cancel |
|----|---------|--------------------------------------------------|--------------|
| B1 | `goods-receipt.service.ts` | `findOrFail` L326 → tx L369 → `update({status:POSTED})` L472 | `save` L318 |
| B2 | `goods-issue.service.ts` | `findOrFail` L207 → tx L233 → `update(id,{status:POSTED})` L265 | `save` L317 |
| B3 | `stock-adjustment.service.ts` | `findOrFail` L289 → `update({status:POSTED})` L270 | submit/approve/reject/cancel L108-175 |
| B4 | `stock-take.service.ts` | `findOrFail` L1664 → `update({status:POSTED})` L719 (sinh GR/GI) | `save` L599; merge có guard affected-row một phần L286-297 |
| B5 | `purchase-order.service.ts` | receive: kiểm tra status L122 → `update` dòng L154 + PO L196 | approve L100-113, cancel L205-208 |
| B6 | `transfer-order.service.ts` | export: kiểm tra DRAFT L762 → `update` L802; import: L1013 → `update` L1135 | update L604-748 |

**Ví dụ lỗi cụ thể:**
- B1/B2: post kép đồng thời → stock movement + bút toán được ghi hai lần.
- B5 receive: cả hai qua L122 → dòng PO nhận dư (`receivedQty` tăng gấp đôi), trùng phiếu nhập.
- B6 export: hai lần export đồng thời cho một lệnh DRAFT → hai GoodsIssue, tồn kho nguồn bị trừ gấp đôi.
- Post + cancel xen kẽ: hủy một chứng từ vừa post mà không đảo sổ cái của nó.

## B7 🟡 Bút toán `reverse` — `journal.service.ts:154-263`
Guard trạng thái `POSTED` và `reversedByJournalId` qua đọc-rồi-ghi không khóa → đảo kép đồng thời có thể tạo hai bút toán đối ứng cho một journal.

## B8 🟡 Guard bản nháp checkout — `checkout-invoice.service.ts:106-118`
Đọc trạng thái nháp không khóa trước khi commit → hai checkout đồng thời của cùng bản nháp đều qua. Được giảm nhẹ một phần ở hạ nguồn bởi chuỗi số chứng từ đã khóa và khóa thẻ khi trừ điểm, nhưng bản nháp thì không được tuần tự hóa.

---

# C. Race check-then-insert (trùng bản ghi)

## C1 🟠 pos-session `openSession` — trùng phiên không ràng buộc

**Vị trí:** `apps/api/src/modules/pos/services/pos-session.service.ts:62-88`

`findOne` phiên đang hoạt động của tài khoản tiền (status IN OPEN/ACTIVE_SALES) → nếu thấy thì throw → nếu không thì `save` phiên OPEN mới L88. `pos-session.entity.ts:7` chỉ có `@Index(['org','branch','status'])` **không unique**. Không khóa, **không unique constraint**. Hai lần mở đồng thời trên cùng quầy đều trượt → **hai phiên OPEN trên một quỹ tiền** → đối soát / toàn vẹn tiền bị hỏng. (`activate`/`close`/`approveVariance` L101-240 cũng là chuyển trạng thái không khóa, mức độ thấp hơn.)

## C2 🟠 Variant `resolveOrCreateVariant` — tuyên bố "atomic" là sai

**Vị trí:** `apps/api/src/modules/inventory/product/variant-generation.service.ts:102-127`

`findExistingVariant` (L116-122) chạy trên **manager mặc định, ngoài mọi transaction**, và trả về sớm nếu tìm thấy; chỉ luồng tạo mới mở `dataSource.transaction` (L124-126). Check-then-act bị tách qua hai ngữ cảnh DB.
1. **Trùng variant (cùng tổ hợp):** `item-attribute-value.entity.ts:9` chỉ có `@Unique(['itemId','attributeDefinitionId'])` — KHÔNG ràng buộc tổ hợp đầy đủ. Không khóa. Hai lần gọi đồng thời cùng tổ hợp đều trượt → trùng variant item cho cùng product/tổ hợp.
2. **Trùng code:** `item.entity.ts:12` có `@Unique(['org','code'])`, nhưng `createVariantItem` (L260) **không** bắt `23505`, nên code trùng đồng thời gây **500 không xử lý**, không phải retry mượt mà. Vòng lặp retry chống trùng chỉ giúp khi chạy tuần tự.

## C3 🟡 Registration `approve` — trùng org/branch

**Vị trí:** `apps/api/src/modules/registration/registration.service.ts:100-125`

`findById` không khóa → kiểm tra `APPROVABLE_STATUSES` L106 → `createOrgFromRequest`/`createBranchFromRequest` L112-116 → lật `status=APPROVED` + save L118-122. Không `UPDATE ... WHERE status IN (...)` nguyên tử, không khóa, không unique key trên org được tạo. Hai lần duyệt đồng thời đều qua → **trùng organization + branch**. Thao tác admin, độ đồng thời thấp.

## C4 🟡 Dedup của stock-deduction consumer không có constraint bảo chứng

**Vị trí:** `apps/api/src/modules/inventory/consumers/stock-deduction.consumer.ts:33-76`

Dedup ở tầng ứng dụng — `findOne` trên `(referenceType, referenceId, itemId, org)` rồi bỏ qua — **không có unique constraint bảo chứng**, và gọi `recordBatchMovements` *không* truyền `manager` (tx riêng, không khóa). Có cửa sổ race giữa việc kiểm tra dedup và insert; kết hợp với A2, các lần giao message trùng đồng thời có thể ghi kép. Lưu ý: khác với tầng `processed_events` mạnh mẽ (xem "hoạt động tốt").

## C5 🔵 Các helper resolve-or-create — lỗi tính sẵn sàng, không phải đúng-đắn

Các insert có constraint nhưng **không bắt `23505`**, nên lần resolve đồng thời đầu tiên trả 500 thay vì trả về dòng đã tồn tại:
- `inventory-location-stock.service.ts:193-213, 267-288` — insert StockBalance (constraint `@Unique(org,item,location)`).
- `inventory-location.service.ts:167-244` — resolve-or-create nhóm hàng/thương hiệu/đơn vị/nhà cung cấp (mỗi cái có unique constraint).
- `pos-session.service.ts:168-201` — `openReconciliation` (constraint `@Index(unique)` ở `session-reconciliation.entity.ts:6`).

Tính đúng-đắn an toàn (DB từ chối bản trùng); lỗi là 500 không xử lý khi race. `item-crud.service.ts:676-684`, `product-attribute.service.ts:53,76`, và `temp-warehouse.service.ts:1176-1182` CÓ bắt `23505` — đây là mẫu cần noi theo.

---

# D. Lỗ hổng cơ chế mang tính cấu trúc

## D1 🟠 Idempotency HTTP là opt-in, không bắt buộc
**Vị trí:** `common/interceptors/idempotency.interceptor.ts:15,31-41` — toàn cục (`common.module.ts:15`) nhưng thoát sớm khi method là `GET/HEAD/OPTIONS` hoặc **không có header `x-idempotency-key`**. Không thực thi ở tầng route, không decorator `@Idempotent`/`@SkipIdempotency`, không danh sách bắt buộc-idempotent. Các endpoint tài chính/tồn kho rủi ro nhất phụ thuộc vào client gửi key. Giảm nhẹ ở tầng DB chỉ tồn tại cho hai saga (`UQ_*_saga_idem`) và CSV import (`@Unique(org,type,idempotencyKey)`).

## D2 🟠 Không tồn tại distributed lock
Không có thư viện `redlock`/lock; grep `redlock`/`SETNX`/`acquireLock`/`withLock`/`pg_advisory` → rỗng. `redis.service.ts` không có `SET NX`. Toàn bộ tuần tự hóa là Postgres row lock: document-numbering (`SERIALIZABLE`+`pessimistic_write` `:342-348`), cash vouchers, stock-transfer, thẻ thành viên, outbox (`FOR UPDATE SKIP LOCKED` `:82`). Đủ dùng trên một Postgres primary duy nhất; chỉ là lỗ hổng nếu scale ra nhiều primary.

## D3 🟡 Không có OCC; kiểm tra version thủ công là code chết
`@VersionColumn` không xuất hiện ở đâu. `base-crud.service.ts:115-126` so `payload.version` với `existing.version` và throw `ConflictException`, nhưng không entity nào có cột `version` nên nhánh này không bao giờ chạy (cũng là TOCTOU, không tăng version). `update-customer.dto.ts:47` là DTO duy nhất có `version?`, nạp vào nhánh chết này. Không có lớp dự phòng optimistic-lock, nên mọi RMW không khóa ở trên âm thầm mất cập nhật thay vì ném lỗi.

## D4 🔵 Lỗi ghi vào idempotency store bị nuốt
`idempotency.interceptor.ts:94-99` — nếu ghi Redis lỗi *sau khi* mutation thành công, lỗi bị nuốt và response vẫn trả về, nhưng key không bao giờ được lưu → retry của client chạy lại.

---

# Những phần đang hoạt động tốt (không cần gắn cờ lại)

- **Idempotency event-consumer** — `processed_events` (PK tổ hợp theo từng consumer) + claim-trước-khi-làm/release-khi-lỗi (`event-consumer.service.ts:135-156`, `event-idempotency.service.ts:21-44`), exactly-once nhờ id `uuidv5` xác định (`deterministic-event.ts:16-21`). Phần mạnh nhất của hệ thống.
- **Document numbering** — tx `SERIALIZABLE` + `pessimistic_write` trên dòng counter (`document-numbering.service.ts:342-348`).
- **Outbox relay** — `FOR UPDATE SKIP LOCKED` (`outbox-relay.service.ts:82`).
- **Stock transfer** — khóa trước `StockBalanceEntity` bằng `pessimistic_write` (`:630,767,1102`) — mẫu mà các endpoint A2 nên noi theo.
- **Cash vouchers** — khóa dòng chứng từ cho việc chuyển trạng thái của chính nó (`cash-receipts/payments.service.ts:251,327`; debt & supplier saga `:269/302`, `:270/308`); sổ chứng từ append-only. (Nhưng vẫn chạm vào số dư tiền không khóa — A1.)
- **`redeemPointsForInvoice`** — `pessimistic_write` + kiểm tra lại + trừ (`membership-card.service.ts:170-211`). `awardPointsForInvoice` chỉ cộng, increment nguyên tử, consumer dedup theo hóa đơn.
- **Bộ đếm promotion / voucher / discount-code** — UPDATE có guard nguyên tử: `discount-code.service.ts:127-138` `SET used_count = used_count + 1 WHERE ... used_count < max_uses`, throw khi `affected===0`; `voucher.service.ts:123-132` `markUsed` throw khi `affected===0`. An toàn khỏi dùng quá.
- **Tính duy nhất RBAC / gán quyền** — user↔branch `@Unique(['userId','branchId'])`, email user `@Unique(['email','organizationId'])`, mã nhân viên `uq_employee_profile_org_code` đều bảo chứng cho read-then-insert.

---

# Lệnh kiểm chứng

```bash
# Không có distributed lock, không có OCC ở đâu
grep -rn "redlock\|SETNX\|acquireLock\|withLock\|pg_advisory" apps/api/src   # → rỗng
grep -rn "VersionColumn" apps/ packages/                                     # → rỗng

# Các row lock ĐANG tồn tại (luồng an toàn)
grep -rn "pessimistic_write\|SERIALIZABLE\|FOR UPDATE" apps/api/src

# A1: điểm hội tụ số dư tiền mặt không khóa
sed -n '120,280p' apps/api/src/modules/accounting/cash/cash.service.ts

# A2: luồng số dư tồn kho không khóa
sed -n '621,667p' apps/api/src/modules/inventory/ledger/stock-ledger.service.ts

# A3/A4: RMW invoice_debts không khóa
sed -n '150,200p' apps/api/src/modules/pos/services/invoice-debt.service.ts

# B: chuyển trạng thái đọc status không khóa, update không kiểm tra lại
grep -rn "findOrFail\|validateTransition" apps/api/src/modules/inventory/goods-receipt apps/api/src/modules/inventory/goods-issue

# C1: pos-session không có unique constraint trên phiên hoạt động
grep -n "Unique\|Index" apps/api/src/modules/pos/**/pos-session.entity.ts

# C2: kiểm tra tồn tại của variant chạy ngoài transaction
sed -n '102,127p' apps/api/src/modules/inventory/product/variant-generation.service.ts

# Luồng ghi nào bắt 23505 (mẫu cần noi theo cho C5)
grep -rn "23505\|UNIQUE_VIOLATION\|isUniqueViolation" apps/api/src
```
