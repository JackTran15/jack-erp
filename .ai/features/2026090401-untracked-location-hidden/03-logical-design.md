---
feature: untracked-location-hidden
adr_count: 3
---

# Logical design — Ẩn vị trí đã ngừng theo dõi

## Approach

Không có mô hình dữ liệu mới, không có migration, không có endpoint mới. Cột
`stock_balances.is_tracked` đã tồn tại từ `1786300000000-AddStockBalanceIsTracked`; đợt này chỉ
dạy ba chỗ đọc tôn trọng nó, và mỗi chỗ đọc dùng đúng một trong hai hình dạng:

- **Định nghĩa nghiệp vụ** — `hasItems` ("Đã xếp"). Vô điều kiện: `sb.is_tracked = true` được nhét
  thẳng vào `HAS_ITEMS_SQL` và vào truy vấn phụ của `listLocations`. Không có tham số, vì "Đã xếp"
  chỉ có một nghĩa (ADR-02).
- **Bộ lọc của người dùng** — danh sách hàng trong một vị trí. Tham số tuỳ chọn `isTracked`
  (`undefined` = tất cả), FE truyền `true` làm mặc định (ADR-01).

Cả hai đều chạy trong SQL, trước `LIMIT/OFFSET`, không bao giờ lọc sau khi phân trang (ADR-03).

Điểm tinh tế: hai hình dạng khác nhau **không** phải là bất nhất. `hasItems` là một vị từ đóng
(một vị trí "đã xếp" hay không), còn danh sách hàng là một tập mở mà người dùng cần soi từ nhiều
góc — kể cả góc "cho tôi xem thứ tôi vừa ngừng theo dõi để dọn". A-02 và A-05 là hai câu trả lời
của Akenzy cho đúng hai câu hỏi đó.

## Alternatives rejected

| Option | Why not |
|--------|---------|
| Lọc ở React sau khi nhận dữ liệu | Cả hai endpoint phân trang ở server và trả `total` từ `findAndCount`/`getCount`. Lọc sau phân trang cho ra trang thiếu dòng và tổng sai — đúng lớp lỗi D1 của đợt `2026090301`. Xem A-12. |
| Xoá `stock_balances` + `item_storage_locations` khi Ngừng theo dõi | Akenzy chốt 04/09/2026 giữ A-05 đợt trước. Xoá là không đảo ngược: "bật lại theo dõi" mất nghĩa, ngưỡng min/max mồ côi. |
| Backend mặc định `isTracked = true` cho `stock-items` | "Tất cả" hết biểu diễn được bằng một boolean, phải đẻ sentinel `'all'` hoặc cờ thứ hai; và lệch khỏi endpoint anh em mà **cùng một trang** đang gọi ở chế độ kia. Xem ADR-01. |
| Thêm cột `is_tracked` vào `locations` (denormalise) | Trạng thái theo dõi thuộc về cặp (hàng hoá × vị trí), không thuộc vị trí. Denormalise là đẻ ra một nguồn sự thật thứ hai phải đồng bộ ở mọi lối ghi. |
| Định nghĩa "Đã xếp" theo `quantity > 0` | Ẩn nhầm kệ đang theo dõi mà tạm hết hàng. Akenzy bác 04/09/2026; trùng tiền lệ A-13. |

## Domain model

Không có entity mới. Các cột liên quan, tất cả đã tồn tại:

| Bảng | Cột | Vai trò trong đợt này |
|------|-----|----------------------|
| `stock_balances` | `is_tracked` (boolean, NOT NULL, default true) | Nguồn sự thật duy nhất. Chỉ đọc trong đợt này. |
| `stock_balances` | `item_id`, `location_id`, `organization_id`, `quantity` | Khoá của "dòng" và dữ liệu hiển thị |
| `locations` | `is_unassigned` | Vị trí ảo "Chưa xếp" — đã bị loại riêng qua `includeUnassigned`, không liên quan `is_tracked` |
| `item_storage_locations` | — | **Không đụng** (A-04) |
| `item_stock_thresholds` | `min_qty`, `max_qty` | **Không đụng**; phải còn nguyên sau khi bật lại theo dõi (AC-15) |

## Contracts

### POST /v2/inventory/locations/search — không đổi hình dạng

Request và response giữ nguyên. Chỉ **nghĩa** của `hasItems` đổi:

```
hasItems = EXISTS (
  SELECT 1 FROM stock_balances sb
  WHERE sb.location_id = location.id
    AND sb.organization_id = :organizationId
    AND sb.is_tracked = true          -- ← thêm dòng này
)
```

Vế này dùng ở cả ba nơi trong handler và phải giữ nguyên tính "một vế": projection
(`addSelect`), predicate `hasItems = true`, và predicate `NOT (...)` cho `hasItems = false`.
Đó là lý do nó là một hằng `HAS_ITEMS_SQL` chứ không phải ba chuỗi chép tay.

**Cạm bẫy đã lường:** `NOT EXISTS(... AND is_tracked = true)` là **đúng** cái ta muốn cho
"Chưa xếp" — vị trí không còn dòng nào đang theo dõi, bất kể còn bao nhiêu dòng đã ngừng. Không
được viết thành `EXISTS(... AND is_tracked = false)`, vế đó có nghĩa hoàn toàn khác.

### GET /inventory/locations/:locationId/stock-items — thêm một tham số tuỳ chọn

```
?isTracked=true    → chỉ dòng đang theo dõi
?isTracked=false   → chỉ dòng đã ngừng theo dõi
(bỏ trống)         → tất cả  ← hành vi cũ, giữ nguyên (AC-14)
```

Khai trong `StockByLocationQueryDto` theo đúng khuôn của endpoint anh em
(`stock-ledger.controller.ts:107-114`): `@IsOptional() @Transform(({value}) => parseBool(value))
@IsBoolean() isTracked?: boolean`. `parseBool` đã có sẵn trong chính file DTO này (`:31-38`) và trả
`undefined` cho chuỗi rỗng — nên "Tất cả" ở FE chỉ cần **không gửi** tham số.

Áp trong `buildWhere`, cạnh các vị từ cấp `stock_balances` khác:
```ts
if (typeof query.isTracked === 'boolean') where.isTracked = query.isTracked;
```
`buildWhere` được gọi một lần ở `getStockByLocation:362` và truyền y nguyên sang nhánh
`getBelowMinStock`, nên một chỗ sửa phủ cả hai nhánh (A-08, AC-10).

Response thêm `isTracked` vào `StockByLocationItemDto` — chỉ là khai báo Swagger; `toItem:688` đã
trả trường này và `@erp/shared-interfaces` đã khai (A-07).

**Ràng buộc triển khai:** `ValidationPipe` toàn cục bật `forbidNonWhitelisted`. FE gửi `isTracked`
trước khi DTO khai nó ⇒ **400**. Thứ tự ticket phải là DTO trước, FE sau (T-02-01 → T-02-03,
T-02-01 → T-03-01), và API phải build lại trước khi verify (A-10).

## State ownership

| State | Owner | Lifetime |
|-------|-------|----------|
| Bộ lọc trạng thái của hộp thoại | `LocationStockItemsDialog` (`useState`, cùng chỗ với `filters` sẵn có) | Vòng đời hộp thoại; reset khi đóng |
| Bộ lọc trạng thái ở chế độ xem một vị trí | `ItemLocationDetailsPage` — `filters.isTracked` **đã tồn tại** (`:87`, mặc định `"true"`) | Vòng đời trang |
| `hasItems` | Server, tính mỗi request | Không cache ở client ngoài TanStack Query |
| `is_tracked` | Postgres | Bền; chỉ đổi qua `POST /inventory/stock/balances/tracking` |

Chế độ xem một vị trí **không** cần state mới: state đã có, chỉ là `locationParams`
(`ItemLocationDetailsPage.tsx:104-128`) quên chuyển nó xuống. Đó là toàn bộ lỗi P3.

## Error taxonomy

Không có lớp lỗi mới. Các đường lỗi đã có và phải giữ nguyên:

| Condition | Kết quả | UI |
|-----------|---------|-----|
| `isTracked` không parse được (`?isTracked=xyz`) | `parseBool` trả `undefined` ⇒ coi như không lọc | Không lỗi — nhất quán với endpoint anh em |
| `locationId` không tồn tại / khác tổ chức | 404 từ `resolveLocation` | Toast lỗi sẵn có |
| Thiếu `inventory.read` hoặc sai branch scope | 403 | Toast lỗi sẵn có |
| FE gửi tham số chưa khai trong DTO | 400 `forbidNonWhitelisted` | Đây là **cờ đỏ triển khai**, không phải trạng thái hợp lệ — nghĩa là API chưa build lại (A-10) |

## Cache & offline

TanStack Query, không có offline. `queryKey` phải chứa bộ lọc trạng thái, nếu không đổi bộ lọc sẽ
trả cache của bộ lọc cũ:
- Hộp thoại: hiện dùng `useState` + `apiClient` trực tiếp (`LocationStockItemsDialog.tsx:96-125`),
  không qua TanStack Query — bộ lọc mới phải nằm trong mảng phụ thuộc của `load`.
- Chế độ xem một vị trí: `["location-stock-items", activeBranchId, locationId, locationParams]`
  (`ItemLocationDetailsPage.tsx:150`) — `locationParams` đã nằm trong key, nên chỉ cần thêm
  `isTracked` vào chính object đó là key tự đổi.
- Sau khi Ngừng theo dõi / bật lại, `ItemLocationDetailsPage:422` đã invalidate đúng prefix.
  Trang "Vị trí hàng hoá" dùng key `["locations", ...]` riêng và người dùng điều hướng sang, nên
  không cần invalidate chéo.

## Observability

Không thêm event hay metric. Đợt này là logic đọc, không có ghi.

## ADRs

### ADR-01 — `isTracked` ở `stock-items` là bộ lọc tuỳ chọn, mặc định nằm ở FE
**Context:** Hộp thoại chi tiết và chế độ xem một vị trí đều cần mặc định "chỉ đang theo dõi",
nhưng Akenzy cũng yêu cầu giữ lối xem lại hàng đã ngừng (A-05). Ba trạng thái, một tham số.
**Decision:** `isTracked?: boolean` trên `StockByLocationQueryDto`; `undefined` = tất cả. Backend
không tự mặc định. Mỗi FE call-site tự truyền `true` khi khởi tạo bộ lọc.
**Consequences:** Tương thích ngược tuyệt đối (AC-14). Ba trạng thái biểu diễn được bằng một
tham số, không cần sentinel `'all'`. Hợp đồng trùng khít endpoint anh em
`GET /inventory/stock/balances` mà **cùng trang đó** gọi ở chế độ kia — hai chế độ của một trang
không còn hai ngữ nghĩa. Đổi lại: một call-site tương lai quên truyền tham số sẽ tái hiện lỗi
#21 — đúng rủi ro A-05 đợt `2026090301` cảnh báo. Giảm thiểu bằng test ghim **cả hai** call-site
(T-02-03, T-03-01) chứ không chỉ test backend.
**Status:** accepted

### ADR-02 — `hasItems` siết `is_tracked` vô điều kiện, không qua tham số
**Context:** `HAS_ITEMS_SQL` vừa là projection vừa là predicate của bộ lọc cột "Xếp hàng hoá".
Nếu để tuỳ chọn thì hai vế có thể lệch nhau và bộ lọc sẽ mâu thuẫn với cột nó lọc.
**Decision:** Nhét `AND sb.is_tracked = true` thẳng vào hằng `HAS_ITEMS_SQL`, và vào truy vấn phụ
tương ứng của `listLocations`. Không thêm tham số nào vào `LocationSearchV2Dto`.
**Consequences:** "Đã xếp" có đúng một nghĩa trên toàn hệ thống. Không có đường xem "vị trí có
dòng đã ngừng" từ trang "Vị trí hàng hoá" — chấp nhận được, vì đường đó là trang "Chi tiết vị trí"
và hộp thoại chi tiết ở bộ lọc "Ngừng theo dõi"/"Tất cả". Nếu sau này thật sự cần, đây là chỗ phải
mở lại (`aidlc reopen G2`), không phải chỗ để vá tại chỗ.
**Status:** accepted

### ADR-03 — Lọc trong SQL, trước phân trang
**Context:** Cám dỗ lớn nhất là lọc `row.isTracked` trong React vì cả hai màn hình đều đã có
trường đó trong dữ liệu trả về.
**Decision:** Mọi thay đổi lọc nằm trong `buildWhere` / `HAS_ITEMS_SQL`. React chỉ truyền tham số.
**Consequences:** `total` và số dòng mỗi trang luôn khớp bộ lọc (AC-09). Chặn trước đúng lớp lỗi
D1 của đợt `2026090301` (ghép/lọc dòng sau khi đã phân trang, làm trang 1 sai và trang ≥2 mất
dòng). Đổi lại: mỗi bộ lọc mới phải đi qua backend, không "sửa nhanh ở FE" được.
**Status:** accepted
