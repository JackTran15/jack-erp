---
feature: pos-catalog-list-stock-aggregate
adr_count: 3
---

# Logical design — pos-catalog-list-stock-aggregate

## Approach

Thêm **một** private method mới cho riêng đường list — `loadListStockTotals` — dựng một
truy vấn gộp `SUM(quantity) GROUP BY item_id` trả thẳng `Map<itemId, number>`.
`listProducts` gọi nó thay cho `loadBranchStock`. `loadBranchStock` **không đổi một dòng**
và tiếp tục phục vụ hai caller của đường detail.

Đường list hôm nay chạy 4–5 truy vấn và dựng ~15 000 entity để lấy đúng một con số mỗi
item. Sau thay đổi: **1 truy vấn gộp**, cộng một lượt đọc `showrooms` nhỏ *chỉ khi*
`direction` được truyền. Không dựng entity nào — `getRawMany()` trả về dòng thô.

Bốn thứ đường list đang tính rồi vứt đi sẽ không còn được tính: `sellableTotal`,
`locations[]`, `mainStorageIds` (đọc `storages`), và `getBranchDelta` (temp-warehouse).
Không cái nào có mặt trong `PosProductCardDto`.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Sửa `loadBranchStock` để nó tự gộp | ADR-01 của `pos-variant-stock-columns` cấm. `sellableQuantity` sinh ra từ đó là ngưỡng cảnh báo bán vượt tồn; hai feature trước đã tốn công định nghĩa nó. Một truy vấn gộp không sinh được `locations[]` mà đường detail cần, nên "gộp" và "chi tiết" là hai hình dạng dữ liệu khác nhau chứ không phải một cái nhanh hơn cái kia |
| Option B — cắt trang trước rồi chỉ nạp tồn cho ~30 thẻ (đo được **4.2 ms**) | Nhanh hơn hẳn, nhưng `sortBy=quantityOnHand` cần tồn của **toàn bộ** thẻ trước khi sắp xếp, nên vẫn phải giữ đường gộp cả chi nhánh làm dự phòng — tức là hai đường nạp tồn, hai bộ test parity, cho một endpoint. Xem ADR-03 |
| Một câu SQL thô qua `DataSource.query()`, gộp luôn `showrooms` bằng `EXISTS` | `stock_balances.branch_id` là `varchar` còn `showrooms.branch_id` là `uuid`. Dùng cùng một tham số ở hai vế đã từng làm Postgres suy ra hai kiểu mâu thuẫn và từ chối câu lệnh — chính lỗi mà `temp-warehouse-staged-stock.service.ts:47-54` phải viết chú thích dài để né. QueryBuilder tự map property → cột và tự bind kiểu, nên bẫy đó biến mất |
| Cache `Map<itemId, total>` theo chi nhánh trong Redis | Tồn kho là thứ biến động nhất trong hệ. Cache nó là đổi một vấn đề hiệu năng lấy một vấn đề đúng-sai, và số tồn sai trên màn bán hàng đắt hơn 91 ms |
| Chuyển PM2 sang cluster mode | Che triệu chứng, không sửa nguyên nhân: 91 ms CPU đồng bộ mỗi request vẫn còn, chỉ là chia cho N luồng. Và cần kiểm chứng Socket.IO + Kafka consumer group trước |

## Domain model

Không có entity mới, không migration. Một kiểu trả về nội bộ:

| Type | Shape | Notes |
| --- | --- | --- |
| `loadListStockTotals` | `Map<string, number>` — `itemId` → tổng tồn | Item không có dòng nào thì vắng mặt trong map; `listProducts` đã xử lý bằng `?? 0` |

Đối chiếu với `ItemStock` của `loadBranchStock` (`{ total, sellableTotal, locations[] }`):
đường list chỉ từng dùng `total`, nên `Map<string, number>` là đúng đủ.

## Contracts

### `GET /pos/branches/:branchId/catalog/products`

**Không đổi.** Request, response, `PosProductCardDto`, phân trang, `direction`,
`categoryId`, `search`, `sortBy`, `sortOrder` — tất cả giữ nguyên. Không cần chạy lại
`pnpm openapi:generate`, không đổi `packages/api-client`.

### Truy vấn gộp (hình dạng)

```
SELECT sb.item_id, SUM(sb.quantity)
  FROM stock_balances sb
 INNER JOIN locations l
    ON l.id = sb.location_id
   AND l.organization_id = :orgId
   AND l.is_active = true
 WHERE sb.organization_id = :orgId
   AND sb.branch_id       = :branchId
   AND sb.is_tracked      = true
   [direction=SHOWROOM ]  AND l.storage_id IN (:...showroomStorageIds)
   [direction=WAREHOUSE]  AND (l.storage_id IS NULL OR l.storage_id NOT IN (:...showroomStorageIds))
 GROUP BY sb.item_id
```

`SUM` trên cột `numeric` trả về chuỗi qua node-postgres; `Number()` một lần cho mỗi
item. Cách hiện tại là `Number()` từng dòng rồi cộng float trong JS, nên đây là ít sai
số hơn chứ không nhiều hơn (A-01).

## Bảng đối chiếu ngữ nghĩa

Từng nhánh của vòng lặp hiện tại, và thứ thay thế nó. Đây là chỗ feature này đúng hoặc sai.

| Hành vi hôm nay (`loadBranchStock`) | Tương đương trong truy vấn gộp |
| --- | --- |
| `if (!loc) continue` — location không active hoặc khác org bị bỏ | `INNER JOIN` với đúng hai vị từ đó |
| `where.isTracked = true` | `sb.is_tracked = true` |
| `Number(b.quantity) \|\| 0`, NULL thành 0 | `SUM` bỏ qua NULL — cùng kết quả |
| Item không có dòng nào → vắng trong map → `?? 0` | Không có dòng nào → không có nhóm → vắng trong map |
| `direction=SHOWROOM`, chi nhánh không có showroom → mọi dòng bị bỏ → map rỗng | `showroomStorageIds` rỗng → trả `Map` rỗng ngay, không chạy truy vấn |
| `direction=WAREHOUSE`, chi nhánh không có showroom → giữ mọi dòng | Không thêm vị từ nào |
| `storageId` NULL, `direction=WAREHOUSE` → `has(undefined)` là false → giữ | `l.storage_id IS NULL OR …` → giữ |
| `storageId` NULL, `direction=SHOWROOM` → bỏ | `IN` gặp NULL trả NULL → bỏ |
| Một `location_id` khớp đúng một dòng `locations` (khoá chính) | `INNER JOIN` không nhân dòng |

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Khung thẻ theo org (`CachedCard[]`) | Redis qua `CacheService`, key `catalogCardsKey(orgId)` | `CATALOG_CACHE_TTL_SECONDS`, xoá khi ghi item/product — **không đổi** |
| Tồn theo chi nhánh | Không cache, đọc live mỗi request — **không đổi** |

## Error taxonomy

| Condition | Failure | UI |
| --- | --- | --- |
| Truy vấn gộp lỗi (DB down, sai kiểu tham số) | Lỗi TypeORM lan lên → 500 qua `HttpExceptionFilter` | Giống mọi lỗi 5xx khác của endpoint này hôm nay; không có nhánh nuốt lỗi mới |
| `showrooms` trả 0 dòng khi có `direction` | **Không phải lỗi** — chi nhánh chưa cấu hình showroom là trạng thái hợp lệ. `SHOWROOM` trả map rỗng, `WAREHOUSE` trả mọi dòng. Đúng như hôm nay |
| `branchId` không thuộc org của actor | Đã chặn ở `BranchScopeGuard` trước khi vào service — không đổi |
| Item có tồn nhưng mọi location đã ngừng hoạt động | `quantityOnHand = 0`, thẻ vẫn hiện. Đúng như hôm nay |

## Observability

Không thêm log. Tín hiệu là con số có sẵn: dòng `LoggingInterceptor` cho
`GET …/catalog/products` và cho các endpoint bắn cùng lúc lúc POS mở trang. Đó chính là
dữ liệu đã dựng nên phần Problem, nên trước/sau so được trực tiếp.

## ADRs

### ADR-01 — Đường list có loader riêng; `loadBranchStock` không bị chạm

**Context:** ADR-01 của `pos-variant-stock-columns` đã quyết định không sửa
`loadBranchStock`, vì `sellableQuantity` sinh ra từ đó là ngưỡng cảnh báo bán vượt tồn
do hai feature trước định nghĩa. Feature này cần đúng cái method ấy nhanh hơn.

**Decision:** Giữ nguyên quyết định cũ. Thêm `loadListStockTotals` chạy độc lập, chỉ
trên đường list. `loadBranchStock` giữ nguyên từng dòng và tiếp tục phục vụ đường detail.

**Consequences:** Hồi quy `sellableQuantity` là bất khả thi về mặt cơ học — cùng lập
luận, cùng hình dạng như ADR-01 cũ. Cái giá cũng như cũ và nay là **ba** nơi lặp lại bộ
lọc `is_tracked` / `is_active` (`loadBranchStock`, `loadDetailStockExtras`,
`loadListStockTotals`); T-01-02 ràng bằng test parity, và bảng "Đối chiếu ngữ nghĩa"
phía trên là nơi đọc khi luật lọc đổi. Nếu con số ba này thành bốn, hãy hợp nhất trước
khi thêm.

**Status:** accepted

### ADR-02 — QueryBuilder + đọc `showrooms` riêng, không phải một câu SQL thô

**Context:** Truy vấn gộp cần lọc theo storage của showroom. Cách gọn nhất trên giấy là
một câu SQL thô với `EXISTS` trên `showrooms`. Nhưng `stock_balances.branch_id` là
`varchar` còn `showrooms.branch_id` là `uuid`.

**Decision:** Dựng truy vấn bằng QueryBuilder trên `balanceRepo`, và khi có `direction`
thì đọc `showrooms` bằng một `showroomRepo.find()` riêng (đúng lượt đọc mà
`loadBranchStock` đang làm), rồi truyền danh sách `storageId` vào như tham số.

**Consequences:** Thêm một truy vấn nhỏ ở nhánh `direction` — nhưng nhánh đó vốn đã đọc
`showrooms`, nên không phải chi phí mới, và đường mặc định (không `direction`) vẫn đúng
một truy vấn. Đổi lại, không có tên bảng/cột viết tay và không có bẫy ép kiểu. Không
thêm dependency inject nào: `balanceRepo` và `showroomRepo` đã có sẵn trong constructor.

**Status:** accepted

### ADR-03 — Option A bây giờ, Option B để sau

**Context:** Cắt trang trước rồi chỉ nạp tồn cho ~30 thẻ đo được **4.2 ms** so với
18.4 ms của truy vấn gộp — nhanh hơn 4 lần nữa.

**Decision:** Làm Option A trước. Option B là một feature riêng, sau khi A đã chạy thật.

**Consequences:** Bỏ lại 14 ms. Đổi lại, thay đổi này là một phép thay thế thuần: cùng
đầu vào, cùng đầu ra, `quantityOnHand` đối chiếu được từng con số — nên nó review được
bằng bảng "Đối chiếu ngữ nghĩa" chứ không cần suy luận về thứ tự sắp xếp. Option B thì
đổi cả *trình tự* của `listProducts` (lọc → sắp → cắt → nạp) và không phục vụ được
`sortBy=quantityOnHand` nếu không giữ đường gộp làm dự phòng; trộn hai việc đó vào một
lần thay đổi là cách chắc chắn để không biết cái nào làm sai số tồn. `loadListStockTotals`
của A **chính là** đường dự phòng mà B sẽ cần, nên A không phải việc bỏ đi.

**Status:** accepted
