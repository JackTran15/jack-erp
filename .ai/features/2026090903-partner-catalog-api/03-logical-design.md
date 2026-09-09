---
feature: partner-catalog-api
adr_count: 6
---

# Logical design — 3 API danh mục hàng hoá cho đối tác

## Approach

Dựng một module chỉ-đọc mới `apps/api/src/modules/partner-catalog/` theo đúng khuôn CQRS
v2 của repo (controller mỏng dispatch qua `QueryBus` → Query → `@QueryHandler`), phơi ba
route dưới prefix `partner/catalog` với `@Version('2')`. Module không có entity riêng,
không có migration schema, không sửa một dòng nào của `inventory` hay `pos`; nó đọc
`inventory_item_categories`, `products`, `items`, `product_attribute_definitions`,
`product_attribute_options`, `item_attribute_values` và `stock_balances` qua repository
sẵn có, rồi chiếu ra một bộ DTO riêng mà giá vốn không tồn tại.

Ba endpoint chia việc theo đúng ba màn hình của storefront:

- **Cây nhóm hàng** — một truy vấn lấy 62 dòng nhóm, một truy vấn đếm product theo
  `category_id`, dựng cây và cộng dồn `productCount` lên nhánh cha trong RAM.
- **Tìm sản phẩm** — toàn bộ lọc/đếm/sắp xếp/phân trang đẩy xuống SQL; đơn vị kết quả là
  **product**, còn giá, màu, size, tồn kho là các đại lượng gộp từ `items` con của nó.
- **Chi tiết sản phẩm** — một product cùng toàn bộ biến thể `is_active` và tổ hợp thuộc
  tính của từng biến thể.

Điểm cần cẩn thận nhất không phải là truy vấn mà là **hai chỗ mô hình dữ liệu không nằm
ở nơi người ta tưởng**: giá nằm ở `items.selling_price` (không ở product) và nhóm hàng nằm
ở `items.category_id` (cũng không ở product). Mọi thứ đối tác coi là "thuộc tính của sản
phẩm" thực chất là phép gộp trên các item con.

## Alternatives rejected

| Option | Why not |
|---|---|
| Thêm bộ lọc vào `POST /v2/inventory-items/search` rồi cấp cho đối tác | `InventoryItemGroupRowDto:141` trả `purchasePrice`, và DTO đó đang phục vụ backoffice. Sửa nó là kéo hợp đồng đối tác vào màn quản trị nội bộ; không sửa nó là để lộ giá vốn. Xem ADR-01 |
| Dựng GraphQL cho đối tác | Repo chưa có `@nestjs/graphql`; thêm một mô hình truy vấn thứ hai chỉ vì ba endpoint đọc là chi phí không tương xứng |
| Bảng phi chuẩn hoá `partner_catalog_products` cập nhật bằng consumer Kafka | Danh mục 4.731 product không đủ lớn để cần vật chất hoá. Thêm một đường dữ liệu bất đồng bộ là thêm một loại lỗi (lệch dữ liệu) mà bài toán chưa có |
| Trả `items` (SKU) làm đơn vị kết quả thay vì `products` | Storefront hiển thị "Giày búp bê MY88610 — 750.000đ" một thẻ cho cả 5 size. Trả SKU sẽ ra 41.718 dòng và đối tác phải tự gộp |
| Gộp product trên RAM rồi phân trang bằng JS | 41.718 item; đọc hết vào RAM mỗi request. Xem ADR-03 |
| `@Public()` cho 3 endpoint để đối tác gọi không cần key | Bỏ hẳn xác thực và bỏ luôn khả năng thu hồi truy cập. `api-key-auth` đã dựng sẵn đường đúng |
| Cursor pagination | Đối tác cần "Hiển thị 1–20 của 107 kết quả" và nhảy tới trang 6 — cursor không cho nhảy trang (A-10) |

## Domain model

Không có entity mới. Bảng đọc và vai trò của từng bảng:

| Bảng | Vai trò trong bề mặt đối tác | Ghi chú |
|---|---|---|
| `inventory_item_categories` | Nút của cây nhóm hàng | Adjacency list `parent_group_id`; lọc `status = 'ACTIVE'` |
| `products` | Đơn vị "sản phẩm" mà đối tác thấy | `id`, `code`, `name`, `description`, `is_active`, `created_at` |
| `items` | Biến thể (SKU) | Nguồn của `selling_price`, `category_id`, `variant_label`, `is_active` |
| `product_attribute_definitions` | Chiều thuộc tính của một product | Theo từng product; tên `"Color"` / `"Size"` (A-03) |
| `product_attribute_options` | Giá trị có thể chọn của một chiều | `value_label` là **mã thô** với màu (A-02) |
| `item_attribute_values` | Tổ hợp thuộc tính của một biến thể | Một dòng mỗi chiều; unique `(item_id, attribute_definition_id)` |
| `stock_balances` | Nguồn của cờ `inStock` | Gộp `quantity` theo `item_id`, lọc `branch_id` theo quyền của key |

Ba DTO chiếu ra ngoài — đây là toàn bộ bề mặt công khai:

| DTO | Trường |
|---|---|
| `PartnerCategoryNodeDto` | `id, code, name, parentId, productCount, children[]` |
| `PartnerProductRowDto` | `id, code, name, categoryId, categoryName, priceMin, priceMax, colors[], sizes[], inStock, images[]` |
| `PartnerProductDetailDto` | `PartnerProductRowDto` + `description, attributes[], variants[]` |

Không DTO nào có `purchasePrice`, `isPosVisible`, `branchId`, `createdBy`, `organizationId`.

## Contracts

### 1. `POST /v2/partner/catalog/categories/tree`

Request: `{}` (không tham số ở phiên bản này)

Response 200:
```json
{ "data": [ { "id": "…", "code": "01", "name": "GIÀY DÉP", "parentId": null,
              "productCount": 40,
              "children": [ { "id": "…", "code": "1002", "name": "Giày nữ",
                              "parentId": "…", "productCount": 40, "children": [] } ] } ] }
```

### 2. `POST /v2/partner/catalog/products/search`

Request:
```json
{ "keyword": "búp bê", "categoryId": "…",
  "priceFrom": 500000, "priceTo": 1000000,
  "colors": ["BA"], "sizes": ["38", "39"],
  "sort": "newest", "page": 1, "limit": 20 }
```
Mọi trường optional. `sort` ∈ `newest` (mặc định) | `price_asc` | `price_desc`.
`limit` ∈ [1, 100], mặc định 20.

Response 200:
```json
{ "data": [ { "id": "…", "code": "MY88610", "name": "Giày búp bê MY88610",
              "categoryId": "…", "categoryName": "Giày nữ",
              "priceMin": 750000, "priceMax": 750000,
              "colors": ["BA"], "sizes": ["35","36","37","38","39"],
              "inStock": true, "images": [] } ],
  "total": 107, "page": 1, "limit": 20 }
```

### 3. `GET /v2/partner/catalog/products/:productId`

Response 200: `PartnerProductRowDto` cộng thêm
```json
{ "description": "…",
  "attributes": [ { "name": "Size", "options": ["35","36","37","38","39"] },
                  { "name": "Color", "options": ["BA"] } ],
  "variants": [ { "id": "…", "code": "MY88610-BA-38", "variantLabel": "38 · BA",
                  "price": 750000, "inStock": true,
                  "attributes": { "Size": "38", "Color": "BA" } } ] }
```

## Error taxonomy

| Condition | HTTP | Nơi sinh ra | Body đối tác nhận |
|---|---|---|---|
| Không có `Authorization` và không có `X-Api-Key` | 401 | `AuthGuard.canActivate` (`auth.guard.ts:52`) | `Unauthorized` |
| `X-Api-Key` không tồn tại hoặc đã thu hồi | 401 | `AuthGuard.authenticateApiKey` (`auth.guard.ts:89`) | `Invalid API key` |
| Key hợp lệ nhưng IP ngoài whitelist | 403 | `AuthGuard.authenticateApiKey` (`auth.guard.ts:93`) | `Forbidden` |
| Key thiếu `partner.catalog.read` | 403 | `PermissionGuard` | `Forbidden` |
| Field lạ, `limit > 100`, `sort` sai, `categoryId` không phải uuid | 400 | `ValidationPipe` toàn cục | danh sách lỗi của class-validator |
| `productId` không tồn tại, thuộc tổ chức khác, hoặc mọi biến thể `is_active = false` | 404 | `GetPartnerProductHandler` | `NotFoundException` với thông điệp **giống hệt** cho cả ba trường hợp |
| Lỗi DB | 500 | filter mặc định của Nest | `Internal server error` |

Nguyên tắc: **404 phải không phân biệt được** giữa "không có" và "có nhưng của tổ chức
khác" (AC-17). Trả 403 cho trường hợp thứ hai là xác nhận id đó tồn tại.

## Sở hữu dữ liệu và phạm vi

| Dữ liệu | Nguồn phạm vi | Lưu ý |
|---|---|---|
| Tổ chức | `actor.organizationId` từ shadow user của key | Đối tác không truyền được, không đổi được (A-01) |
| Chi nhánh (chỉ cho `inStock`) | `actor.branchIds`; `NULL` trong `api_keys.branch_ids` nghĩa là mọi chi nhánh của tổ chức, đã được `ApiKeyAuthService` giải sẵn | Header `X-Branch-Id` **không** ảnh hưởng kết quả (AC-12) |
| Danh mục (nhóm, product, item, thuộc tính) | Chỉ `organizationId` | `ScopingPolicy.ORGANIZATION`; `branch_id` không tham gia lọc catalog |

## Hiệu năng

- Đơn vị phân trang là `products`; lọc theo màu/size/giá là các `EXISTS` trên `items`
  tương quan với `products`, **nối bằng AND**, không phải `OR EXISTS`.
- `categories/tree` chạy đúng 2 truy vấn (62 dòng nhóm + một `GROUP BY category_id`); phần
  cộng dồn lên cây làm trong RAM.
- Số `total` lấy bằng `COUNT` cùng điều kiện, chạy song song với truy vấn dữ liệu
  (`Promise.all`) như `search-inventory-items-v2.handler.ts`.
- `decimal` phải `::float` tường minh trong SQL, nếu không TypeORM trả về **string** và
  `priceMin` trong JSON thành `"750000.00"` (`item-crud.service.ts:1380` là tiền lệ).

## Observability

Không thêm event Kafka (bề mặt chỉ đọc). `request.user.apiKeyId` đã được `AuthGuard` gắn
sẵn (`auth.guard.ts:99-105`) nên log truy cập của đối tác truy được về từng key mà module
này không phải làm gì thêm.

## ADRs

### ADR-01 — Bề mặt đọc riêng cho đối tác, không mở rộng endpoint kho nội bộ

**Context:** `POST /v2/inventory-items/search` gần như đúng thứ đối tác cần, nhưng
`InventoryItemGroupRowDto:141` trả `purchasePrice` (giá vốn trung bình) và DTO đó đang
phục vụ backoffice. `GET /inventory/items/products` cũng vậy (`item-crud.service.ts:1380`).
Feature `api-key-auth` từng chốt "tái dùng endpoint hiện có, không dựng route mới" — nhưng
quyết định đó nói về **xác thực** (không dựng guard/route riêng để không quên gắn), không
nói về **hợp đồng dữ liệu**.

**Decision:** Module mới `modules/partner-catalog/` với DTO riêng. Không sửa DTO, handler
hay controller nào của `inventory`/`pos`.

**Consequences:** Lặp lại một phần logic gộp item→product (~1 handler). Đổi lại: danh sách
trường đối tác thấy là một danh sách đóng, review được trong một file; và backoffice thêm
cột không kéo theo việc rò trường ra ngoài. Nếu về sau muốn gộp hai bề mặt, đường đi là
tách phần dựng CTE dùng chung — `buildCombinedCte` đã có tiền lệ được export và dùng lại
bởi `MobileProductService`.

**Status:** accepted

### ADR-02 — Quyền riêng `partner.catalog.read`, không tái dùng `inventory.read`

**Context:** Nếu key đối tác mang `inventory.read`, nó gọi được `/v2/inventory-items/search`
và đọc giá vốn — đúng thứ ADR-01 vừa chặn. Bề mặt riêng chỉ có giá trị khi quyền cũng riêng.

**Decision:** Seed quyền mới `partner.catalog.read` (module `partner-catalog`) trong
`permissions.seed.ts`, tạo một role "Đối tác" chỉ mang quyền này, và gán role đó cho shadow
user khi cấp key cho đối tác. Ba endpoint dùng `@RequirePermission('partner.catalog.read')`.
**Không** gỡ `purchasePrice` khỏi DTO nội bộ — việc đó lan sang backoffice, trái ràng buộc
"không sửa DTO backoffice/POS".

**Consequences:** Người cấp key phải chọn đúng role; chọn nhầm `inventory.read` là mở lại
lỗ. Giảm nhẹ bằng AC-20: một test chứng minh key chỉ có `partner.catalog.read` nhận 403 từ
`/v2/inventory-items/search`.

**Status:** accepted

### ADR-03 — Đẩy lọc, đếm, sắp xếp, phân trang xuống SQL

**Context:** Repo có **hai** quy ước xung khắc. Một bên là hướng dẫn "ưu tiên gộp trên
RAM": lấy dòng thô rồi tính bằng JS thay vì `GROUP BY`. Bên kia là các handler v2 mới nhất
đẩy hết xuống SQL — `search-inventory-items-v2.handler.ts:152-157` ghi rõ "fully pushed to
SQL … the org's full item set is never loaded into memory", và loạt báo cáo kho v2 đã đẩy
lọc/đếm/tổng xuống SQL.

**Decision:** Theo bên thứ hai cho `products/search`, vì đây là tiền lệ **gần nhất về hình
dạng bài toán** (gộp item→product, phân trang, cùng bảng, cùng phạm vi tổ chức) và vì quy
mô — 41.718 item — làm phương án RAM hỏng ngay ở request đầu tiên. Quy ước "gộp trên RAM"
vẫn áp dụng ở chỗ nó đúng: `categories/tree` cộng dồn `productCount` trên 62 nút trong RAM
(ADR-04).

**Consequences:** Handler `products/search` viết SQL thô như handler item v2, không dùng
`FilterBuilder` (`FilterBuilder` bọc `SelectQueryBuilder`, không dùng được trên CTE). Mất
tính tái dùng của `FilterBuilder`, đổi lấy đúng một hình dạng truy vấn đã được chứng minh
trên chính bảng này. Sự xung khắc quy ước này được ghi lại ở đây, không tự ý chọn im lặng.

**Status:** accepted

### ADR-04 — Cây nhóm hàng dựng trong RAM, `productCount` cộng dồn lên nhánh cha

**Context:** `inventory_item_categories` là adjacency list, không có materialized path,
không có `@Tree`. 62 dòng cho toàn tổ chức. Nhóm cha thường **không** có item gắn trực
tiếp — đúng lỗi D1 của feature báo cáo kho: lọc nhóm cha bằng `=` trả 0 dòng.

**Decision:** Hai truy vấn (danh sách nhóm ACTIVE + `COUNT(DISTINCT product_id) GROUP BY
category_id`), dựng cây và cộng dồn `productCount` từ lá lên gốc bằng một lượt duyệt hậu
thứ tự trong RAM, theo cách `search-item-category-tree.handler.ts` đã làm. Cùng hàm khai
triển "nhóm + mọi nhóm con" dùng lại cho bộ lọc `categoryId` của `products/search`.

**Consequences:** Đúng ở quy mô hiện tại; nếu một tổ chức có hàng nghìn nhóm thì phải đổi
sang recursive CTE. Ngưỡng đó ghi trong ghi chú của ticket, không phải đoán trước bây giờ.

**Status:** accepted

### ADR-05 — Lọc màu + size phải khớp trên cùng một biến thể

**Context:** Người mua chọn "màu BA, size 39" nghĩa là **một đôi** vừa BA vừa 39. Một
product có biến thể (38, BA) và (39, D) không thoả. Lọc rời từng thuộc tính rồi giao ở mức
product sẽ trả sai (AC-08).

**Decision:** Một `EXISTS` trên `items` với các điều kiện thuộc tính nối bằng `AND` **bên
trong cùng một item** — không phải nhiều `EXISTS` độc lập ở mức product. Nhiều giá trị của
**cùng** một chiều (`sizes: ["38","39"]`) là `IN`; hai chiều khác nhau là `AND`.

**Consequences:** Cẩn thận với hình dạng truy vấn: `pos-catalog-search-perf` đã đo được
`OR EXISTS` chậm hơn bản gốc 20× và phải viết lại thành `UNION`. Ở đây là `AND` trong một
`EXISTS` duy nhất nên không rơi vào bẫy đó, nhưng ticket phải đo, không được suy luận.

**Status:** accepted

### ADR-06 — `inStock` là boolean toàn tổ chức, không trả số lượng

**Context:** Storefront chỉ hiển thị "Còn hàng". Trả số lượng chính xác là lộ dữ liệu
thương mại cho bên ngoài, và số đó lỗi thời ngay khi trả về.

**Decision:** `inStock = EXISTS(SELECT 1 FROM stock_balances WHERE item_id = … AND
branch_id = ANY(actor.branchIds) AND quantity > 0)`. Ở mức product là `EXISTS` trên bất kỳ
biến thể nào. Không trường `quantity` trong bất kỳ DTO nào.

**Consequences:** Đối tác không hiện được "chỉ còn 3 đôi" và không chặn được đặt vượt tồn —
đúng phạm vi, vì đặt hàng nằm ngoài feature này. Thêm số lượng về sau là thêm trường, không
phá hợp đồng.

**Status:** accepted
