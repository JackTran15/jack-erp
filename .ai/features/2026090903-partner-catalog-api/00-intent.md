---
feature: partner-catalog-api
slug: 2026090903-partner-catalog-api
owner: Akenzy
created: 2026-09-09
status: draft
---

# Intent — 3 API danh mục hàng hoá cho đối tác

## Problem

Đối tác vận hành storefront (mẫu tham chiếu: `https://giaymt.com.vn/`) cần đọc danh mục
hàng hoá của tổ chức từ jack-erp để dựng trang bán hàng: cây nhóm hàng cho menu, trang
danh sách có lọc + phân trang + sắp xếp, và trang chi tiết sản phẩm.

Hạ tầng xác thực đã sẵn sàng — feature `api-key-auth` (commit `e0f22921`) đã mở rộng
`AuthGuard` toàn cục để chấp nhận header `X-Api-Key` bên cạnh JWT, kèm IP whitelist và
shadow user để `PermissionGuard` hoạt động y hệt request JWT. Thứ còn thiếu là **dữ liệu
đọc ra ở hình dạng dùng được cho storefront**. Hôm nay không endpoint nào đáp ứng:

| Endpoint hiện có | Thiếu gì với storefront |
|---|---|
| `POST /v2/inventory/item-categories/tree` (`item-category-tree.controller.ts:22`) | Trả cây đầy đủ nhưng không có số sản phẩm mỗi nhánh; không phân biệt nhánh rỗng |
| `POST /v2/inventory-items/search` (`inventory-item-v2.controller.ts:21`) | Không lọc được theo nhóm hàng, không lọc theo màu/size, không có tham số sắp xếp — và **trả `purchasePrice` (giá vốn)** ở `InventoryItemGroupRowDto:141` |
| `GET /inventory/items/products` (`inventory-location.controller.ts:102`) | `ORDER BY code` cứng; cũng trả `purchasePrice` (`item-crud.service.ts:1380`) |
| `GET /pos/branches/:branchId/catalog/products` (`pos.controller.ts:79`) | Bắt buộc theo một chi nhánh; hình dạng phục vụ màn bán hàng POS, không phải storefront |

Điểm cốt lõi: **cả hai endpoint tra cứu hàng hoá dùng chung đều phơi giá vốn.** Cấp một
API key cho đối tác rồi bảo họ gọi endpoint nội bộ là cấp luôn quyền đọc giá nhập. Bề mặt
đọc dành riêng cho đối tác không phải là chuyện cho gọn — nó là cách duy nhất để chốt được
danh sách trường mà bên ngoài nhìn thấy.

## Affected personas

| Persona | Hành vi hiện tại | Hành vi mong muốn |
|---|---|---|
| Đối tác storefront | Không có API đọc danh mục; phải xin xuất Excel hoặc gọi endpoint nội bộ và tự lọc bỏ trường thừa | Gọi 3 endpoint có hợp đồng ổn định bằng `X-Api-Key`, nhận đúng trường công khai |
| Chủ tổ chức | Cấp API key = trao quyền đọc cả giá vốn qua các endpoint hàng hoá dùng chung | Cấp key cho đối tác mà giá vốn không nằm trong bất kỳ response nào đối tác gọi được |
| Backend engineer | Mỗi lần đối tác hỏi "trả thêm trường X" phải sửa DTO dùng chung với backoffice/POS | Sửa DTO riêng của bề mặt đối tác, không ảnh hưởng backoffice/POS |

## Success signal

- Đối tác dựng được 3 màn hình của storefront tham chiếu **chỉ bằng 3 endpoint này**:
  menu nhóm hàng nhiều cấp, trang danh sách (lọc từ khoá + nhóm hàng + khoảng giá + màu +
  size, 4 kiểu sắp xếp, phân trang kiểu "Hiển thị 1–20 của 107 kết quả"), trang chi tiết.
- `grep` toàn bộ response DTO của bề mặt đối tác không tìm thấy `purchasePrice` /
  `purchase_price` — kiểm được bằng một test, không phải bằng mắt.
- Một API key có `branchIds = NULL` và một key giới hạn 1 chi nhánh gọi cùng một endpoint
  danh mục cho **cùng** danh sách sản phẩm (danh mục là dữ liệu cấp tổ chức); chỉ cờ tồn
  kho khác nhau.
- Request lọc theo nhóm hàng cha trả về cả sản phẩm nằm ở nhóm con (cây 3 cấp), không trả 0
  dòng — đây đúng là lỗi D1 đã gặp ở feature báo cáo kho.

## Out of scope

- **Ảnh sản phẩm.** Toàn repo không có cột ảnh, không có bảng media, không có module
  upload (bằng chứng: 0 match `CREATE TABLE ...image|media|attachment` trong
  `database/migrations/`; `package.json` không có client object-storage nào). Theo chỉ đạo
  của chủ sở hữu, hợp đồng vẫn khai trường `images` và **luôn trả `[]`**, theo đúng tiền lệ
  `imageUrl: null` đã có ở `pos-catalog-product.response.dto.ts:23-27`. Việc lưu và tải ảnh
  là feature riêng.
- **Ghi dữ liệu** (đặt hàng, giữ chỗ tồn kho, đồng bộ ngược). 3 API này chỉ đọc.
- **Rate limiting theo tần suất.** `@nestjs/throttler` chưa có trong repo; `api-key-auth`
  đã loại trừ tường minh. Nếu đối tác gọi quá tay, đó là feature riêng.
- **Webhook / đẩy sự kiện thay đổi giá — tồn kho ra đối tác.** Chỉ có chiều đối tác kéo.
- **Trang quản trị cho đối tác.** Quản lý key đã có sẵn ở `/admin/api-keys`.
- **Khuyến mại / giá theo chương trình.** Trả `sellingPrice` gốc của item; module
  `promotion` không tham gia.
- **Đa ngôn ngữ.** Trả đúng chuỗi đang lưu trong DB.

## Constraints

| Kind | Detail |
|---|---|
| Xác thực | Không thêm guard mới. `AuthGuard` toàn cục đã nhận `X-Api-Key` (`auth.guard.ts:47-50`). Tuyệt đối **không** gắn `@Public()` lên 3 endpoint này |
| Phân quyền | `actor.roles` **luôn rỗng** trên nhánh API key (`auth.guard.ts:96-107`) — mọi kiểm tra quyền phải đi qua `PermissionGuard`/`RequirePermission`, không được đọc `actor.roles` |
| Phạm vi dữ liệu | Danh mục là dữ liệu cấp tổ chức: `products` và `items` đều `ScopingPolicy.ORGANIZATION`, `branch_id` không dùng để lọc catalog. Mọi query lọc theo `actor.organizationId` |
| Mô hình dữ liệu | Giá nằm ở **item** (`items.selling_price` numeric(18,2)), không ở product. Nhóm hàng cũng gắn ở **item** (`items.category_id`), không ở product — nên "sản phẩm thuộc nhóm X" là suy ra từ các item của nó |
| Kiểu số | TypeORM trả `decimal` ra **string**; các query hiện có phải `::float` tường minh (`item-crud.service.ts:1380`). Hợp đồng đối tác phải là number |
| Versioning | URI versioning toàn cục, `defaultVersion: VERSION_NEUTRAL` (`main.ts:48-51`); không có `setGlobalPrefix`. Route mới dùng `@Version('2')` theo từng method |
| Validation | `ValidationPipe` toàn cục `forbidNonWhitelisted: true` — DTO phải khai đủ mọi field, thừa field là 400 |
| Thứ tự đăng ký route | Controller có route tĩnh phải đăng ký **trước** controller có `:id` động trên cùng prefix (Express 5 khớp theo thứ tự đăng ký — cảnh báo tại `inventory-location.module.ts:114-122`) |
| DB | `synchronize: false`. Nếu cần index mới thì viết migration tay; `migration:generate` sinh drift khổng lồ trên repo này |
| Backend source | Code, log, comment backend viết tiếng Anh. Tài liệu planning tiếng Việt |
| OpenAPI | Sau khi xong phải chạy `pnpm openapi:generate` và commit `schema.ts` + `openapi.snapshot.json` |

## Existing surface touched

- **Nhóm hàng**: `apps/api/src/modules/inventory/location/item-category.entity.ts` (cây
  adjacency-list qua `parent_group_id`), handler cây có sẵn
  `.../location/queries/search-item-category-tree.handler.ts` — mô hình để copy cách dựng
  cây trong RAM
- **Hàng hoá**: `.../inventory/location/item.entity.ts` (`items`),
  `.../inventory/product/product.entity.ts` (`products`)
- **Thuộc tính/biến thể**: `.../inventory/product/product-attribute-definition.entity.ts`,
  `product-attribute-option.entity.ts`, `item-attribute-value.entity.ts`
- **Tồn kho**: `.../inventory/ledger/stock-balance.entity.ts` (`stock_balances`, cột
  `quantity`, khoá theo `item_id` + `location_id` + `branch_id`)
- **Mẫu CQRS v2 để copy**: `.../location/controllers/inventory-item-v2.controller.ts`,
  `.../location/dto/inventory-item-search-v2.dto.ts`,
  `.../location/queries/search-inventory-items-v2.handler.ts`
- **Filter dùng chung**: `apps/api/src/common/filters/filter.dto.ts`, `filter.builder.ts`
- **Xác thực**: `apps/api/src/common/guards/auth.guard.ts`,
  `apps/api/src/modules/api-key/` (chỉ đọc, không sửa)
- **Quyền**: `apps/api/src/modules/rbac/permissions.seed.ts` — nơi khai quyền mới nếu cần
- **Module mới (dự kiến)**: `apps/api/src/modules/partner-catalog/` — chưa tồn tại
