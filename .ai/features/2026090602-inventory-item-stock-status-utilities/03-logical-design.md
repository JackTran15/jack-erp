---
feature: inventory-item-stock-status-utilities
adr_count: 5
---

# Logical design — "Trạng thái hết hàng" + "Tiện ích"

## Approach

Hai việc, một màn hình, và cả hai đều là **nối dây cho thứ đã tồn tại** chứ không phải dựng
mới. Bộ lọc hết hàng là **một cột tổng cộng thêm vào CTE sẵn có** của
`search-inventory-items-v2.handler.ts` cộng một cờ boolean trong DTO; bulk đổi trạng thái là
**một route HTTP mở ra cho `InventoryInventoryItemCrudService.setActiveStatus`** — hàm đã viết xong, đã có quy
tắc nghiệp vụ, nhưng chưa ai gọi. Phía frontend, cả hai nút đã nằm sẵn trên thanh công cụ và
chỉ đang bắn toast "đang được triển khai"; việc cần làm là thay thân `onClick`.

Điểm cần cẩn thận nhất không nằm ở SQL mà ở **danh tính của dòng**: lưới trả về nhóm, nên
`row.id` là `products.id` với dòng `type:'product'` và `items.id` với dòng `type:'orphan'`.
Còn `setActiveStatus` thì cập nhật bảng `items`. Đưa thẳng `row.id` vào là một `UPDATE ...
WHERE id IN (...)` không khớp dòng nào — **không lỗi, không cảnh báo, chỉ đơn giản là không
có gì xảy ra**. Đây là chế độ hỏng nguy hiểm nhất của feature này và ADR-04 tồn tại để chặn nó.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Nạp `stock_balances` lên RAM rồi cộng bằng JS (theo thói quen "prefer in-memory aggregation" của repo) | Handler này **đã đẩy toàn bộ xuống SQL** và docstring của nó nói rõ "the org's full item set is never loaded into memory". Kéo 164.481 dòng lên RAM chỉ để lọc là đi ngược chính file đang sửa. Xem ADR-01 |
| Tái dùng `StockStateFilter.OUT_OF_STOCK` | Enum đó nghĩa là `SUM = 0` đúng bằng 0, còn yêu cầu là `≤ 0`. Repo lại có hai enum khác nhau cùng tên. Tái dùng sẽ khiến hai màn hình cùng chữ "hết hàng" cho hai tập kết quả khác nhau mà không ai giải thích được. Xem ADR-03 |
| Gọi `PATCH /admin/entities/inventory-items/records/:id` N lần từ FE (đường sẵn có, đã tự nở ra biến thể) | N request cho N dòng; hỏng giữa chừng để lại trạng thái nửa vời; quy tắc Showroom bắn 400 lẻ từng cái nên không gộp được thành một cảnh báo. Bulk delete hiện tại đang làm đúng kiểu này và đó là thứ không nên nhân bản |
| Bắt FE gửi danh sách `items.id` | FE không có chúng: dòng nhóm chỉ mang `itemCount`, không mang id của biến thể. Muốn có thì phải gọi thêm N request tra biến thể trước khi đổi trạng thái |
| Thêm cột "Tồn" vào lưới để người dùng đối chiếu | Akenzy đã chốt chỉ làm nút lọc (A-03) |

## Domain model

Không có thực thể mới, không có migration. Ba bảng sẵn có tham gia:

| Entity | Vai trò trong feature | Ghi chú |
| --- | --- | --- |
| `ItemEntity` (`items`) | Nơi cờ `is_active` thực sự sống; một biến thể = một dòng | `product_id` **nullable** ⇒ luôn phải có nhánh mồ côi |
| `ProductEntity` (`products`) | Nhóm gộp; có `is_active` **riêng** | Không tự tham chiếu — không có `parent_product_id`. 56 dòng đang lệch cờ so với items |
| `StockBalanceEntity` (`stock_balances`) | Nguồn số tồn | Khoá `(organization_id, item_id, location_id)`; `quantity` numeric **được phép âm**; `branch_id` là **varchar** |

## Contracts

### 1. `POST /v2/inventory-items/search` — thêm một cờ

Request: bổ sung đúng một trường vào `InventoryItemSearchV2Dto`:
```jsonc
{ "outOfStock": true }   // optional boolean; vắng mặt hoặc false ⇒ hành vi y như hiện nay
```
Response: **không đổi** — vẫn `{ data, total, page, limit }` với `InventoryItemGroupRowDto`
nguyên vẹn. Không thêm trường tồn vào row (A-03).

Khi `outOfStock !== true`, câu SQL sinh ra phải **giống hệt hiện tại**: không join thêm,
không subquery thừa. Đây là điều kiện để tin rằng feature không làm chậm màn hình cho 100%
lượt dùng còn lại.

Khi `outOfStock === true`, CTE `combined` được cộng thêm một cột tổng, tính bằng subquery
tương quan theo đúng khuôn `PIVOT_TOTAL_SQL` (`stock-balance-pivot.service.ts:57-70`):

```sql
-- nhánh 'product': cộng tồn của MỌI biến thể thuộc sản phẩm, trong chi nhánh đang chọn
COALESCE((
  SELECT SUM(sb.quantity)
  FROM stock_balances sb
  JOIN locations  loc ON loc.id = sb.location_id
  JOIN storages   st  ON st.id  = loc.storage_id
  WHERE sb.item_id IN (SELECT i2.id FROM items i2 WHERE i2.product_id = p.id)
    AND sb.organization_id = $1
    AND sb.branch_id = $branch      -- varchar = varchar, KHÔNG ép ::uuid (ADR-02)
    AND sb.is_tracked = true
    AND loc.is_active = true
    AND st.is_active  = true
), 0) AS "stockTotal"
```
Nhánh `'orphan'` giống hệt, chỉ đổi `sb.item_id = i.id`.
Vị từ lọc nằm ở `WHERE` ngoài, cạnh các bộ lọc cột khác nên **kết hợp AND** tự nhiên (AC-05):
`"stockTotal" <= 0`.

Ba tính chất phải giữ, mỗi cái ứng với một AC:
- `LEFT`-semantics qua `COALESCE(..., 0)` ⇒ nhóm không có dòng tồn nào vẫn ra 0 (AC-03, AC-08);
- `SUM` **không kẹp** `GREATEST(0, …)` ⇒ -1 và 1 triệt tiêu thành 0 (AC-02);
- ngưỡng `<= 0`, không phải `= 0` (ADR-03).

Failure modes: 400 → DTO sai kiểu; 401/403 → thiếu `inventory.read`.

### 2. `POST /inventory/items/set-active-status` — route mới cho hàm đã có

Đặt trên `InventoryLocationController` (`@Controller('inventory')`) cạnh `PATCH
/inventory/items/:id`, **không** đặt trên `InventoryItemV2Controller` — controller kia là
CQRS `QueryBus` thuần đọc, còn đây là mutation dùng service trực tiếp, đúng như CLAUDE.md
phân công.

```jsonc
// Request — chỉ id, không cần type (ADR-04)
{ "ids": ["<products.id hoặc items.id>", "..."], "isActive": false }

// Response 200
{ "updated": 37,
  "skipped": [ { "code": "ABA2777", "reason": "IN_SHOWROOM" } ] }
```
- `@RequirePermission('inventory.write')` (AC-17).
- Là mutation ⇒ tự động chịu `IdempotencyInterceptor` toàn cục (AC-19). FE phải phát khoá
  **theo thao tác** (băm từ `ids` + `isActive`), không phát UUID mới mỗi lần bấm.
- ⚠️ Thứ tự route: khai báo path tĩnh `items/set-active-status` **trước** mọi route
  `items/:id` trong cùng controller, nếu không `:id` sẽ nuốt mất nó.

Failure modes: 403 → thiếu `inventory.write`; 400 → `ids` rỗng/không phải uuid; 200 kèm
`skipped` **không phải lỗi** — đó là đường đi bình thường của AC-14.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| `outOfStockOnly: boolean` | `CrudListPage` (state cục bộ) | Màn hình; **không** khôi phục sau reload (A-11) |
| Vùng chọn `selectedRecordIds` | `CrudListPage` — đã có | Màn hình; reset khi đổi trang |
| Hộp thoại xác nhận đổi trạng thái + mutation | `InventoryItemsPage`, đưa xuống qua `inventoryConfig.renderDialogs` — điểm mở rộng đã có sẵn | Màn hình |
| Dữ liệu lưới | TanStack Query qua `useCrudV2Search` — đã có | Cache theo queryKey |

`outOfStockOnly` phải nằm ở `CrudListPage` chứ không phải `InventoryItemsPage`, vì thân
request v2 được dựng trong `CrudListPage`. Đổi lại, handler của Tiện ích nằm ở
`InventoryItemsPage` và đi xuống theo đúng con đường mà `onImportInventory` /
`onExportInventorySelected` đang đi — không phát minh cơ chế mới.

Khi `outOfStockOnly` đổi giá trị phải `setPage(1)`, giống mọi handler lọc khác
(`CrudListPage.tsx:650-692`); nếu không, đang ở trang 40 mà bật lọc còn 12 trang sẽ ra lưới rỗng.

## Error taxonomy

| Condition | Biểu hiện | UI |
| --- | --- | --- |
| Thiếu `inventory.write` | 403 | Menu Tiện ích đã ẩn từ trước; nếu vẫn lọt thì toast lỗi |
| Có mặt hàng ở Showroom | 200 + `skipped[]` | Toast cảnh báo: "Đã cập nhật N mặt hàng. M mã đang ở Showroom được bỏ qua: …" |
| Toàn bộ bị bỏ qua (`updated = 0`) | 200 + `skipped[]` đầy | Toast cảnh báo, **không** báo thành công |
| `ids` rỗng | 400 | Không xảy ra: menu chỉ bật khi có dòng được chọn |
| Mất mạng / 5xx | Exception | Toast lỗi, lưới giữ nguyên, không cập nhật lạc quan |

Không dùng optimistic update: trạng thái kinh doanh ảnh hưởng tới catalog POS, và kết quả
thật có thể khác kỳ vọng vì `skipped[]`.

## Observability

Không thêm event Kafka. `setActiveStatus` đã gọi `invalidatePosCatalogCache(actor)` — giữ
nguyên, đó là AC-20. Ghi log cảnh báo khi `skipped.length > 0` để dò được trên prod.

## ADRs

### ADR-01 — Tổng tồn tính bằng SQL trong CTE sẵn có, không gộp trên RAM
**Context:** Repo có quy ước "ưu tiên gộp trên RAM bằng JS" và ghi chú dự án cũ mô tả handler
này gộp nhóm trong bộ nhớ. Đọc lại mã nguồn thì điều đó **không còn đúng**: handler đã đẩy
hết xuống SQL từ lần viết lại, kèm docstring khẳng định không nạp toàn bộ item lên RAM. Dữ
liệu thật: 41.718 mặt hàng, 164.481 dòng tồn cho một tổ chức.
**Decision:** Cộng tồn bằng subquery tương quan ngay trong CTE `combined`, theo khuôn
`PIVOT_TOTAL_SQL` đã dùng ở báo cáo tồn theo cửa hàng.
**Consequences:** Nhất quán với chính file đang sửa và với tiền lệ "đẩy lọc/đếm/tổng xuống
SQL" của 7 báo cáo kho v2. Đo thử: 33 ms. Đánh đổi: vị từ lọc sống trong SQL thô nên phải
kiểm bằng test tích hợp chạm DB thật, unit test mock không bắt được lỗi.
**Status:** accepted

### ADR-02 — Khoanh chi nhánh bằng `stock_balances.branch_id`, không join `storages`
**Context:** Có hai đường khoanh chi nhánh và repo chia gần 50/50. `storage.branch_id` được
chú thích là "authoritative" vì `stock_balances.branch_id` là dữ liệu phi chuẩn hoá có thể
cũ sau import. Nhưng màn "Tổng hợp tồn kho" — nơi người dùng sẽ đối chiếu khi nghi ngờ —
lại dùng `sb.branch_id`, và có sẵn index `IDX_stock_balances_org_branch_item
(organization_id, branch_id, item_id)` đúng cho truy vấn này.
**Decision:** Dùng `sb.branch_id`. Vẫn join `locations`/`storages` nhưng chỉ để lọc
`is_active`, không để lấy chi nhánh.
**Consequences:** Khớp con số với màn Tổng hợp tồn kho; trúng index. Rủi ro: nếu prod có kho
bị đổi chi nhánh sau import thì kết quả lệch — đã đo trên `erp_dev_3008`: **0/164.481** dòng
lệch giữa hai cột. Nếu về sau phát hiện lệch trên prod thì đây là **một dòng** cần đổi.
So sánh phải giữ cả hai vế kiểu text: `sb.branch_id` là varchar còn `branches.id` là uuid,
ép `::uuid` sẽ làm Postgres suy ra hai kiểu mâu thuẫn cho cùng một tham số.
**Status:** accepted

### ADR-03 — "Hết hàng" là `≤ 0`, và cố ý khác với `StockStateFilter.OUT_OF_STOCK`
**Context:** Người dùng định nghĩa rõ bằng ví dụ: `A1 = -1`, `A2 = 1` ⇒ `A = 0` ⇒ hết hàng.
Tức ngưỡng là `≤ 0`. Trong khi đó `StockStateFilter.OUT_OF_STOCK` ở màn Tổng hợp tồn kho
nghĩa là `SUM = 0` **đúng bằng 0**, và `NEGATIVE` là trạng thái tách riêng.
**Decision:** Dùng cờ boolean riêng tên `outOfStock` với ngưỡng `≤ 0`. Không import, không
mở rộng, không đổi nghĩa `StockStateFilter`.
**Consequences:** Hai màn hình dùng chung chữ "hết hàng" cho hai tập hơi khác nhau — trên
dev là 1.015 so với 1.012, chênh đúng 3 nhóm có tổng âm. Chấp nhận có chủ đích: đổi nghĩa
enum kia sẽ âm thầm đổi kết quả của một báo cáo đang chạy. Ghi lại ở đây để lần sau có người
hỏi "sao hai chỗ lệch nhau 3 dòng" thì có câu trả lời.
**Status:** accepted

### ADR-04 — Endpoint bulk nhận id của dòng lưới và tự nở ra mặt hàng ở server
**Context:** Dòng lưới mang danh tính đa hình: `products.id` hoặc `items.id`. FE không biết
id các biến thể. `setActiveStatus` lại cập nhật bảng `items`, nên đưa thẳng `row.id` vào sẽ
là một `UPDATE` không khớp dòng nào — âm thầm, không lỗi.
**Decision:** Endpoint nhận `ids: string[]` không kèm `type`, và server nở ra bằng đúng một
mệnh đề:
```sql
WHERE organization_id = $1 AND (product_id = ANY($2::uuid[]) OR id = ANY($2::uuid[]))
```
Cờ trên `products` đồng bộ bằng một `UPDATE products ... WHERE id = ANY($2::uuid[])` — id nào
là item id thì đơn giản không khớp dòng nào.
**Consequences:** FE không cần biết mô hình nhóm, và gửi nhầm `type` cũng không sai được. Bám
đúng lối `getById` đã dùng (thử item trước, rồi coi như product). Đánh đổi: mất khả năng báo
lỗi "id này không tồn tại" — id rác chỉ lặng lẽ không khớp. Chấp nhận được vì id luôn đến từ
chính lưới. Bắt buộc phải có test cho dòng `type:'product'` (AC-12), vì đây đúng là chế độ
hỏng im lặng.
**Status:** accepted

### ADR-05 — `setActiveStatus` đổi từ ném lỗi cả lô sang bỏ qua và báo lại
**Context:** Quy tắc "hàng đang ở Showroom thì không được ngừng theo dõi" hiện ném
`BadRequestException` cho **cả lô**. Với thao tác hàng loạt, chọn 50 dòng mà 1 dòng vướng là
hỏng cả thao tác, và người dùng không biết dòng nào.
**Decision:** Đổi thành: loại các mặt hàng bị chặn ra khỏi `UPDATE`, thực hiện phần còn lại,
trả về `{ updated, skipped: [{ code, reason }] }`.
**Consequences:** Quy tắc nghiệp vụ giữ nguyên — không mặt hàng nào ở Showroom bị ngừng; chỉ
cách báo lỗi đổi. An toàn khi sửa vì hàm hiện **không có caller nào** trong toàn monorepo,
nên không có hành vi cũ nào bị phá. Chiều bật lại (`isActive = true`) vẫn không kiểm tra gì,
đúng như hiện tại (AC-15).
**Status:** accepted
