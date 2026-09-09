---
feature: pos-initial-load-latency
slug: 2026090805-pos-initial-load-latency
owner: Akenzy
created: 2026-09-08
status: draft
---

# Intent — pos-initial-load-latency

## Problem

Mở trang bán hàng POS bắn ~10 request cùng lúc. Trên dev server
(`jack-erp-api.ducanhzed.com`, log 2026-09-08 13:37:55) ba request nặng nhất về cuối
cùng và rất chậm; trên local cùng ba request đó vẫn ~300ms — con số chủ sở hữu không
chấp nhận được.

| Endpoint | Local | Dev server |
|---|---|---|
| `GET /pos/branches/:id/catalog/products?page=1&pageSize=30` | 335 ms | **749 ms** |
| `GET /customers?page=1&pageSize=50` | 292 ms | **689 ms** |
| `GET /admin/users/me` | 358 ms | **641 ms** |

Ba feature catalog-perf đã đóng trong ngày
([[2026090802-pos-catalog-search-perf]], [[2026090803-pos-catalog-page-load]],
[[2026090804-pos-catalog-list-stock-aggregate]]) đã gộp tồn kho về một truy vấn SQL
(86ce8858). Feature này bắt đầu từ chỗ đó dừng lại.

### Chi phí thật của `/catalog/products`, đo trên `erp_dev_3008`

Bản restore prod, org `e60e5f49…` ("MT"), chi nhánh `71230276…` (MT211 Đà Nẵng,
14 015 dòng `stock_balances`). 21 024 item POS-visible gộp thành **2 539 card**,
blob cache **2.38 MB**.

| Giai đoạn | Đo được | Tần suất |
|---|---|---|
| `redis GET` blob 2.38MB | 5 ms | mỗi request |
| `JSON.parse` blob 2.38MB | 3 ms | mỗi request |
| `loadListStockTotals` SQL | 18–26 ms | mỗi request |
| filter + map + reduce + sort in-memory | 10 ms | mỗi request |
| **Tổng đường cache HIT** | **~36 ms** | |
| `buildOrgCards` SQL | 61 ms | mỗi 60s (TTL) |
| dựng card trong JS | 15 ms | mỗi 60s |
| `JSON.stringify` + `SETEX` 2.38MB | 17 ms | mỗi 60s |
| **Tổng đường cache MISS** | **~120 ms** | |

Endpoint tự nó tốn 36 ms nóng / 120 ms nguội. Log ghi 335 ms local, 749 ms server.
**Phần chênh không phải của nó** — nó vừa là thủ phạm vừa là nạn nhân của tranh chấp
một luồng đã ghi ở [[2026090804-pos-catalog-list-stock-aggregate]].

### Ba lãng phí có cấu trúc còn lại

1. **`quantityOnHand` tính cho cả 2 539 card để hiển thị 20–30 card.**
   `pos-catalog-product.service.ts:155` gom tồn toàn chi nhánh, rồi `:173-179` cộng
   dồn cho mọi card, `:203-204` mới cắt trang. Với `sortBy=name` (mặc định) thứ tự
   **không** phụ thuộc tồn kho — hoàn toàn có thể sắp xếp + cắt trang trước, rồi chỉ
   hỏi tồn của ~20 card. Chỉ `sortBy=quantityOnHand` mới thật sự cần tổng đầy đủ.

2. **`locations` bị quét tuần tự.** `EXPLAIN ANALYZE` trên truy vấn tồn kho:
   `Seq Scan on locations` 22 508 dòng = 8.8 ms trong tổng 26 ms.

3. **TTL 60s không có chống giẫm đạp.** `pos-catalog-cache.constants.ts:8`.
   Nhiều máy POS cùng hết hạn → mỗi máy tự dựng lại 2.38 MB.

### Hai yêu cầu cache của chủ sở hữu

- `GET /branches/me` — **đã có cache rồi**, namespace `my-branches`, kèm invalidation
  theo ADR-08 (`branch.service.ts:113-138`). Log local `Cache miss: cache:my-branches:…`
  là lần nạp đầu sau khi khởi động, không phải thiếu cache. Không còn việc để làm.
- `GET /admin/users/me` — `getMe` (`users.service.ts:302`) chạy 3 nhánh song song.
  Nhánh `permissions` đã cache (`rbac:perms`); `findById` + truy vấn role thì chưa.

### Giảm pageSize

- `use-checkout-customer.ts:82` — `useCustomerListQuery({ pageSize: 50 })` → **20**.
  Chủ sở hữu ban đầu yêu cầu 10; chốt 20 sau khi biết 50 bản ghi đó không phải để hiển
  thị (UI chỉ hiện 8) mà là corpus lọc local của ô tìm khách — 10 sẽ đẩy gần như mọi
  lượt gõ sang gọi API.
- `use-query-catalog.ts:41` — `POS_CATALOG_PRODUCTS_PAGE_SIZE = 30` → **20**, trùng với
  mặc định phía server (`PaginationQueryDto.pageSize = 20`).

Cần nói thẳng: với catalog, giảm 30→20 **chỉ cắt payload**, không cắt thời gian xử lý —
công việc trải trên cả 2 539 card bất kể pageSize. Nó chỉ thành khoản tiết kiệm thật
sau khi hạng mục (1) ở trên xong.

## Success signal

Đo bằng `erp_http_request_duration_seconds` (histogram đã có sẵn,
`metrics.service.ts:121`) trên dev server, cửa sổ 24h sau khi triển khai:

- `p99` của `/pos/branches/:branchId/catalog/products` **< 150 ms** (hiện 749 ms).
- `p99` của `/admin/users/me` **< 100 ms** (hiện 641 ms).
- `p99` của `/customers` **< 200 ms** (hiện 689 ms).
- `quantityOnHand` trả về khớp từng card với giá trị hiện tại — không đổi số, chỉ đổi
  cách tính.

## Out of scope

- **`bcryptjs` chặn event loop.** Đo được `await bcrypt.compare` chặn 67/73 ms
  (`auth.service.ts:12,93`) — thư viện pure-JS không nhường luồng. Đây là nguyên nhân
  tail latency phía server, không phải của catalog. Tách feature riêng.
- **89 lần restart của tiến trình prod** (`pm2 describe erp-api`), không có
  `unhandledRejection`/`uncaughtException` handler và không có `enableShutdownHooks`
  trong `main.ts`. Việc vận hành, tách riêng.
- **`exec_mode: 'fork', instances: 1`** → cluster mode. Thay đổi hạ tầng, cần xác minh
  Kafka consumer group và Socket.IO trước.
- Bật `DEBUG` log trên production (`main.ts:15` không set logger level).
- Mọi endpoint không nằm trong 3 cái đo ở trên.

## Constraints

- Không đổi hình dạng response. Card giữ nguyên đúng các trường hiện có
  (`kind, id, name, description, categoryId, categoryName, imageUrl, minPrice,
  maxPrice, unit, variantCount, quantityOnHand`).
- Không đổi ngữ nghĩa `quantityOnHand`: vẫn là tổng tồn có theo dõi tại các location
  đang hoạt động của chi nhánh, có lọc `direction` (SHOWROOM / kho).
- Thay đổi schema chỉ qua migration TypeORM (`synchronize: false`).
- Cache mới phải có đường invalidation, không chỉ dựa vào TTL.
- Đo trên `erp_dev_3008` (restore prod) chứ không phải seed dev — seed không tái hiện
  được quy mô 21k item.
