---
feature: pos-order-delivery-lifecycle
adrs: 7
---

# Logical design — Đơn hàng + Đơn hàng Online trên POS, có vòng đời giao hàng

## Approach

Không có miền đơn mới. Feature là **một trục trạng thái giao đặt cạnh
`sales_orders.status`**, một danh mục đối tác giao hàng, một endpoint tìm kiếm
CQRS cho POS, vài action ghi trên `SalesOrderService`, và hai trang pos-web.

### 1. Dữ liệu — một migration

`delivery_partners` (mới, org-scoped, soft delete, CRUD qua generic platform —
ADR-02):

| Cột | Kiểu |
|---|---|
| `code` | varchar(32), unique (organization_id, code) where deleted_at is null |
| `name` | varchar(200) |
| `is_active` | boolean default true |

`sales_orders` thêm (ADR-01):

| Cột | Kiểu | Ghi khi |
|---|---|---|
| `delivery_status` | enum `sales_order_delivery_status_enum` nullable | `approve` set `AWAITING_PICKUP`; các action giao |
| `delivered_at` | timestamptz null | → `IN_TRANSIT` lần đầu (cột "Ngày GH") |
| `delivery_partner_id` | uuid null, FK `delivery_partners` | Giao hàng — **tuỳ chọn** (Akenzy 2026-09-24) |
| `delivery_partner_name` | varchar(200) null | snapshot tên lúc giao |
| `tracking_code` | varchar(100) null | Giao hàng (nhập tay) |
| `partner_shipping_fee` | numeric(18,2) **null**, không default | Giao hàng — "Phí GH trả ĐT", tuỳ chọn; NULL = chưa biết, khác 0 |
| `package_info` | varchar(500) null | Giao hàng — "Thông tin gói hàng" |

Index `(organization_id, branch_id, delivery_status)`.

`sales_order_dispatch_action_enum` thêm `PROCESS`, `DELIVER`, `DELIVERY_STATUS`
(ADR-06). Postgres `ALTER TYPE … ADD VALUE` không dùng được giá
trị mới trong cùng transaction — migration chỉ thêm giá trị, không ghi dữ liệu.

Backfill: đơn `PROCESSED` hiện có → `delivery_status = AWAITING_PICKUP` nếu hoá
đơn chưa huỷ, để chúng hiện trên lưới Đơn hàng thay vì biến mất.

### 2. Máy trạng thái giao

```
                 approve()
SENT ──────────────────────────▶ PROCESSED + AWAITING_PICKUP
                                        │ deliver (hoá đơn phải đã hoàn tất)
                                        ▼
                                   IN_TRANSIT ──────────────▶ COMPLETED (nợ = 0)
                                   │        │
                    shipper báo đã │        │ giao thất bại
                         giao      ▼        ▼
                           AWAITING_COD   FAILED ──▶ IN_TRANSIT (giao lại)
                                   │        │
      Cập nhật TT (Thu COD: sau) ▼        ▼ chuyển hoàn
                              COMPLETED   RETURNED + status CANCELLED
                                          (CancelInvoiceService — ADR-04)
```

Bảng chuyển nằm ở một hằng `DELIVERY_TRANSITIONS` trong
`sales-order.constants.ts`, cạnh `VALID_TRANSITIONS`. Mọi action đọc đơn với
`FOR UPDATE`, kiểm bảng, ghi đơn + event trong một transaction.

Chặn nghiệp vụ:
- `deliver` cần hoá đơn `is_draft = false` (A-05) → `INVOICE_NOT_FINALIZED`.
- `→ COMPLETED` cần `invoice_debts.remaining_amount = 0` hoặc không có debt
  (A-08) → `DEBT_OUTSTANDING`.
- `→ RETURNED` đi qua ADR-04.

### 3. API — branch-scoped

Đọc (ADR-03): **`POST /v2/mobile/sales-orders/search`** — CQRS
`SearchBranchSalesOrdersQuery` + handler, theo khuôn `SearchInvoicesV2Handler`
(skill `cqrs-search-endpoint`). Scope `organizationId` + `actor.branchId` cứng,
không nhận `branchId` từ body. Body:

```
{ view: 'ONLINE' | 'DELIVERY',
  channelId?, status?, deliveryTab?: <delivery_status> | 'CANCELLED' | 'PAID' | 'UNPAID',
  dateField: 'CREATED' | 'DELIVERED' | 'INVOICED', from?, to?,   // Asia/Ho_Chi_Minh
  stockShort?, columnFilters: FilterBuilder filters, page, limit ≤ 100 }
```

- `ONLINE`: `status <> DRAFT`, lọc theo `sales_channel_id`.
- `DELIVERY`: `delivery_status IS NOT NULL`.
- `PAID`/`UNPAID` join `invoices` + `invoice_debts` (ADR-05) — không lưu.
- Response mỗi dòng đủ 24 cột (A-11/A-12) + `id`, `invoiceId`, `debtId`,
  `deliveryStatus`, `invoiceIsDraft`, `remainingAmount`; kèm `total`.
- `tabCounts` **không** làm đợt này (ảnh không có số đếm trên tab).

Kênh cho sidebar: `GET /mobile/sales-channels` → kênh active của tổ chức.
Đối tác cho dialog: `GET /mobile/delivery-partners` → đối tác active.

Ghi — tất cả trên `SalesOrderController` (`/mobile/sales-orders`), guard hiện có,
**batch, mỗi đơn một transaction riêng**, trả `{ results: [{ id, ok, code?, message? }] }`
(ADR-07):

| Route | Permission | Làm gì |
|---|---|---|
| `POST process` `{ ids }` | `pos.sales-order.approve` | mỗi id: `confirm` nếu chưa + `approve` (A-01) |
| `POST deliver` `{ ids, deliveryPartnerId?, trackingCode?, partnerShippingFee?, packageInfo? }` | `pos.sales-order.deliver` (mới) | AWAITING_PICKUP/FAILED → IN_TRANSIT |
| `POST delivery-status` `{ ids, to, reason? }` | `pos.sales-order.deliver` | "Cập nhật TT"/"Hoàn thành" theo bảng; `to=RETURNED` → ADR-04 |

`approve()` sửa một dòng: set `deliveryStatus = AWAITING_PICKUP` trong cùng
update PROCESSED, và ghi event `PROCESS`.

### 4. pos-web

- Route `/orders` và `/online-orders` dưới `PosLayout`; gắn `route` vào hai mục
  menu đã có `don-hang`, `don-hang-online` (`pos-menu.constant.ts:32-51`).
- `pages/OrderListPage.tsx`, `pages/OnlineOrderListPage.tsx`;
  `components/page-components/{OrderList,OnlineOrderList}/…`;
  `hooks/page-hooks/{order-list,online-order-list}/…`;
  `services/sales-order.service.ts`; `hooks/react-query/use-query-sales-order.ts`;
  khoá trong `react-query-key.constant.ts`.
- Lưới: `PosDataTable` + `PosDataTableFilterCell` + `PosPaginationBar`, cột định
  nghĩa theo khuôn DS hoá đơn; dialog thiết lập cột như `InvoiceColumnSettingsDialog`.
- Dialog: `DeliverDialog` (đối tác + mã vận đơn + phí trả ĐT + gói hàng),
  `DeliveryStatusDialog` (Cập nhật TT),
  `BatchResultToast` (x/y thành công + lý do từng đơn).
- Bấm dòng "Chưa thanh toán/Lưu tạm" → mở hoá đơn nháp vào tab checkout bằng
  đường restore draft đã có (`use-query-invoice.ts:65`), không viết đường mới.
- Quyền: ẩn nút theo `currentUser.permissions` (khuôn
  `invoice-cancel.constant.ts`); backend là chặn thật.
- Nút ngoài phạm vi (Gửi đơn hàng, Thu COD, Gắn nhãn, Thống kê hàng hoá, In phiếu GH):
  disabled + tooltip "Chưa hỗ trợ".

### 5. Backoffice

Chỉ đăng ký CRUD `delivery-partners` (tự có trang `/admin/delivery-partners`) +
một `NavChild`. Không đụng các màn `/orders`.

## Alternatives rejected

| Option | Why not |
|---|---|
| Thêm trạng thái giao vào `sales_order_status_enum` | Phá `VALID_TRANSITIONS` và mọi màn backoffice/mobile đang đọc 5 trạng thái; trộn hai trục (xử lý đơn vs giao hàng) vào một cột. |
| Bảng `delivery_shipments` (1 đơn nhiều lần giao) | Akenzy chốt A-02: một cột trên đơn. Giao lại dùng FAILED → IN_TRANSIT; mất lịch sử từng lần giao được bù bằng event. |
| Mở rộng `GET /mobile/sales-orders` thêm query param | Lọc cột đa toán tử + join hoá đơn/công nợ là đúng loại CLAUDE.md chỉ định CQRS; GET đang phục vụ app mobile, thêm filter là đổi hợp đồng của client khác. |
| Dùng `/admin/sales-orders` cho POS | Không có `BranchScopeGuard` — thu ngân thấy toàn chuỗi. |
| Chuyển hoàn qua luồng trả hàng | Akenzy chốt A-03: huỷ hoá đơn. Trả hàng sinh phiếu trả + phiếu chi cho tiền chưa từng thu. |
| Thu COD trong đợt này | Akenzy 2026-09-24: COD hiện luôn bằng 0, làm sau (ADR-05 rejected). |
| Client lặp gọi action từng đơn | N round-trip, idempotency key mỗi lần, và tổng kết lỗi rải ở client; batch server-side trả kết quả từng đơn gọn hơn và vẫn một transaction mỗi đơn. |

## Contracts

- `DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]>` — nguồn duy
  nhất cho kiểm tra ở service và cho menu "Cập nhật TT" ở client (client nhận qua
  field `allowedNextStatuses` trên mỗi dòng search — không nhân bản bảng ở FE).
- `SalesOrderService.cancel` tách `cancelIn(manager, …)` tương tự nếu chưa có,
  để RETURNED set `delivery_status` trong cùng transaction với huỷ hoá đơn.
- Batch response: `{ results: Array<{ id: string; ok: boolean; code?: string; message?: string }> }`,
  HTTP 200 kể cả khi có đơn lỗi; 4xx chỉ cho lỗi cả request (validate, quyền).
- OpenAPI regenerate → `packages/api-client`; pos-web dùng kiểu sinh ra.

## Error taxonomy

| Code | HTTP | Khi | UI (vi) |
|---|---|---|---|
| `NO_OPEN_SESSION` | 409 (hiện có) | process khi chi nhánh chưa mở ca | "Chi nhánh chưa mở ca" |
| `ORDER_NOT_PROCESSABLE` | 409 | process đơn không ở SENT / không thuộc chi nhánh | "Đơn không còn ở trạng thái chưa xử lý" |
| `INVOICE_NOT_FINALIZED` | 409 | deliver khi hoá đơn còn nháp | "Hoá đơn chưa hoàn tất — mở hoá đơn để thanh toán trước" |
| `INVALID_DELIVERY_TRANSITION` | 409 | chuyển ngoài bảng | "Không thể chuyển từ {a} sang {b}" |
| `DEBT_OUTSTANDING` | 409 | → COMPLETED khi còn nợ | "Đơn còn {x} chưa thu" |
| `DELIVERY_PARTNER_INACTIVE` | 400 | deliver **có gửi** `deliveryPartnerId` nhưng đối tác inactive/khác tổ chức | "Đối tác giao hàng không hợp lệ" |
| lỗi của `CancelInvoiceService` | chuyển nguyên | RETURNED bị chặn (vd đã trả hàng tất toán) | thông điệp gốc |
| 403 | 403 | thiếu `pos.sales-order.deliver` | nút đã ẩn |

Batch: lỗi từng đơn nằm trong `results[i].code`, không ném.

## ADRs

### ADR-01 — Trạng thái giao là cột riêng `delivery_status` trên `sales_orders`
**Status:** accepted
**Context:** Cần 6 trạng thái giao sau PROCESSED; enum cũ phục vụ backoffice + mobile.
**Decision:** Cột enum nullable mới; NULL = chưa vào vòng đời giao. `status` cũ giữ nguyên, trừ RETURNED kéo `status = CANCELLED`.
**Consequences:** Hai trục độc lập, mỗi trục một bảng chuyển. Backfill đơn PROCESSED cũ. Akenzy chốt A-02.

### ADR-02 — Đối tác giao hàng là danh mục qua generic CRUD, snapshot tên trên đơn
**Status:** accepted
**Context:** A-04 — cần lọc/báo cáo theo đối tác, không tích hợp API hãng.
**Decision:** `delivery_partners` org-scoped, `ScopingPolicy.ORGANIZATION`, `DeletionPolicy.SOFT`, đăng ký trong `SalesOrderModule.onModuleInit` như `sales-channels`. Đơn lưu id + tên snapshot.
**Consequences:** Không cần trang admin tay; đổi tên đối tác không đổi đơn cũ.

### ADR-03 — POS đọc qua endpoint CQRS mới, branch-scoped cứng
**Status:** accepted
**Context:** Lọc cột đa toán tử + join hoá đơn/công nợ + nhiều tab.
**Decision:** `POST /v2/mobile/sales-orders/search` với `QueryBus`, `FilterBuilder`; branch lấy từ `actor.branchId`, body không có `branchId`.
**Consequences:** `GET /mobile/sales-orders` của app mobile và backoffice không đổi.

### ADR-04 — Chuyển hoàn = huỷ đơn qua đường cancel hiện có, cùng transaction
**Status:** accepted
**Context:** A-03 — hàng về kho phải đảo tồn, đóng COD, đảo điểm.
**Decision:** `delivery-status` với `to = RETURNED` gọi `SalesOrderService.cancelIn` (→ `CancelInvoiceService`) rồi set `delivery_status = RETURNED` trong cùng transaction.
**Consequences:** Không có đường đảo thứ hai; giới hạn của `CancelInvoiceService` (A-15 feature trước) áp nguyên.

### ADR-05 — Thu COD qua `InvoiceDebtService.collectPaymentIn`
**Status:** rejected
**Context:** Đề xuất tách `collectPayment` để thu COD và hoàn thành đơn nguyên tử.
**Decision:** Không làm. Akenzy 2026-09-24: COD hiện luôn bằng 0, Thu COD làm ở đợt sau. `InvoiceDebtService` không bị sửa.
**Consequences:** Nút Thu COD disabled; AWAITING_COD chỉ tới được qua Cập nhật TT; đợt sau cần một ADR mới cho đường thu.

### ADR-06 — Dòng thời gian giao dùng lại `sales_order_dispatch_events`
**Status:** accepted
**Context:** A-14 — `GET :id/history` đã đọc bảng này.
**Decision:** Thêm action `PROCESS`, `DELIVER`, `DELIVERY_STATUS`; `DELIVERY_STATUS` mang from/to trong `reason`/cột payload hiện có. `SalesOrderHistoryService` thêm nhãn tiếng Việt.
**Consequences:** Một nguồn lịch sử; tên bảng hơi rộng nghĩa hơn tên gọi "dispatch".

### ADR-07 — Action ghi là batch server-side, mỗi đơn một transaction
**Status:** accepted
**Context:** Mọi nút trên ảnh thao tác trên nhiều đơn đã tick; AC-07/AC-24 đòi kết quả từng đơn.
**Decision:** Body `{ ids, … }`, vòng lặp tuần tự trong service, mỗi đơn `dataSource.transaction` riêng, gom `results`. Giới hạn 100 id/lần.
**Consequences:** Một đơn lỗi không kéo đơn khác; `IdempotencyInterceptor` dedupe cả batch theo một key.
