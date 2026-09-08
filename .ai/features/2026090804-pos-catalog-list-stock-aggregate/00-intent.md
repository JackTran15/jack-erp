---
feature: pos-catalog-list-stock-aggregate
slug: 2026090804-pos-catalog-list-stock-aggregate
owner: Akenzy
created: 2026-09-08
status: draft
---

# Intent — pos-catalog-list-stock-aggregate

## Problem

`GET /pos/branches/:branchId/catalog/products?page=1&pageSize=30` mất **796 ms** trên
prod. Nhưng vấn đề lớn hơn nằm ở chỗ khác: nó **kéo chậm mọi endpoint khác** đang chạy
cùng lúc.

Trích log prod 2026-09-08 13:03:45, tất cả cùng bắn lúc POS mở trang:

| Endpoint | Log | Chi phí thật của chính nó (đo trên `erp_dev_3008`) |
|---|---|---|
| `/pos/branches/…/catalog/products` | 796 ms | **~91 ms** chặn luồng |
| `/branches/…/salesmen` | 1014 ms | **0.17 ms** SQL, 9 dòng |
| `/payment-accounts` | 739 ms | 2 truy vấn nhỏ |
| `/organizations/current/pos-settings` | 875 ms | **0.8 ms** — một `findOne` theo khoá chính |

`getPosSettings` là `SELECT * FROM organizations WHERE id = $1` trả **một** dòng
(`organization.service.ts:145`). 875 ms không phải của nó. `listSalesmen` chạy 0.17 ms.
Hai endpoint đó không có bệnh gì cả — chúng là **nạn nhân**.

Đã tái hiện được sự tranh chấp. Bốn lượt `loadBranchStock` chạy song song trong một
tiến trình, kèm một lượt `findOne` của pos-settings bắn cùng lúc:

```
catalog#0..3                    294–315 ms mỗi lượt
pos-settings findOne (1 dòng)    83.3 ms    <-- cùng truy vấn, chạy một mình: 0.9 ms
```

Một truy vấn khoá chính 0.9 ms thành 83 ms chỉ vì bốn hàng xóm. Prod chạy
`exec_mode: 'fork', instances: 1` (`apps/api/ecosystem.config.cjs:30`) — đúng một luồng,
nên 875 ms trên máy chậm hơn với nhiều máy POS là hoàn toàn nhất quán.

**Nguồn cơn: `loadBranchStock` (`pos-catalog-product.service.ts:500`).** Mỗi lần mở một
trang catalog, nó nạp toàn bộ tồn kho của chi nhánh:

- `:519` — `stock_balances` cả chi nhánh → **14 015 dòng** dựng thành entity TypeORM (87 ms)
- `:525` — `locations` với `In(1 036 uuid)` → 1 036 entity nữa (12 ms)
- `:539` / `:548` / `:581` — storages, showrooms, temp-warehouse delta

~91 ms **CPU đồng bộ** để phục vụ 30 thẻ. Dựng entity TypeORM không phải I/O — nó chặn
event loop, nên nó làm phồng thời gian của mọi request đang bay cùng.

Và đường list vứt gần hết đi. `PosProductCardDto` không có trường nào cho chúng —
`listProducts` chỉ đọc `stockByItem.get(id)?.total`. `sellableTotal`, `locations[]`,
`mainStorageIds`, lượt đọc showroom và `stagedDelta` được tính cho 14 015 dòng rồi bỏ.
Chúng tồn tại vì đường **detail** dùng chung method này.

## Success signal

Đo lại trên `erp_dev_3008`, org `e60e5f49…`, chi nhánh `71230276…` (14 015 dòng tồn):

1. Phần nạp tồn của `listProducts` giảm từ **91 ms → ≤ 25 ms** (đo được 18.4 ms).
2. Bắn 4 lượt `listProducts` song song + 1 `findOne` pos-settings: `findOne` **≤ 25 ms**
   (hiện tại 83.3 ms).
3. `quantityOnHand` của từng thẻ **không đổi** so với trước, trên cùng dữ liệu.
4. `pnpm --filter @erp/api test -- pos-catalog-product.service.spec.ts` xanh.

## Out of scope

- **Option B — phân trang trước rồi mới nạp tồn** (đo được 4.2 ms, nhanh gấp 22 lần).
  Nó không phục vụ được `sortBy=quantityOnHand` nếu không có đường dự phòng, tức là hai
  đường nạp tồn thay vì một. Để lại cho một feature sau, sau khi Option A đã chạy thật.
- **Sửa `loadBranchStock`.** Bị cấm bởi ADR-01 của
  [[project_pos_variant_stock_columns]] — xem Constraints.
- **PM2 cluster mode.** `instances: 1` làm mọi thứ nối đuôi nhau, nhưng đổi nó cần
  kiểm chứng Socket.IO + Kafka consumer group trước; đó là việc khác.
- **`buildOrgCards`** (162 ms) — đã cache theo org, không chạy mỗi request.
- **Vòng materialise/sort toàn bộ 2 539 thẻ trước khi cắt trang** — đo được ~6 ms, có
  thật nhưng không phải vấn đề.
- **Đường detail** `/catalog/products/:id` — đã truyền `itemIds`, vốn đã hẹp.

## Constraints

| Kind | Detail |
| --- | --- |
| Kiến trúc | **ADR-01** của `pos-variant-stock-columns`: *không sửa `loadBranchStock`*. `sellableQuantity` là ngưỡng cảnh báo bán vượt tồn mà hai feature trước đã tốn công định nghĩa ([[project_pos_stock_warning_showroom_only]], [[project_pos_stock_warning_temp_warehouse]]). Feature này giữ nguyên quyết định đó: thêm một đường nạp riêng cho list, không chạm dòng nào của `loadBranchStock`. |
| Hợp đồng | `PosProductCardDto` không đổi. `quantityOnHand` phải khớp từng con số với hiện tại. |
| Hợp đồng | Tham số `direction` của endpoint phải giữ nguyên ngữ nghĩa, kể cả khi chưa client nào truyền. |
| Kiểu dữ liệu | `stock_balances.branch_id` và `locations.organization_id` là `varchar`; `locations.storage_id`, `showrooms.branch_id`, `showrooms.storage_id` là `uuid`. Trộn hai kiểu trong một câu SQL thô đã từng làm Postgres suy ra hai kiểu mâu thuẫn cho cùng một tham số (xem `temp-warehouse-staged-stock.service.ts:47-54`). |
| Ngôn ngữ | Không viết tiếng Việt vào source backend ([[feedback_no_vietnamese_in_backend_source]]). |

## Existing surface touched

- `apps/api/src/modules/pos/services/pos-catalog-product.service.ts` — `listProducts`
  (:133) và một private method mới; `loadBranchStock` (:500) không đổi.
- `apps/api/src/modules/pos/services/pos-catalog-product.service.spec.ts` — spec hiện
  có mock `balanceRepo.find` + `locationRepo.find` cho đường list, sẽ phải đổi.
- Không migration, không đổi DTO, không đổi api-client, không đổi frontend.
