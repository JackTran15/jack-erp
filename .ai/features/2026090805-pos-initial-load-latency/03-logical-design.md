---
feature: pos-initial-load-latency
adr_count: 4
---

# Logical design — pos-initial-load-latency

## Approach

Ba mảnh độc lập, không mảnh nào phụ thuộc mảnh nào.

### 1. `/catalog/products` — phân trang trong SQL (đây là "Option B")

[[2026090804-pos-catalog-list-stock-aggregate]] ADR-03 đã ghi: *"Option B là một feature
riêng, sau khi A đã chạy thật… `loadListStockTotals` của A **chính là** đường dự phòng mà
B sẽ cần"*. Feature này là B, và nó dùng đúng đường dự phòng đó.

Đảo trình tự của `listProducts`:

```
HIỆN TẠI  cache 2.38MB → gộp tồn TOÀN chi nhánh → map 2539 card → lọc → sắp → cắt 30
ĐỀ XUẤT   SQL: lọc → sắp → cắt 20  →  SQL: chi tiết 20 card  →  SQL: tồn 229 item
```

Ba truy vấn, không Redis, không `JSON.parse`:

| # | Truy vấn | Đo được |
|---|---|---|
| 1 | `card_keys` (UNION products/standalone items) `ORDER BY name COLLATE "vi-VN-x-icu" LIMIT :pageSize OFFSET :skip` | 8.8 ms |
| 2 | `COUNT(*)` trên cùng `card_keys` cho `total` | 5.6 ms |
| 3 | Gộp giá/variant/unit/category cho đúng các `card_id` của trang | 4.1 ms |
| 4 | `loadListStockTotals` **có thêm bộ lọc `itemId = ANY(...)`** — 229 item thay vì 14 015 dòng | 2.1 ms |
| | **Tổng** | **20.6 ms** |

Truy vấn 1 và 2 chạy song song được (`Promise.all`), 3 và 4 nối tiếp sau vì 4 cần
`item_ids` từ 3.

Khoá cache `pos-catalog:cards:<org>` biến mất hoàn toàn, kéo theo điểm invalidate ở
`item-crud.service.ts:116` và hằng số trong `pos-catalog-cache.constants.ts`.

### 2. `/admin/users/me` — cache theo khuôn `my-branches`

`getMe` (`users.service.ts:302`) bọc trong `CacheService.getOrSet`, namespace mới
`users-me`, khoá `<userId>:<orgId>` — cùng hình dạng khoá mà `my-branches` đang dùng.
TTL 15 phút. Invalidate ở các đường ghi, theo đúng khuôn
`invalidateMyBranchesForUsers` (`branch.service.ts:119-138`): `Promise.all` các lượt
`invalidate`, bọc `try/catch`, lỗi Redis chỉ ghi log.

### 3. Frontend — hai hằng số

`use-query-catalog.ts:41` 30 → 20; `use-checkout-customer.ts:82` 50 → 20.

## Alternatives rejected

| Option | Why not |
|---|---|
| **Phương án lai**: cache 135 KB chỉ chứa `id/kind/name`, sắp xếp + cắt trang bằng `Intl.Collator` trong JS, rồi 2 truy vấn chi tiết + tồn | Đo được **8.1 ms**, nhanh hơn SQL thuần 2.5 lần. Bị loại vì nó giữ lại một cache phải invalidate — đúng thứ mảnh 1 tồn tại để gỡ bỏ. 20.6 ms đã dưới ngưỡng mà endpoint này còn là vấn đề; phần trễ còn lại trên server là tranh chấp event loop, không phải endpoint. Đổi 12 ms lấy việc xoá hẳn một lớp lỗi stale là đáng. Xem ADR-01 |
| `ORDER BY name` trần, không `COLLATE` | Lệch **86.6%** (2198/2539) vị trí so với `localeCompare('vi')` hiện tại. DB là `en_US.utf8`: `Ao/Áo/Ăn/Âm`, `D/Đ`, `E/Ế` xếp khác. Catalog sẽ đảo lộn trước mắt thu ngân. Xem ADR-02 |
| Cột sinh sẵn `name_sort_key` + index thường | Giải được collation nhưng thêm cột, thêm trigger/generated column, và phải backfill 4 731 products + 21 024 items. `COLLATE` trong index đạt cùng kết quả, không đổi schema bảng |
| Gộp tồn vào truy vấn `card_keys` để mọi `sortBy` đi chung một đường | Sort theo tên — mặc định, chiếm gần hết lưu lượng — sẽ phải trả giá cho việc gộp tồn toàn chi nhánh. Mất phần lớn khoản tiết kiệm để đổi lấy một đường code thay vì hai. Xem ADR-03 |
| Bỏ `sortBy=quantityOnHand` | Chủ sở hữu không chọn (2026-09-08). Bỏ tính năng để khỏi phải bảo trì hai đường là cái giá của người dùng trả, không phải của người viết code |
| `/customers` pageSize 10 như yêu cầu ban đầu | 50 bản ghi đó là corpus lọc local của ô tìm khách (`use-checkout-customer.ts:79-107`), UI chỉ hiện 8. Còn 10 thì gần như mọi lượt gõ rơi xuống `search(q)` gọi API. Chốt 20 |
| Cache `/branches/me` | Đã có sẵn — namespace `my-branches`, invalidate theo ADR-08 (`branch.service.ts:113-138`). Dòng `Cache miss` trong log là lần nạp đầu sau restart |
| Chuyển PM2 sang cluster mode / thay `bcryptjs` | Ngoài phạm vi (00-intent.md). Đó là nguyên nhân của phần trễ còn lại trên server, và trộn vào đây thì không biết cái nào cải thiện cái gì |

## Contracts

### `GET /pos/branches/:branchId/catalog/products`

**Không đổi.** Request, response, `PosProductCardDto`, `direction`, `categoryId`,
`search`, `sortBy`, `sortOrder`, `page`, `pageSize` giữ nguyên. Không chạy lại
`pnpm openapi:generate`, không đổi `packages/api-client`.

### Hình dạng truy vấn 1 — `card_keys`

```
WITH card_keys AS (
  SELECT p.id AS card_id, true AS is_product, p.name
    FROM products p
   WHERE p.organization_id = :orgId
     AND EXISTS (SELECT 1 FROM items i
                  WHERE i.product_id = p.id
                    AND i.is_active AND i.is_pos_visible)
  UNION ALL
  SELECT i.id, false, i.name
    FROM items i
   WHERE i.organization_id = :orgId
     AND i.is_active AND i.is_pos_visible
     AND i.product_id IS NULL
)
SELECT * FROM card_keys
 ORDER BY name COLLATE "vi-VN-x-icu" <asc|desc>
 LIMIT :pageSize OFFSET :skip
```

`sortBy=minPrice|maxPrice` cần giá, mà giá nằm ở `items` — nhánh `products` của UNION
phải gộp `MIN/MAX(selling_price)` vào ngay trong CTE cho hai sort đó.

### Hình dạng truy vấn 3 — chi tiết trang

```
SELECT COALESCE(i.product_id, i.id) AS card_id,
       MIN(i.selling_price), MAX(i.selling_price),
       COUNT(*) AS variant_count,
       array_agg(i.id) AS item_ids,
       (array_agg(i.unit))[1] AS unit,
       (array_agg(i.category_id) FILTER (WHERE i.category_id IS NOT NULL))[1] AS category_id
  FROM items i
 WHERE i.organization_id = :orgId AND i.is_active AND i.is_pos_visible
   AND COALESCE(i.product_id, i.id) = ANY(:cardIds::uuid[])
 GROUP BY 1
```

`name`, `description`, `categoryName` lấy từ `products`/`inventory_item_categories` qua
join — cùng quy tắc fallback mà `buildOrgCards` đang dùng (`:264-271`):
category của card là category của biến thể **đầu tiên có category**.

### Truy vấn 4 — `loadListStockTotals` mở rộng

Thêm **một** tham số tuỳ chọn `itemIds?: string[]`; khi có thì thêm
`AND sb.itemId = ANY(:itemIds)`. Phần còn lại — join `locations`, `is_tracked`,
nhánh `direction`/showroom, cách đọc `showrooms` riêng vì `stock_balances.branch_id` là
`varchar` còn `showrooms.branch_id` là `uuid` — **không đổi một dòng**, giữ nguyên
ADR-02 của feature trước.

### Migration — 1 index

> **Đính chính 2026-09-08 (lúc làm T-01-01).** Mục này ban đầu ghi **3** index và giải
> thích rằng hai index tên có `COLLATE` là thứ đưa truy vấn 1 từ 14.4 ms xuống 8.8 ms.
> Sai. Khoản lợi đó đến từ `IDX_items_org_product_pos`. Đo lại bằng cách bỏ từng index
> một trên `erp_dev_3008` (trung bình 12 lượt, trang 1):
>
> | | ms |
> |---|---|
> | cả 3 index | 7.3 |
> | bỏ `IDX_products_org_name_vi` | 6.0 — **không đổi** |
> | bỏ `IDX_items_org_name_vi_standalone` | 6.2 — **không đổi** |
> | bỏ `IDX_items_org_product_pos` | 9.2 — **+1.9 ms** |
> | không index nào | 11.3 |
>
> Planner từ chối cả hai index tên: UNION dù sao cũng phải materialize rồi sort, và với
> 2 358 dòng product khớp thì seq scan + sort rẻ hơn index scan. `EXPLAIN` cho thấy
> `Seq Scan on products`. Index mà planner không dùng là chi phí ghi thuần trên hai bảng
> nóng, nên không tạo. ADR-02 **không đổi** — `COLLATE` trong `ORDER BY` là chuyện đúng-sai
> và vẫn bắt buộc; nó chỉ không phải chuyện index.

```sql
CREATE INDEX "IDX_items_org_product_pos"
  ON items (organization_id, product_id)
  WHERE is_active AND is_pos_visible;
```

Phục vụ `EXISTS` của nhánh product và bộ lọc `product_id IS NULL` của nhánh standalone.

### `GET /admin/users/me`

**Không đổi** về hình dạng. Thêm header không có, thêm trường không có — chỉ đổi nguồn.

## Error taxonomy

| Tình huống | Xử lý | Ghi chú |
|---|---|---|
| Redis không truy cập được khi đọc `users-me` | `getOrSet` ném → không được nuốt ở tầng service; endpoint phải trả dữ liệu từ DB | AC-10. `CacheService.getOrSet` hiện **không** bọc try/catch — cần bọc ở chỗ gọi |
| Redis lỗi khi invalidate `users-me` | Ghi log, không ném | Đúng khuôn `branch.service.ts:130-137`. TTL 15 phút là lưới đỡ |
| `categoryId` không tồn tại | Trả trang rỗng, `total: 0` | Hành vi hiện tại của `resolveDescendantCategoryIds`, giữ nguyên |
| Chi nhánh chưa cấu hình showroom + `direction=SHOWROOM` | `Map` rỗng → mọi `quantityOnHand` = 0 | Hành vi hiện tại (`:534-540`), AC-06 ràng lại |
| `page` vượt quá số trang | Trang rỗng, `total` vẫn đúng | `OFFSET` quá lớn trả 0 dòng |
| Collation `vi-VN-x-icu` không có trên môi trường nào đó | Migration đổ ngay lúc chạy | Chủ ý: đổ lúc migrate dễ chẩn đoán hơn là catalog âm thầm sai thứ tự. A-01 đã xác nhận có |

## ADRs

### ADR-01 — SQL thuần, không giữ cache nào cho catalog

**Context:** Đo được hai phương án. Lai (cache 135 KB danh sách khoá, sắp xếp trong JS)
chạy 8.1 ms. SQL thuần chạy 20.6 ms. Cả hai đều hạ từ 33.9 ms nóng / 153.9 ms nguội.

**Decision:** Chọn SQL thuần, chấp nhận chậm hơn 12.5 ms.

**Consequences:** Xoá hẳn khoá `pos-catalog:cards`, điểm invalidate ở
`item-crud.service.ts:116`, và cả lớp lỗi "thu ngân thấy giá/tên cũ tới 60 giây". Không
còn cú 153.9 ms mỗi 60 giây, không còn giẫm đạp khi nhiều máy POS cùng hết hạn cache,
không còn 2.38 MB qua Redis mỗi request. Cái giá là 12.5 ms và việc endpoint này từ nay
gắn chặt với chất lượng plan của Postgres — nếu `ANALYZE` lỗi thời hoặc index bị bỏ,
regression sẽ nằm ở DB chứ không ở code. T-01-06 khoá bằng test ngân sách thời gian.

**Status:** accepted

### ADR-02 — Sắp xếp bằng `COLLATE "vi-VN-x-icu"`, index tạo kèm collation

**Context:** DB là `en_US.utf8`. `ORDER BY name` trần lệch 2198/2539 vị trí so với
`localeCompare(name, 'vi')` mà code đang dùng. Với ICU thì lệch 0/2539.

**Decision:** Mọi `ORDER BY` theo tên trong feature này mang `COLLATE "vi-VN-x-icu"`, và
index tạo kèm đúng collation đó.

**Consequences:** Thứ tự catalog không đổi một dòng so với hôm nay — AC-02 kiểm được
bằng cách so hai mảng, không cần suy luận. Đổi lại, feature này gắn với một collation ICU
cụ thể: đổi bản Postgres hoặc bản ICU có thể đổi thứ tự (đây là vấn đề đã biết của
`pg_collation` khi nâng cấp hệ điều hành). Đó là cái giá chung của mọi index dựa trên
collation, không riêng feature này. Chủ sở hữu đã xác nhận collation có mặt (A-01).

**Status:** accepted

### ADR-03 — Hai đường nạp tồn, có ý thức

**Context:** `sortBy=quantityOnHand` cần tồn của **mọi** card trước khi sắp xếp, nên
không thể cắt trang trước. ADR-03 của feature trước đã báo trước đúng cái giá này.

**Decision:** `sortBy=name|minPrice|maxPrice` đi đường nhanh (cắt trang → tồn 229 item).
`sortBy=quantityOnHand` giữ nguyên `loadListStockTotals` gộp toàn chi nhánh rồi sắp xếp.

**Consequences:** Hai đường code, hai bộ test parity cho một endpoint — đúng cái giá
ADR-03 cũ đã cảnh báo, nay chủ sở hữu chấp nhận (A-02). Rủi ro thật là hai đường trôi xa
nhau: AC-03 ràng cả hai phải cho cùng `quantityOnHand`. Nếu sau này xuất hiện `sortBy`
thứ ba cần tồn kho, hãy hợp nhất trước khi thêm — cùng lời cảnh báo, cùng lý do như
ADR-01 của feature trước.

**Status:** accepted

### ADR-04 — `users/me` cache có invalidate, TTL 15 phút làm lưới

**Context:** Nội dung `/admin/users/me` gồm role, chi nhánh và hồ sơ nhân sự — thứ mà
admin đổi thì người dùng phải thấy ngay, không chờ TTL. Nhưng số đường ghi chạm vào nó
nhiều, và bỏ sót một đường là lỗi âm thầm.

**Decision:** Cache + invalidate ở các đường ghi, TTL 15 phút làm lưới đỡ. Không chọn
TTL-ngắn-không-invalidate, cũng không chọn invalidate-không-TTL.

**Consequences:** Đường nào bỏ sót thì sai tối đa 15 phút thay vì sai vĩnh viễn. Đổi lại,
15 phút đủ dài để một lỗi bỏ sót invalidate không lộ ra trong lúc test thủ công — T-02-03
liệt kê từng đường ghi thành checklist chứ không dựa vào việc thử tay.

Cần nói rõ để khỏi đặt sai kỳ vọng: 641 ms của endpoint này phần lớn là thời gian **chờ**
event loop bị chặn, không phải thời gian làm việc (A-09). Cache sẽ không đưa nó về dưới
100 ms một mình; phần còn lại thuộc về feature xử lý `bcryptjs` và số lần restart.

**Status:** accepted
