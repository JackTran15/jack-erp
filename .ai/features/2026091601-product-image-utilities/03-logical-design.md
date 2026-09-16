---
feature: product-image-utilities
adr_count: 5
---

# Logical design — Cập nhật ảnh & Cập nhật ảnh nhanh

## Approach

Hai trang full-page mới trong backoffice, ba endpoint mỏng trong `modules/inventory/location`,
**không một dòng nào trong `modules/media`**. Đường ghi ảnh duy nhất là
`MediaLinkService.syncOwner` (thay toàn bộ, đúng như A-01/A-02 yêu cầu); đường đọc duy nhất là
`MediaQueryService.resolvePublicUrls` (một lần cho cả trang). Owner type luôn được suy từ id
trên server bằng cùng phép thử `products.exist` mà `item-crud.service.ts:361-367` đang dùng.

- **Cập nhật ảnh** = một query handler riêng `SearchProductImagesHandler` bọc ngoài
  `buildCombinedCte()` (ADR-01): thêm cột nhóm hàng hoá, vị từ "có ảnh ATTACHED", vị từ nhóm
  (kèm nhóm con), từ khoá; rồi `resolvePublicUrls` cho các id của trang để lấy thumbnail. Mỗi
  dòng có nút **Tải ảnh** → chọn file → tải từng file bằng ba helper đã có → gọi
  `POST /inventory/items/set-images` với một assignment (ADR-02).
- **Cập nhật ảnh nhanh** = thả file → gửi **tên file** lên `resolve-image-names` (ADR-03) → server
  tách `SKU (NN)`, khớp mẫu mã / hàng lẻ / biến thể (A-03, A-08, A-09) và trả về owner cho từng
  tên → FE gộp theo owner, sắp theo STT → khi bấm **Cập nhật**: theo từng owner, tải các file của
  owner đó (đồng thời ≤ 3), gắn ngay bằng `set-images` (ADR-04), rồi sang owner tiếp theo. Gắn ngay
  là điều giữ số dòng chưa `ATTACHED` luôn nhỏ, đúng ràng buộc hạn mức (A-04).

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Mở rộng `InventoryItemSearchV2Dto` bằng `hasImage` / `categoryId` và thêm cột vào CTE | `buildCombinedCte()` là contract chung với `MobileProductService`; thêm cột nhóm và cột ảnh vào đó là đổi `GET /mobile/products` để phục vụ một màn hình backoffice. Trang ảnh còn cần cột nhóm mà lưới chính không có |
| Không thêm endpoint ghi; FE gọi `PATCH /admin/entities/inventory-items/records/:id { imageIds }` N lần | Mỗi PATCH đi qua `super.update` (getById + save + hook) của generic CRUD chỉ để đổi ảnh; 500 file ⇒ 500 lượt như thế, không có tổng kết partial-success, và một id sai chỉ biết khi tới lượt nó. Khuôn `set-active-status` đã chứng minh một endpoint bulk với `updated/skipped` là thứ màn hình cần |
| Tách `SKU (NN)` ở client, chỉ gửi mã lên server | backoffice-web không có bộ chạy test; regex và các ca biên (`(00)`, `(11)`, trùng STT, mã trùng hoa/thường) sẽ không được chứng minh. Đặt ở API thì Jest chạy được và cùng chỗ với dữ liệu mã |
| Tải toàn bộ file lên trước, sau đó gắn một lượt | Vượt 100 dòng chưa gắn ⇒ 429 từ file thứ 101 ngay ở lần tải đầu tiên cho 1.500 mẫu mã. Gắn theo từng owner giữ con số đó ≤ 10 |
| Owner type mới cho ảnh biến thể | A-08 của media-storage giữ nguyên; người dùng đã chọn gắn vào mẫu mã cha (A-03) |
| Thêm cột ảnh vào lưới `/admin/inventory-items` | Ngoài phạm vi (Sapo không có), và cũng đụng CTE chung |

## Domain model

Không có entity mới, không có migration. Ba DTO mới:

| Entity / DTO | Fields | Notes |
| --- | --- | --- |
| `ProductImageSearchDto` (request) | `page`, `limit ≤ 100`, `imageStatus: 'ALL' \| 'MISSING' \| 'PRESENT'` (mặc định `MISSING`), `categoryId?: uuid`, `keyword?: string ≤ 200` | Không có `includeInactive`: chỉ nhóm đang kinh doanh (A-13) |
| `ProductImageRowDto` | `type: 'product' \| 'orphan'`, `id`, `code`, `name`, `categoryName: string \| null`, `imageCount: number`, `thumbnailUrl: string \| null` | `thumbnailUrl` = URL ảnh đầu tiên từ `resolvePublicUrls`; không bao giờ có bucket/objectKey |
| `SetItemImagesDto` | `assignments: { id: uuid, imageIds: uuid[] (≤ 10) }[]` (1..50, `@ValidateNested`) | Không có `ownerType` — `forbidNonWhitelisted` chặn nếu gửi |
| `SetItemImagesResponseDto` | `updated: { id, code, imageCount }[]`, `failed: { id, code: string \| null, reason }[]` | `reason` ∈ Error taxonomy |
| `ResolveImageNamesDto` | `names: string[]` (1..500, mỗi tên ≤ 255) | Tên file **đã bỏ phần mở rộng** hoặc chưa — server tự bỏ đuôi ảnh `.jpg/.jpeg/.png/.gif/.webp` |
| `ResolvedImageNameDto` | `name`, `code: string` (rỗng khi tên chỉ có STT), `seq: number \| null`, `match: 'product' \| 'orphan' \| 'variant' \| null`, `ownerId: string \| null`, `ownerCode: string \| null`, `ownerName: string \| null`, `error: 'SEQ_OUT_OF_RANGE' \| 'DUPLICATE_SEQ' \| null` | `ownerId` là id để gửi vào `set-images`; với `variant` đó là `products.id` của mẫu mã cha |

Quy tắc tách tên (server, hàm thuần `parseImageFileName(name)` có spec riêng):
1. Bỏ đuôi ảnh nếu có (không phân biệt hoa/thường), `trim()`.
2. Regex `^(.*?)\s*\((\d{1,2})\)$` → nếu khớp: `code = nhóm 1 trimmed`, `seq = Number(nhóm 2)`;
   `seq` ngoài `1..10` ⇒ `SEQ_OUT_OF_RANGE`. Không khớp ⇒ `code = cả tên`, `seq = null`.
3. Khớp `lower(code)`: `products.code` trước (`match: 'product'`), rồi `items.code` với
   `product_id IS NULL` (`'orphan'`), rồi `items.code` với `product_id IS NOT NULL` (`'variant'`,
   `ownerId = product_id`). Cả ba trong tổ chức của actor, hai truy vấn `= ANY($2)`.
4. Trong cùng một lần gọi, hai tên cùng `ownerId` cùng `seq` (không null) ⇒ tên đến sau
   `DUPLICATE_SEQ`.

Sắp xếp bộ ảnh của một owner ở FE trước khi gọi `set-images`: theo `seq` tăng dần, `seq null`
xếp sau theo tên file (`Intl.Collator('vi', { numeric: true })`); file biến thể (không có STT) vì
thế đứng sau các file `(NN)` của mẫu mã — đúng AC-13.

## Contracts

### POST /v2/inventory-items/images/search — `inventory.read`
Request:
```json
{ "page": 1, "limit": 50, "imageStatus": "MISSING", "categoryId": null, "keyword": "" }
```
Response 200:
```json
{ "data": [{ "type": "product", "id": "…", "code": "AK1359", "name": "AK1359",
             "categoryName": "Giày nữ", "imageCount": 0, "thumbnailUrl": null }],
  "total": 2446, "page": 1, "limit": 50 }
```
SQL: `WITH combined AS (<buildCombinedCte()>) SELECT c.*, cat.name AS "categoryName", img.count …`
với
- nhóm: `LEFT JOIN LATERAL (SELECT MIN(ic.name) AS name FROM items i JOIN inventory_item_categories ic ON ic.id = i.category_id WHERE (i.product_id = c.id OR i.id = c.id) AND i.organization_id = $1) cat ON true`;
- ảnh: `(SELECT COUNT(*) FROM media_objects m WHERE m.organization_id = $1::uuid AND m.owner_id = c.id AND m.owner_type = CASE c.type WHEN 'product' THEN 'PRODUCT' ELSE 'ITEM' END AND m.status = 'ATTACHED')` — chạy trên `IDX_media_objects_owner_attached`;
- `imageStatus`: `MISSING` ⇒ `"imageCount" = 0`, `PRESENT` ⇒ `> 0`, `ALL` ⇒ không vị từ;
- `categoryId`: handler đọc cây `inventory_item_categories` của tổ chức, gom id con (đệ quy, A-06), vị từ `EXISTS (SELECT 1 FROM items i WHERE (i.product_id = c.id OR i.id = c.id) AND i.category_id = ANY($n::uuid[]))`;
- `keyword`: `c.code ILIKE $k OR c.name ILIKE $k OR EXISTS (SELECT 1 FROM items i WHERE i.product_id = c.id AND i.code ILIKE $k)` với wildcard được escape như `applyString`;
- luôn `"isActive" = true` (A-13); `ORDER BY code ASC`; count dùng cùng `WHERE`.
Sau SQL: `resolvePublicUrls(ids của trang, orgId)` một lần → `thumbnailUrl = images[0]?.url ?? null`.
Failure modes: 400 → DTO không hợp lệ; 403 → thiếu `inventory.read`.

### POST /inventory/items/set-images — `inventory.write`
Request:
```json
{ "assignments": [{ "id": "<products.id | items.id>", "imageIds": ["<mediaId>", "…"] }] }
```
Response 200:
```json
{ "updated": [{ "id": "…", "code": "AK1359", "imageCount": 2 }],
  "failed":  [{ "id": "…", "code": null, "reason": "OWNER_NOT_FOUND" }] }
```
Xử lý (`ItemImagesService.setImages`): một truy vấn gom `products` + `items(product_id IS NULL)`
của tổ chức theo `= ANY(ids)` để suy owner type và `code`; id không có trong cả hai ⇒
`OWNER_NOT_FOUND` (kể cả id của **biến thể** — client phải gửi id mẫu mã, `resolve-image-names`
đã trả đúng id đó). Với mỗi assignment còn lại: **một transaction riêng** bọc
`syncOwner(ownerType, id, imageIds, actor, manager)`; `MediaException` ⇒ dòng đó vào `failed`
với `reason = err.code`, lỗi khác ⇒ ném (không nuốt lỗi hệ thống). Không có cache nào phải xoá: POS đọc `imageUrl`
thẳng từ `media_objects` qua `resolvePublicUrls` mỗi lượt (không có cache catalog trong
`pos-catalog-product.service.ts`).
Failure modes: 400 → DTO; 403 → thiếu quyền; 409 → `X-Idempotency-Key` trùng với body khác.

### POST /v2/inventory-items/resolve-image-names — `inventory.read`
Request: `{ "names": ["AAA-MEDIA-A (01).png", "aaa-media-a-den-39", "KHONG-CO"] }`
Response 200:
```json
{ "data": [
  { "name": "AAA-MEDIA-A (01).png", "code": "AAA-MEDIA-A", "seq": 1, "match": "product",
    "ownerId": "<A>", "ownerCode": "AAA-MEDIA-A", "ownerName": "Giày A", "error": null },
  { "name": "aaa-media-a-den-39", "code": "aaa-media-a-den-39", "seq": null, "match": "variant",
    "ownerId": "<A>", "ownerCode": "AAA-MEDIA-A", "ownerName": "Giày A", "error": null },
  { "name": "KHONG-CO", "code": "KHONG-CO", "seq": null, "match": null,
    "ownerId": null, "ownerCode": null, "ownerName": null, "error": null }
] }
```
Thứ tự `data` = thứ tự `names`. Failure modes: 400 → > 500 tên hoặc tên rỗng.

### Client — `apps/backoffice-web/src/lib/media/upload-goods-images.ts` (mới)
`uploadGoodsImages(ownerType, files, { signal, concurrency }) → Promise<Array<{ file, mediaId } | { file, error }>>`
— chuỗi `createUpload → uploadToStorage → completeUpload` cho từng file, đồng thời ≤ `concurrency`,
map `UploadFailedError` / `MEDIA_*` sang chuỗi tiếng Việt (bảng ở Error taxonomy). Dùng chung cho
cả **Tải ảnh** trên dòng và trang ảnh nhanh. `validateFileAgainstLimits` được gọi **trước** khi
tạo vé, nên file quá cỡ không tốn hạn mức.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Bộ lọc + trang của Cập nhật ảnh | `useState` trong `InventoryItemImagesPage`; kết quả trong TanStack Query key `["product-images", body]` | Trang; `refetch` khi bấm Lấy dữ liệu, `invalidate` sau khi Tải ảnh thành công |
| Cây nhóm hàng hoá | `useItemCategoryTree` (đã có) | Trang |
| Danh sách file + phân loại của trang ảnh nhanh | `useState` trong `QuickImageUpdatePage` (`File`, `objectURL`, kết quả resolve, trạng thái tải) | Trang; `URL.revokeObjectURL` khi bỏ thẻ/unmount |
| Tiến trình Cập nhật (đang chạy, k/N) | cùng state trên | Trang; chặn Quay lại khi đang chạy (AC-17) |
| Phiên, chi nhánh, quyền | store hiện có | App |

Không có state nào vào Zustand: mọi thứ là dữ liệu màn hình hoặc dữ liệu server.

## Error taxonomy

| Condition | Failure | UI (tiếng Việt) |
| --- | --- | --- |
| File không phải ảnh cho phép | client `validateFileAgainstLimits` | "Chỉ hỗ trợ .jpg, .jpeg, .png, .gif, .webp" (chuỗi của form hàng hoá) |
| File > 2 MiB | client | "Mỗi ảnh tối đa 2MB" |
| > 10 file cho một owner | client | "Tối đa 10 ảnh" |
| Tên không khớp mã nào | `match: null` | thẻ: "Không có mã SKU hàng hóa trùng tên ảnh" |
| STT ngoài 01..10 | `error: SEQ_OUT_OF_RANGE` | thẻ: "STT phải từ 01 đến 10" |
| Trùng STT trong cùng mẫu mã | `error: DUPLICATE_SEQ` (server) hoặc client khi thả thêm | thẻ: "Trùng STT NN với file khác của mẫu mã X" |
| `POST /media/uploads` 429 `MEDIA_QUOTA_EXCEEDED` | `UploadFailedError` | thẻ: "Hết hạn mức tải lên trong ngày, thử lại sau" |
| Storage lỗi / mạng | `UploadFailedError` (`STORAGE_UNAVAILABLE`, fetch fail) | thẻ: "Tải ảnh thất bại, thử lại" + nút thử lại |
| id không thuộc tổ chức / là biến thể | `failed[].reason = OWNER_NOT_FOUND` | toast/thẻ: "Không tìm thấy hàng hóa" |
| mediaId sai tổ chức / owner type | `MEDIA_NOT_FOUND` | "Ảnh không hợp lệ, tải lại" |
| media đã gắn chỗ khác / DELETED | `MEDIA_STATE_CONFLICT` | "Ảnh đã được dùng ở nơi khác, tải lại" |
| > 10 id | `MEDIA_LIMIT_EXCEEDED` | "Tối đa 10 ảnh" |
| thiếu `inventory.write` | 403 | Menu ẩn; nếu gọi tay: "Bạn không có quyền" (thông báo mặc định của `HttpError`) |

Backend: mã lỗi tiếng Anh, thông điệp tiếng Anh; chuỗi tiếng Việt chỉ ở FE.

## Cache & offline

- `["product-images", body]`: `placeholderData: prev`, không `staleTime` đặc biệt; sau `set-images`
  thành công: cập nhật thumbnail tại chỗ (`setQueryData`) rồi `invalidateQueries(["product-images"])`.
- `["item-category-tree", …]`: dùng lại hook có sẵn.
- Không cache `resolve-image-names` (mỗi lần thả là một lần gọi, kết quả gắn vào thẻ).
- Offline: không hỗ trợ; lỗi mạng hiện trên thẻ, thử lại thủ công.

## Observability

- API log một dòng `info` mỗi lượt `set-images`: `organizationId`, số `updated`, số `failed`,
  không log mediaId/objectKey.
- `resolve-image-names` không log tên file (có thể chứa dữ liệu người dùng); chỉ log số lượng khi
  có lỗi.
- FE: toast tổng kết "Đã cập nhật k/N ảnh"; thẻ giữ lỗi để người dùng đọc từng cái.

## ADRs

### ADR-01 — Handler riêng bọc `buildCombinedCte()`, không sửa CTE
**Context:** Trang Cập nhật ảnh cần cột nhóm hàng hoá, đếm ảnh và ba bộ lọc mà lưới chính không có. CTE `combined` được export và dùng chung với `MobileProductService`.
**Decision:** `SearchProductImagesHandler` (CQRS, `queries/`) tự dựng câu SQL `WITH combined AS (…) SELECT …` bằng `buildCombinedCte()` **không tham số**, thêm cột/vị từ ở lớp ngoài. `InventoryItemSearchV2Dto` và CTE không đổi một ký tự.
**Consequences:** Hai câu SQL gần giống nhau tồn tại song song (đã chấp nhận từ khi mobile dùng chung CTE); đổi lại, `GET /mobile/products` và lưới chính được chứng minh không đổi bằng spec đếm SQL hiện có.
**Status:** accepted

### ADR-02 — Một endpoint `set-images` bulk với partial success, owner suy từ id
**Context:** Cả hai trang chỉ làm một việc: thay bộ ảnh của một owner. Quy tắc media: owner type/id không được lấy từ body. Generic CRUD `update` làm được nhưng mang theo `getById + save + hook` mỗi lượt và không có tổng kết.
**Decision:** `POST /inventory/items/set-images { assignments[] }` cạnh `set-active-status`; `ItemImagesService` (file mới, nhỏ) suy owner type bằng `products`/`items(product_id IS NULL)` của tổ chức, gọi `syncOwner` trong transaction riêng cho từng assignment, trả `updated/failed`. Trang Cập nhật ảnh gửi 1 assignment; trang ảnh nhanh gửi theo lô ≤ 50.
**Consequences:** Thêm ~1 service + 1 DTO + spec + e2e; đổi lại mỗi lỗi chỉ hạ đúng dòng của nó, FE có một contract để hiển thị. `IdempotencyInterceptor` áp dụng tự động; FE phát khoá theo `(ids, imageIds)` sắp xếp như `operationKey`.
**Status:** accepted

### ADR-03 — Tách và khớp tên file trên server (`resolve-image-names`)
**Context:** Quy tắc `SKU (NN)` có nhiều ca biên; backoffice-web không có bộ chạy test; dữ liệu mã nằm trên server.
**Decision:** FE gửi nguyên tên file; `ResolveImageNamesHandler` gọi hàm thuần `parseImageFileName` (spec Jest riêng) rồi khớp `products.code` → `items.code` orphan → `items.code` biến thể (`ownerId = product_id`), không phân biệt hoa/thường, mẫu mã thắng khi trùng (A-09). Trả về từng tên theo thứ tự gửi.
**Consequences:** Một round-trip thêm sau mỗi lần thả file (≤ 500 tên/lượt, FE chia lô). Đổi quy tắc tên sau này là đổi một hàm có test, không phải regex rải trong component.
**Status:** accepted

### ADR-04 — Tải và gắn theo từng owner, đồng thời ≤ 3, không tải trước toàn bộ
**Context:** Hạn mức 100 dòng chưa `ATTACHED`/người/24h đếm cả `DELETED` (A-04, giữ nguyên). Một lượt ảnh nhanh có thể là 1.500 file.
**Decision:** Vòng lặp theo owner: tải các file của owner (≤ 3 đồng thời, ≤ 10 file), `completeUpload` xong tất cả ⇒ gọi `set-images` cho owner đó ngay, rồi sang owner kế. Một file của owner tải lỗi ⇒ owner đó **không** được gắn (tránh thay bộ ảnh bằng bộ thiếu), thẻ báo lỗi, các owner khác tiếp tục.
**Consequences:** Số dòng chưa gắn tại một thời điểm ≤ 10. Thay lại > 100 ảnh trong ngày vẫn bị 429 (đã chấp nhận). Tổng thời gian ≈ tổng thời gian tải / 3.
**Status:** accepted

### ADR-05 — Không đụng `modules/media`
**Context:** Skill `media-upload-fetch` khoanh vùng: hạn mức, TTL, dọn dẹp, bucket là nội bộ media, có ADR riêng.
**Decision:** Feature này chỉ tiêu thụ `MediaLinkService`, `MediaQueryService` và ba helper FE. Mọi hạn chế phát sinh (A-04) được hiển thị, không được lách.
**Consequences:** Hai trang không cần security review lại đường upload; nếu sau này cần nới hạn mức, đó là feature của media-storage.
**Status:** accepted
