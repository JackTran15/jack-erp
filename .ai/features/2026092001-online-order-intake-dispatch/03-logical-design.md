---
feature: online-order-intake-dispatch
adrs: 7
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
```

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
