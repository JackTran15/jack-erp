---
feature: online-order-intake-dispatch
adrs: 14
---

# Logical design — Nhận đơn web qua API key, Admin phân thủ công về chi nhánh

## Approach

Không dựng miền đơn hàng thứ hai. Toàn bộ feature là **nới `sales_orders` ra
khỏi ràng buộc chi nhánh**, thêm một bước điều phối, và mở một cửa ghi cho đối
tác bên cạnh cửa đọc đã có.

Bốn mảnh:

### 1. Kênh bán trở thành dữ liệu

```
sales_channels  (org-scoped, CRUD qua generic CRUD platform)
  code          varchar  -- "WEB", "SHOPEE", ...  unique theo org
  name          varchar  -- "Website công ty"     nhãn hiển thị
  is_active     boolean
```

`sales_orders` mang `sales_channel_id` (FK) **và** giữ nguyên
`sales_channel varchar` như snapshot nhãn lúc đặt — đổi tên kênh sau này không
đổi chứng từ cũ. `invoices.sales_channel` (varchar 64, đã có) nhận đúng snapshot
đó khi phát hành. Không FK từ `invoices` sang `sales_channels`: hoá đơn là chứng
từ, nó giữ chuỗi.

Chống trùng: `sales_orders.external_order_id` + `UNIQUE (organization_id,
sales_channel_id, external_order_id)`. Đối tác retry đúng id cũ ⇒ trả lại đơn đã
tạo thay vì tạo đơn thứ hai (AC-06). Đây là lớp *nghiệp vụ*, độc lập với
`IdempotencyInterceptor` (lớp *vận chuyển*, keyed trên `X-Idempotency-Key`) —
hai thứ chặn hai loại lặp khác nhau và đều giữ.

### 2. Đơn không có chi nhánh, và cửa ghi cho đối tác

`sales_orders` đổi:

| Cột | Đổi gì | Vì sao |
|---|---|---|
| `branch_id` | giữ nullable, **bỏ ràng buộc ở tầng service cho đường partner** | pool = `branch_id IS NULL` (ADR-02) |
| `salesperson_id` | `NOT NULL` → nullable | đơn web không có tư vấn viên (A-04) |
| `sales_channel_id` | mới, FK `sales_channels` | nguồn đơn (ADR-03) |
| `external_order_id` | mới, nullable, unique theo (org, kênh) | chống trùng |
| `shipping_fee` | mới, `numeric(18,2)` default 0 | phí GH thu khách (ADR-04) |
| `recipient_name`, `recipient_phone` | mới | người nhận ≠ người mua |
| `ship_province_code`, `ship_province_name` | mới | snapshot (ADR-05) |
| `ship_ward_code`, `ship_ward_name` | mới | snapshot |
| `ship_address_line` | mới | số nhà / đường |

Cửa ghi: `PartnerOrderV2Controller`, route `partner/orders`, `@Version('2')`,
`@ApiSecurity('api-key')`, `@RequirePermission(PARTNER_ORDER_PERMISSION)` —
cùng khuôn với `PartnerProductV2Controller` đã chạy. Đặt **trong module
`sales-order`**, không tạo module mới: nó gọi thẳng `SalesOrderService`, và tách
module chỉ để đổi tiền tố route là chia đôi một service.

Đường partner tạo đơn với `branchId = null`, `salespersonId = null`,
`status = SENT`, và **không gọi engine khuyến mãi** — đơn web dùng giá niêm yết
(`items.selling_price`), chốt tại thời điểm đặt.

### 3. Điều phối: một bước riêng, không phải `approve`

```
POST /admin/sales-orders/:id/dispatch   { branchId }      → branch_id := branchId
POST /admin/sales-orders/:id/return     { reason }        → branch_id := NULL
```

Ràng buộc: **không** đụng `PosSessionService`. `approve()` vẫn là việc của thu
ngân và vẫn ném `NO_OPEN_SESSION` như hôm nay — đó là đúng, chỉ là nó không nằm
trên đường điều phối nữa (ADR-02).

Mọi lần phân / trả về ghi một dòng:

```
sales_order_dispatch_events
  sales_order_id, action (DISPATCH | RETURN), from_branch_id, to_branch_id,
  actor_user_id, reason, created_at
```

Bảng riêng chứ không thêm cột vào `sales_orders`: một đơn bị trả về hai lần thì
cột chỉ giữ được lần cuối (A-06).

### 4. Phí giao hàng đi lên hoá đơn

`invoices` thêm `shipping_fee_amount numeric(18,2) default 0`, và
`computeAmountDue` đổi:

```
due = max(0, subtotal − discount − pointsDiscount − deposit) + shippingFee
```

`max(0, …)` **bọc riêng phần tiền hàng**, không bọc tổng — nếu chiết khấu ăn hết
tiền hàng thì phí giao vẫn phải thu (AC-25). Đây là điểm khác công thức hiện tại,
vốn clamp toàn bộ biểu thức.

Ba nơi phải khớp nhau, và code đã cảnh báo sẵn là không có gì ép chúng khớp:

| Nơi | File |
|---|---|
| nguồn | `pos/services/invoice-amount.util.ts` → `computeAmountDue` |
| sinh đôi SQL (filter + `SUM()` footer) | cùng file → `invoiceSignedTotalSql` |
| sinh đôi frontend | `pos-web/src/lib/common/invoiceAmount.ts` |

`computeAmountDue` có 7 nơi gọi trong production (`promotion-apply.service`,
`compute-totals.step`, `clamp-points.step`, `checkout-invoice.service`,
`points-redemption.service`, `invoice.service`, và chính util). Sửa một hàm, xác
minh 7 chỗ, đồng bộ 2 bản sinh đôi — AC-26 là cái chặn.

### 5. Huỷ đơn: gọi lại đường đảo đã có

```
SalesOrderService.cancel(id, reason):
    nếu order.invoiceId != null:
        CancelInvoiceService.cancel(order.invoiceId, { reason })   ← đảo trọn gói
    order.status := CANCELLED
```

`CancelInvoiceService` đã tự làm: bút toán kho đảo (`INVOICE_CANCEL`), claw back
`pointsEarned`, trả lại `pointsRedeemed`, tất toán `invoice_debts`, bắn
`invoice.cancelled`. Không viết đường đảo mới, không sửa hoá đơn đã phát hành
(ADR-06).

### 6. Ba màn hình, ba phạm vi

`/orders` hiện có (`ORDER_COLUMNS` 27 cột = ảnh 1, `OrdersColumnSettingsDialog`
= ảnh 3) đổi nguồn từ `_mock/orders.mock.ts` sang API thật. Thêm một cột
`branchName` cho hai màn Admin. Ẩn 8 cột vận chuyển/đối soát/sàn khỏi dialog —
**ẩn, không xoá** khỏi `ORDER_COLUMNS` (A-20).

| Route | Ai | Phạm vi | Quyền |
|---|---|---|---|
| `/orders/dispatch` *(mới)* | Admin | `branch_id IS NULL` | `pos.sales-order.dispatch` |
| `/orders/all` *(mới)* | Admin | toàn chuỗi + cột Chi nhánh | `pos.sales-order.read-all` |
| `/orders` *(có sẵn)* | chi nhánh | `branch_id = actor.branchId` | `pos.sales-order.read` |

### 7. Duyệt đơn ở chi nhánh (đợt 2 — US-09, đổi chỗ lần 2)

Akenzy 2026-09-24: "điều phối thì không có duyệt đơn, duyệt đơn phải bên đơn hàng".
Luồng mới:

```
pool ──dispatch (không cần duyệt)──▶ chi nhánh: Chờ duyệt ──confirm──▶ Đã duyệt ──approve() (thu ngân)──▶ PROCESSED
  ▲                                        │
  └──────── returnToPool (xoá duyệt) ──────┘
```

Tên trong code vẫn là **`confirm`** (không trùng `approve()` của thu ngân). Cột giữ
nguyên như ADR-08: `confirmed_at`, `confirmed_by`; `status` giữ `SENT`.

```
POST /mobile/sales-orders/:id/confirm          BranchScopeGuard, quyền pos.sales-order.approve (A-46)
POST /mobile/sales-orders/stock-check          { orderIds[] } — tồn TẠI actor.branchId (A-44)
```

- `confirm()`: `status = SENT AND branch_id = actor.branchId AND salesperson_id IS NULL`
  (đơn web — A-43), khác đi là 409 `ORDER_NOT_CONFIRMABLE` (đơn chi nhánh khác: 403
  `ORDER_NOT_HELD_BY_BRANCH`, như `returnToPool`). Duyệt lại là no-op.
- `approve()` (thu ngân): đơn web có `confirmed_at IS NULL` → 409 `ORDER_NOT_CONFIRMED`,
  trước khi đụng `PosSessionService` hay tạo nháp (A-42). Đơn tư vấn viên bỏ qua kiểm.
- `dispatch()`: **bỏ** guard `ORDER_NOT_CONFIRMED` (A-41).
- `returnToPool()`: **xoá** `confirmed_at/by` (A-45); lịch sử giữ dòng `CONFIRM` cũ.
- Đường Admin `POST /admin/sales-orders/:id/confirm` **bị gỡ** — duyệt không còn là
  việc cấp tổ chức.
- Lịch sử: dòng `CONFIRM` từ nay mang `to_branch_id = branch đang giữ đơn`? — **Không**:
  CHECK hiện tại đòi CONFIRM có from/to NULL; giữ nguyên, người duyệt và thời điểm đủ
  để truy vết (chi nhánh suy từ `DISPATCH` ngay trước).

UI: nút "Duyệt đơn" + `ConfirmOrdersDialog` chuyển từ `/orders/dispatch` sang `/orders`
(lưới chi nhánh), cột trạng thái hiện "Chờ duyệt / Đã duyệt" **chỉ cho đơn web**.
POS: đơn web chưa duyệt vẫn hiện, mang nhãn "Chờ duyệt"; xử lý thì báo lỗi (A-47).

### 8. Đối chiếu tồn: một phép tính, ba chỗ dùng (US-09, US-10, US-11)

```
StockAvailabilityService.forItems(orgId, itemIds, branchId?)
  → Map<itemId, available>       SUM(stock_balances.quantity)
                                 WHERE organization_id = :org AND item_id = ANY(:ids)
                                   [AND branch_id = :branch]
```

Không lọc `is_tracked`, số âm cộng nguyên (A-34). Không trừ đơn đang chờ (A-33).
Dùng index có sẵn `IDX_stock_balances_org_branch_item`.

| Chỗ dùng | Phạm vi | Khi nào |
|---|---|---|
| Nhận đơn đối tác (US-10) | toàn chuỗi | trong transaction `createFromPartner`, ghi snapshot |
| Cảnh báo duyệt (US-09) | chi nhánh đang giữ đơn (A-44) | đọc sống trước khi confirm, qua `POST /mobile/sales-orders/stock-check` |
| Validate (US-11) | chi nhánh đã chọn **của từng đơn** | đọc sống, không ghi gì |

Hai chỗ đọc sống đi qua MỘT endpoint:

```
POST /admin/sales-orders/stock-check
  { orders: [{ orderId, branchId? }] }       branchId vắng = toàn chuỗi
→ { orders: [{ orderId, branchId, sufficient, shortLineCount,
               lines: [{ itemCode, itemName, required, available, shortBy }] }] }
```

POST vì body là danh sách (một trang lưới tới 100 đơn), không phải vì nó ghi —
nó không ghi gì, và nằm ngoài `IdempotencyInterceptor` là vô hại. Server trả
đơn **đã xếp** đủ → thiếu (`shortLineCount` tăng dần, rồi theo mã đơn), dòng đủ
trước dòng thiếu (A-39) — thứ tự là nghiệp vụ, không để hai dialog tự xếp mỗi
nơi một kiểu.

Snapshot lúc nhận đơn (A-35):

```
sales_orders.stock_short             boolean NOT NULL DEFAULT false
sales_order_lines.chain_stock_at_intake  numeric NULL   -- NULL = đơn không qua kiểm (mobile, đơn cũ)
```

`stock_short = true` khi có ít nhất một dòng `quantity > chain_stock_at_intake`.
Gộp các dòng trùng `itemCode` trước khi so. Response đối tác không đổi (A-36).

### 9. Điều phối: tick đơn → dialog chọn chi nhánh từng đơn (US-11, lần 3)

Akenzy 2026-09-24 (lần 3): không muốn cột chọn chi nhánh nằm sẵn trên lưới. Luồng:

```
Lưới Điều phối (chỉ ô tick) ──tick n đơn──▶ [Điều phối (n)] ──▶ DispatchOrdersDialog
   | Mã đơn | Người nhận | Chi nhánh [▾ điền cả DS] |      footer: [Validate] [Lưu]
```

- Không đổi API ghi: mỗi dòng dialog gọi `POST /admin/sales-orders/:id/dispatch
  { branchId }` với chi nhánh của chính dòng đó (ADR-11 giữ nguyên).
- State `Record<orderId, branchId>` là state của **dialog**, sinh ra khi mở, mất khi
  đóng. Danh sách đơn chụp lại lúc mở (như `DispatchBranchDialog` cũ) — invalidate sau
  Lưu làm đơn rời lưới, nhưng dialog vẫn phải cầm được dòng để báo kết quả.
- Ô đầu cột điền cho mọi dòng trong dialog (A-48); sửa riêng từng dòng được.
- Validate mở `ValidateDispatchDialog` (có sẵn) với các dòng đã chọn chi nhánh.
- Lưu: dòng chưa chọn bỏ qua; thành công → dòng hiện "Đã phân về …"; lỗi → dòng giữ
  chi nhánh + lỗi tại dòng, dialog giữ mở (AC-45). Tất cả thành công → đóng + toast.
- `BranchPickerColumn.tsx` và prop `extraColumn` của `OrdersPageTable` bị gỡ — lưới
  Điều phối trở về DOM của lưới `/orders`.
- Nhãn "Thiếu hàng" giữ trên lưới (đọc `stock_short`, AC-39).

### 10. Lịch sử đơn — ghép lúc đọc, không ghi thêm (US-12)

```
GET /admin/sales-orders/:id/history     quyền dispatch HOẶC read-all, mọi đơn trong tổ chức
GET /mobile/sales-orders/:id/history    BranchScopeGuard, quyền read; chỉ đơn branch_id = actor.branchId
→ { orderId, orderCode, currentStatus, entries: [
     { at, kind, actorName, branchName?, fromBranchName?, reason?, invoiceCode?, statusAfter } ] }
kind ∈ RECEIVED | DISPATCHED | CONFIRMED | RETURNED | PROCESSED | REJECTED | CANCELLED
```

`SalesOrderHistoryService.timeline(orderId, actor)`:

| Mốc | Nguồn | Lặp? |
|---|---|---|
| RECEIVED | `created_at`, `created_by` (đơn web: tên kênh `sales_channel`, A-54) | 1 |
| DISPATCHED / RETURNED / CONFIRMED | `sales_order_dispatch_events` theo `created_at` | nhiều |
| PROCESSED | `approved_at`, `approved_by`, `invoice_id` → mã hoá đơn | 1 |
| REJECTED / CANCELLED | `rejected_at/by/reason`, `cancelled_at/by/reason` | 1 |

Xếp theo `at`; mốc cùng thời điểm xếp theo thứ tự vòng đời. `statusAfter` tính khi đi
qua dòng thời gian (Chờ phân → Chờ duyệt → Đã duyệt → Chờ phân … → Đã xử lý / Đã huỷ /
Từ chối). Chi nhánh của CONFIRMED = `to_branch_id` của DISPATCHED gần nhất trước nó.
Tên người: một câu `users` cho mọi id; tên chi nhánh: một câu `branches`.

UI: `OrderHistoryModal` dùng chung; nút "Lịch sử" (lucide `History`) trên toolbar của
`/orders/dispatch`, `/orders/all` (màn này chưa có toolbar — thêm), `/orders`; áp cho
dòng đang chọn (`focusedOrderId`), khoá khi chưa chọn (A-52).

## Alternatives rejected

| Option | Why not |
|---|---|
| Bảng `online_orders` riêng, tách khỏi `sales_orders` | Hai miền đơn song song ⇒ mọi báo cáo doanh thu, công nợ và truy nguồn phải hợp nhất hai nguồn; `sales_orders` đã có vòng đời, số chứng từ, dòng hàng và `approve()` tạo hoá đơn nháp |
| Bảng hàng chờ `unassigned_orders`, chuyển sang `sales_orders` khi phân | Cùng dữ liệu ở hai nơi tuỳ trạng thái; mọi truy vấn phải UNION, và lúc chuyển bảng là một transaction mất số chứng từ |
| Gộp điều phối vào `approve()` | `approve()` cần ca POS đang mở (`NO_OPEN_SESSION`); Admin phân đơn 7h sáng sẽ fail sạch |
| Nới `BranchScopeGuard` trên `/mobile/sales-orders` để Admin xem toàn chuỗi | Mở luôn phạm vi cho app tư vấn viên ⇒ rò đơn giữa các chi nhánh (A-09) |
| Kênh bán là enum trong `sales_order_status_enum` style | Mỗi lần mở sàn mới là một migration enum — trái điều kiện "scale mở ra" |
| Chi nhánh "Kênh online" ảo làm phạm vi tính CTKM | Đẻ một branch không có kho, phải loại trừ khỏi mọi báo cáo tồn và doanh thu theo chi nhánh; và CTKM đã bị loại khỏi đợt này |
| Phí GH lưu trên đơn, không lên hoá đơn | Akenzy bác 2026-09-20 (A-16). Đánh đổi đã ghi ở ADR-04 |
| FK `sales_orders.ship_ward_code → geo_wards.code` | `geo_wards` mang `merged_from` cho đợt sáp nhập 2026; FK cứng vỡ ở đợt sáp nhập sau, và tên phường trên chứng từ cũ tự đổi theo dataset mới |
| Duyệt = giá trị enum mới `APPROVED` trong `sales_order_status_enum` | Đơn đã phân rồi vẫn phải là `APPROVED` ⇒ `approve()` của thu ngân (`status !== SENT`), lưới chi nhánh, filter `sent` của app mobile và `transition()` đều phải học trạng thái mới; AC-10 ("status vẫn SENT") đổi nghĩa. Xem ADR-08 |
| Nhãn thiếu hàng tính sống lúc đọc lưới | Mỗi dòng lưới một subquery `SUM(stock_balances)`; nhãn nhảy theo tồn khiến người điều phối không biết đơn "lúc vào" có thiếu không. Màn duyệt/Validate đã đọc sống cho việc quyết định (A-35) |
| Cột chọn chi nhánh inline trên lưới Điều phối | Đã làm (T-10-01) rồi Akenzy bác 2026-09-24 (lần 3): người điều phối muốn chọn đơn trước, rồi mới quyết chi nhánh cho đúng các đơn đó (A-48) |
| Ghi thêm sự kiện PROCESS / CANCEL / REJECT vào `sales_order_dispatch_events` cho lịch sử | Ba mốc đó xảy ra đúng một lần và đơn đã lưu người + giờ + lý do; ghi thêm là trùng dữ liệu, cần migration enum + CHECK, và đơn cũ vẫn không có — ghép lúc đọc cho đủ cả đơn cũ (ADR-14) |
| Endpoint batch `POST /admin/sales-orders/dispatch { items[] }` | Một transaction cho cả mẻ ⇒ một đơn hỏng kéo cả mẻ, hoặc phải tự chế partial-success. Vòng lặp per-id đã có, đã có báo lỗi từng dòng, và mỗi call có idempotency key riêng |
| Trừ SL các đơn đang chờ khỏi tồn | Akenzy bác 2026-09-24 (A-33); reservation ngoài phạm vi (intent) |
| Thêm trạng thái giao hàng (Chờ giao → Đang giao → Chờ thu COD) | Akenzy chốt: đơn hỏng thì huỷ, huỷ tự rollback. Vòng đời giao hàng ngoài phạm vi |

## Contracts

### Partner — `POST /partner/orders` (v2, api-key)

```
Request
  externalOrderId   string        bắt buộc — khoá chống trùng theo kênh
  customer          { name, phone, email? }      phone là khoá khớp (A-01)
  recipient         { name, phone }
  shipping          { provinceCode, wardCode, addressLine, fee }
  lines[]           { itemCode, quantity }       mã SKU (T-01-08); đơn giá server tự chốt
  note?             string

Response 201
  id, documentNumber, status, amountDue, shippingFee, lines[]

Response 200  — externalOrderId đã tồn tại: trả lại đơn cũ, không tạo mới
```

Đơn giá **không** nhận từ đối tác. Server đọc `items.selling_price` tại thời
điểm nhận và chốt vào dòng hàng — đối tác gửi giá là đối tác định giá.

### Admin — org-scoped, không `BranchScopeGuard`

```
GET  /admin/sales-orders?unassigned=true      → pool          (dispatch)
GET  /admin/sales-orders                      → toàn chuỗi    (read-all)
POST /admin/sales-orders/:id/dispatch  { branchId }
POST /admin/sales-orders/:id/return    { reason }
POST /admin/sales-orders/:id/cancel    { reason }
POST /admin/sales-orders/stock-check  { orders[] }        (đợt 2, dispatch)
```

Đợt 2 thêm vào view của đơn: `stockShort` (Admin), `confirmedAt` (chi nhánh + Admin); vào view dòng:
`chainStockAtIntake`. Filter pool thêm `confirmed=true|false` (tuỳ chọn).

### Chi nhánh — không đổi surface

`/mobile/sales-orders` giữ nguyên controller, guard và phạm vi. Đơn
`branch_id IS NULL` tự vô hình với nó vì `list()` đã hard-filter theo branch.

## Error taxonomy

| Code | HTTP | Khi nào | Ai thấy |
|---|---|---|---|
| `CHANNEL_INACTIVE` | 403 | API key trỏ tới kênh `is_active = false` | đối tác |
| `GEO_CODE_UNKNOWN` | 400 | `provinceCode`/`wardCode` không có trong `geo_*` | đối tác |
| `ORDER_LINE_ITEM_UNKNOWN` | 400 | `itemCode` không thuộc tổ chức (so khớp đúng ký tự) | đối tác |
| *(replay)* | 200 | `externalOrderId` đã tồn tại — trả lại đơn cũ | đối tác |
| `ORDER_NOT_DISPATCHABLE` | 409 | status ≠ `SENT` | Admin |
| `ORDER_ALREADY_DISPATCHED` | 409 | `dispatch` trên đơn đã có `branch_id` | Admin |
| `ORDER_HAS_INVOICE` | 409 | `return`/`dispatch` lại trên đơn đã phát hành hoá đơn | Admin, chi nhánh |
| `ORDER_NOT_DISPATCHED` | 409 | `return` trên đơn KHÔNG có chi nhánh nào giữ (đang ở pool, hoặc thua cuộc đua đồng thời) — khác `ORDER_NOT_DISPATCHABLE`, vốn là `status ≠ SENT` | Admin, chi nhánh |
| `ORDER_NOT_CONFIRMED` | 409 | *(đợt 2)* thu ngân `approve()` đơn web chưa duyệt (A-42) | chi nhánh |
| `ORDER_NOT_CONFIRMABLE` | 409 | *(đợt 2)* `confirm` trên đơn không phải `SENT`, không có chi nhánh, hoặc là đơn tư vấn viên (A-43) | chi nhánh |
| `ORDER_NOT_HELD_BY_BRANCH` | 403 | chi nhánh thao tác trên đơn không thuộc mình | chi nhánh |
| `NO_OPEN_SESSION` | 409 | *(đã có)* `approve()` khi chi nhánh chưa mở ca | chi nhánh |
| `INVOICE_NOT_CANCELLABLE` | 409 | *(đã có)* huỷ hoá đơn ngoài `CANCELLABLE_STATUSES`, hoặc đã có trả hàng tất toán | Admin |

Lỗi trả cho đối tác mang `code` máy đọc được; lỗi cho người dùng ERP mang thêm
`message` tiếng Việt.

## ADRs

### ADR-01 — Mở rộng `sales_orders`, không dựng miền đơn thứ hai
**Context:** Đơn web cần vòng đời duyệt, số chứng từ, dòng hàng, và phải ra hoá
đơn POS. `sales_orders` đã có đủ cả bốn, cộng `approve()` tạo hoá đơn nháp trong
cùng transaction.
**Decision:** Thêm cột vào `sales_orders`/`sales_order_lines`, không tạo bảng đơn
mới. Phân biệt đơn web với đơn tư vấn viên bằng `sales_channel_id` và
`salesperson_id IS NULL`.
**Consequences:** `sales_orders` rộng thêm ~10 cột, trong đó 7 cột chỉ có nghĩa
với đơn giao hàng. Đổi lại: một nguồn sự thật cho doanh thu, công nợ và truy
nguồn. Migration phải nới `salesperson_id` về nullable — không hồi tố được nếu
sau này muốn siết lại.
**Status:** accepted

### ADR-02 — Điều phối là bước riêng, tách hẳn khỏi `approve`
**Context:** `approve()` gọi `PosSessionService.findOpenForBranch()` và ném
`NO_OPEN_SESSION` khi chi nhánh chưa mở ca (`pos-session.service.ts:118-122`).
Admin phân đơn ngoài giờ mở ca là tình huống thường, không phải ngoại lệ.
**Decision:** `dispatch` chỉ set `branch_id`. Không chạm `PosSessionService`,
không tạo hoá đơn nháp. `approve()` giữ nguyên hành vi và vẫn do thu ngân chạy.
**Consequences:** Có hai bước người dùng thay vì một; đơn ngồi ở chi nhánh với
`status = SENT` cho tới khi thu ngân mở ca. Đó là trạng thái đúng — hàng chưa
rời kho.
**Status:** accepted

### ADR-03 — Kênh bán là bảng đăng ký; chứng từ giữ snapshot chuỗi
**Context:** `sales_orders.sales_channel` đang là varchar tự do NOT NULL.
Yêu cầu: thêm Shopee/TikTok/Lazada về sau không migration, và đối tác retry
không đẻ đơn trùng.
**Decision:** Bảng `sales_channels` org-scoped (đăng ký qua generic CRUD
platform). `sales_orders.sales_channel_id` FK vào đó, đồng thời **giữ**
`sales_channel varchar` làm snapshot nhãn. `invoices.sales_channel` (đã có) nhận
snapshot, không FK. Chống trùng bằng `UNIQUE (organization_id, sales_channel_id,
external_order_id)`.
**Consequences:** Nhãn kênh bị lưu hai nơi và có thể lệch nếu ai đó đổi tên kênh
— đó là *chủ đích*: chứng từ cũ phải giữ tên cũ. Báo cáo TRÊN ĐƠN (`sales_orders`) join qua `sales_channel_id`; báo cáo TRÊN CHỨNG TỪ (`invoices`) **group theo chuỗi snapshot** — `invoices` cố tình KHÔNG có `sales_channel_id`, và join sẽ làm hoá đơn cũ của một kênh bị đổi tên hoá trống, đúng thứ snapshot sinh ra để tránh.
`sales_channel_id`, không group theo chuỗi.
**Status:** accepted

### ADR-04 — Phí giao hàng nằm trên `invoices`
**Context:** `invoices` không có cột phí nào — EPIC-14062026 đã khảo sát và ghi
"Tiền phí — PLACEHOLDER 0 (không có cột phí)". Hai đường: để phí trên đơn (rẻ,
nhưng số shipper thu ≠ tổng hoá đơn), hoặc đưa lên hoá đơn (đúng kế toán, đắt).
**Decision:** Akenzy chốt 2026-09-20: **lên hoá đơn**, ngược khuyến nghị của bản
thiết kế. `invoices.shipping_fee_amount`, và `computeAmountDue` cộng phí SAU khi
clamp phần tiền hàng về 0.
**Consequences:** Migration `invoices`; sửa `computeAmountDue` (7 nơi gọi
production) và đồng bộ hai bản sinh đôi `invoiceSignedTotalSql` +
`pos-web/.../invoiceAmount.ts` — comment trong code ghi rõ không có gì ép ba bản
khớp, và từng lệch thật một lần (26.337.000 đúng vs 28.927.000 sai). Đổi lại:
`invoice_debts.original_amount` bằng đúng số shipper phải thu, cột "Thu hộ" là
`amount_due` chứ không phải một phép cộng tay, và `revenue.fee` của
EPIC-14062026 có backing thật. Phí không vào doanh thu hàng hoá — tài khoản
hạch toán còn treo ở A-21.
**Status:** accepted

### ADR-05 — Địa chỉ giao là snapshot trên đơn, không FK sang `geo_*`
**Context:** `geo_wards` mang `merged_from` cho đợt sáp nhập địa giới 2026 —
dataset địa giới là thứ *đổi*, không phải thứ cố định. `customers.address` là
một dòng text và thuộc về khách, không thuộc về đơn.
**Decision:** Đơn giữ `ship_province_code/name`, `ship_ward_code/name`,
`ship_address_line` — mã để lọc/đối chiếu, tên để in. Không FK.
**Consequences:** Tên trên đơn cũ không tự cập nhật khi địa giới đổi tên — đúng
ý muốn. Đổi lại: mã có thể trỏ tới phường đã sáp nhập; màn hình phải chịu được
việc tra `geo_wards` theo mã cũ trả rỗng, và khi đó hiển thị tên đã snapshot.
**Status:** accepted

### ADR-06 — Huỷ đơn gọi lại `CancelInvoiceService`, không viết đường đảo mới
**Context:** Hoá đơn đã phát hành là bất biến theo quy tắc repo; sửa nó để
"rollback" là vi phạm. Đường đảo đã tồn tại và đã chạy production.
**Decision:** `SalesOrderService.cancel()` gọi `CancelInvoiceService.cancel()`
khi đơn đã có `invoiceId`, rồi set `sales_orders.status = CANCELLED`. Giữ nguyên
mọi chặn của service đó (`CANCELLABLE_STATUSES`, `assertNoSettledReturns`).
**Consequences:** Huỷ đơn thừa hưởng cả giới hạn lẫn hành vi của huỷ hoá đơn —
gồm cả việc một đơn đã hoàn một phần qua trả hàng thì không huỷ được. Đó là chặn
đúng: hoàn tiền hai lần cho một đơn là lỗi tiền.
**Status:** accepted

### ADR-07 — Đường đọc cấp tổ chức là controller mới, không nới guard cũ
**Context:** `/mobile/sales-orders` dùng `BranchScopeGuard` và `list()`
hard-filter `so.branchId = actor.branchId` (`sales-order.service.ts:271`). App
tư vấn viên đang dựa vào đúng ràng buộc đó.
**Decision:** Thêm `AdminSalesOrderController` (`/admin/sales-orders`) không
`BranchScopeGuard`, quyền riêng `pos.sales-order.dispatch` và
`pos.sales-order.read-all`. Controller cũ không sửa một dòng.
**Consequences:** Hai controller đọc cùng một bảng với hai phạm vi — việc sửa
hình dạng dữ liệu phải sửa hai nơi. Đổi lại: không có cách nào một lỗi phân
quyền ở đường Admin làm rò đơn sang app tư vấn viên.
**Status:** accepted

### ADR-08 — "Đã duyệt" là cột `confirmed_at`, không phải trạng thái enum mới
**Context:** Akenzy chọn "trạng thái mới APPROVED" (2026-09-24). Nhưng đơn sau
khi duyệt còn đi tiếp: phân về chi nhánh, rồi thu ngân `approve()` ra hoá đơn.
`approve()` guard `status !== SENT` (`sales-order.service.ts:1041`), bảng
`transition()` (`:200`), lưới chi nhánh và app mobile đều lọc theo `SENT`. Một
giá trị enum `APPROVED` sẽ phải chảy qua tất cả chỗ đó, hoặc bị đổi ngược về
`SENT` lúc phân — tức là mất dấu "đã duyệt" đúng lúc cần nó.
**Decision:** Akenzy chốt 2026-09-24: `sales_orders.confirmed_at` +
`confirmed_by`. `status` không đổi. UI hiển thị "Chờ duyệt" / "Đã duyệt" từ
`confirmed_at` — với người dùng, đó vẫn là một trạng thái.
**Consequences:** Không đụng app mobile, luồng thu ngân, `transition()` hay enum
trạng thái; AC-10 giữ nguyên. Cái giá: "trạng thái" hiển thị là dẫn xuất từ hai
cột (`status` + `confirmed_at`), và ai lọc báo cáo theo `status` sẽ không thấy
"Đã duyệt" ở đó.
**Status:** accepted

### ADR-09 — Một dịch vụ đối chiếu tồn, một endpoint đọc cho cả duyệt và Validate
**Context:** Ba chỗ cần cùng một câu hỏi "món này còn bao nhiêu" — nhận đơn
(toàn chuỗi), duyệt (toàn chuỗi), Validate (theo chi nhánh). Hai dialog còn cần
cùng một thứ tự đủ → thiếu.
**Decision:** `StockAvailabilityService` trong `sales-order/` đọc thẳng
`stock_balances`; `POST /admin/sales-orders/stock-check` nhận `branchId` tuỳ
chọn theo từng đơn và trả kết quả đã xếp.
**Consequences:** Hai dialog chỉ vẽ, không tính. Một chỗ sai là sai cả ba —
đó là chủ đích: ba con số lệch nhau còn tệ hơn.
**Status:** accepted

### ADR-10 — Nhãn thiếu hàng là snapshot ghi lúc nhận đơn
**Context:** Task 2 nói "gán một nhãn" lúc tạo đơn. A-35.
**Decision:** `createFromPartner` tính tồn toàn chuỗi trong cùng transaction,
ghi `sales_order_lines.chain_stock_at_intake` và `sales_orders.stock_short`.
Không job nào cập nhật lại.
**Consequences:** Nhãn có thể "cũ" sau khi nhập hàng (AC-38) — màn duyệt đọc
sống nên quyết định vẫn đúng. Đơn cũ và đơn mobile: `stock_short = false`,
`chain_stock_at_intake = NULL`, không backfill.
**Status:** accepted

### ADR-11 — Chọn chi nhánh từng đơn không thêm API ghi
**Context:** Frontend đã phân từng đơn một, mỗi đơn một request
(`use-admin-sales-orders.ts:209`).
**Decision:** Giữ `POST /admin/sales-orders/:id/dispatch`. `useDispatchSalesOrders`
nhận `Array<{ orderId, branchId }>` thay vì `{ orderIds, branchId }`. Bỏ
`DispatchBranchDialog`.
**Consequences:** Không migration, không e2e backend mới cho phần ghi của US-11.
Mẻ 100 đơn = 100 request tuần tự — chấp nhận được với lưu lượng điều phối tay.
**Status:** accepted

### ADR-12 — Duyệt đơn là việc của chi nhánh, trên controller chi nhánh
**Context:** Akenzy 2026-09-24 (lần 2) chuyển duyệt khỏi màn Điều phối: đơn phân về
chi nhánh trước, chi nhánh duyệt, thu ngân chỉ xử lý đơn đã duyệt (A-41, A-42).
ADR-07 ghi `/mobile/sales-orders` "không sửa một dòng" — lý do là **không nới phạm
vi** của controller đó sang cấp tổ chức.
**Decision:** Thêm `POST /mobile/sales-orders/:id/confirm` và
`POST /mobile/sales-orders/stock-check` vào controller chi nhánh, giữ nguyên
`BranchScopeGuard`, quyền `pos.sales-order.approve` (A-46). Gỡ
`POST /admin/sales-orders/:id/confirm`. Admin `stock-check` giữ cho Validate.
Guard `ORDER_NOT_CONFIRMED` dời từ `dispatch()` sang `approve()`.
**Consequences:** ADR-07 được nới đúng một nghĩa: thêm route **cùng phạm vi chi
nhánh**, không thêm đường nhìn xuyên chi nhánh. `approve()` — đường tạo hoá đơn đã
chạy production — có thêm một điều kiện chặn; chỉ áp cho đơn web
(`salesperson_id IS NULL`), đơn tư vấn viên không đổi. Toàn bộ e2e đã sửa fixture ở
T-09-04 ("duyệt trước khi phân") phải đổi lại thành "phân, rồi duyệt ở chi nhánh".
**Status:** accepted

### ADR-13 — Chọn chi nhánh từng đơn trong dialog, không trên lưới
**Context:** T-10-01 đặt ô chọn chi nhánh vào cột đầu của lưới Điều phối (ghép chung
cột tick vì `BaseDataTable` không nhận header là component). Akenzy 2026-09-24 (lần 3):
"tick đơn xong rồi select từng item, bấm Điều phối mới phân chi nhánh".
**Decision:** Lưới chỉ có ô tick. Nút "Điều phối (n)" mở `DispatchOrdersDialog` với
đúng các đơn đã tick: một ô chọn mỗi dòng + một ô đầu cột điền cả danh sách, footer
[Validate] [Lưu]. Gỡ `BranchPickerColumn` và prop `extraColumn` khỏi `OrdersPageTable`.
**Consequences:** Hết vấn đề "cột chọn ghép vào cột tick" của T-10-01; lưới Điều phối
dùng lại nguyên lưới `/orders`. Đổi lại: muốn phân khác nhau cho nhiều đơn phải mở
dialog — nhưng đó đúng là thứ tự thao tác người điều phối yêu cầu. API không đổi.
**Status:** accepted

### ADR-14 — Lịch sử đơn ghép lúc đọc từ sự kiện điều phối + cột của đơn
**Context:** US-12 cần đủ vòng đời. Bảng sự kiện chỉ có DISPATCH / RETURN / CONFIRM; các
mốc xử lý, huỷ, từ chối đang nằm ở cột `*_at/*_by/*_reason` của `sales_orders`.
**Decision:** Không ghi thêm. `SalesOrderHistoryService` ghép hai nguồn lúc đọc, qua hai
route: Admin (`/admin/sales-orders/:id/history`) và chi nhánh
(`/mobile/sales-orders/:id/history`, chỉ đơn chi nhánh đang giữ — A-53).
**Consequences:** Không migration, đơn cũ có lịch sử ngay. Nếu sau này một mốc "một lần"
thành lặp được (vd mở lại đơn đã huỷ) thì phải chuyển mốc đó sang bảng sự kiện. Controller
chi nhánh thêm một route đọc — cùng phạm vi, như ADR-12.
**Status:** accepted
