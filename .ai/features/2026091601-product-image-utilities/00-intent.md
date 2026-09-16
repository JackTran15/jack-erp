---
feature: product-image-utilities
slug: 2026091601-product-image-utilities
owner: Akenzy
created: 2026-09-16
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Danh mục > Hàng hoá > Tiện ích: "Cập nhật ảnh" và "Cập nhật ảnh nhanh"

Menu **Tiện ích** trên lưới `/admin/inventory-items` đã có hai mục trạng thái kinh doanh
(feature `2026090602-inventory-item-stock-status-utilities`). Plan đó ghi rõ ở *Out of scope*:
*"Cập nhật ảnh" và "Cập nhật ảnh nhanh" trong menu Tiện ích của Sapo — chỉ hai mục trạng thái.*
Feature này là phần còn lại của menu đó, theo đúng hai màn hình Sapo trong ảnh tham chiếu:

| Mục menu | Màn hình Sapo | Việc người dùng làm |
| --- | --- | --- |
| **Cập nhật ảnh** | `Hàng hóa / Cập nhật ảnh` — lọc *Hàng hóa chưa cập nhật ảnh* / *đã cập nhật* / *Tất cả*, lọc *Nhóm hàng hóa* (cây), ô *Nhập mã SKU hoặc tên hàng hóa*, nút *Lấy dữ liệu*; bảng Mã SKU / Tên / Nhóm / Ảnh, mỗi dòng một nút **Tải ảnh**; 50 dòng/trang | Tìm ra hàng chưa có ảnh rồi tải ảnh cho từng mẫu mã ngay trên bảng |
| **Cập nhật ảnh nhanh** | `Hàng hóa / Cập nhật ảnh nhanh` — thả nhiều file, chương trình **đọc tên file làm mã SKU**, hiện thẻ ảnh kèm trạng thái khớp, bộ đếm *Cập nhật k/N ảnh*, nút **Cập nhật** | Đặt tên file theo SKU trước, thả cả thư mục một lượt |

Nền tảng đã có trên nhánh này (feature `2026091301-media-storage`, 26/27 vé done): module
`media` với `MediaLinkService.syncOwner` / `MediaQueryService.resolvePublicUrls`, owner
`PRODUCT` (mẫu mã có biến thể) và `ITEM` (hàng lẻ), ảnh công khai, tối đa 10 ảnh × 2 MB, và
form hàng hoá đã tải ảnh thật. Feature này **không đụng vào module media**; nó chỉ thêm hai
màn hình và ba endpoint mỏng bên trên.

## Problem

**P1 — Không biết hàng nào chưa có ảnh.** Trên `erp_dev`, tổ chức
`f1000000-0000-4000-8000-000000000001` có **2.507 nhóm** (2.324 mẫu mã + 183 hàng lẻ) và
**đúng 2 nhóm có ảnh** — hai fixture của feature media-storage. Lưới hàng hoá không có cột
ảnh, không có bộ lọc theo ảnh; cách duy nhất để biết một mẫu mã đã có ảnh chưa là mở trang
Sửa của nó. Với 2.507 nhóm, đó là 2.507 lần mở.

**P2 — Tải ảnh phải đi qua form Sửa từng hàng.** Đường tải ảnh duy nhất là
`InventoryItemCreateForm` (tạo/sửa). Mỗi lần: mở dòng → tab thông tin → chọn ảnh → chờ tải →
Lưu → quay lại lưới. Cửa hàng trong ảnh tham chiếu có 1.578 mẫu mã chưa có ảnh; nhân viên có
sẵn một thư mục ảnh đã đặt tên theo mã SKU (cách làm phổ biến khi chuyển từ Sapo) mà không
có chỗ nào để thả cả thư mục vào.

**P3 — Mã SKU trên tên file không tự khớp được.** Quy ước Sapo: `Tên ảnh = Mã SKU (STT)`
với STT 01..10 cho mẫu mã, `Tên ảnh = Mã SKU` cho hàng thuộc tính. Hệ thống này có mô hình
khác một chút — biến thể **không có ảnh riêng**, nó dùng ảnh của mẫu mã (A-08 của
media-storage) — nên phép khớp phải nói rõ file đặt theo mã biến thể sẽ đi đâu.

## Affected personas

| Persona | Hành vi hiện tại | Hành vi mong muốn |
| --- | --- | --- |
| Nhân viên danh mục / marketing | Mở từng dòng vào form Sửa để xem và tải ảnh; không lọc được hàng thiếu ảnh | Tiện ích → Cập nhật ảnh → lọc *chưa cập nhật ảnh* → bấm **Tải ảnh** ngay trên dòng |
| Nhân viên nhập liệu khi chuyển hệ thống | Có sẵn thư mục ảnh tên theo SKU, phải tải tay từng ảnh | Tiện ích → Cập nhật ảnh nhanh → thả cả thư mục → xem file nào khớp → **Cập nhật** một lượt |
| Nhân viên bán hàng (chỉ `inventory.read`) | Không thấy menu Tiện ích | Không đổi: vẫn không thấy, và API ghi ảnh trả 403 |

## Success signal

Trên `erp_dev`, tổ chức trên, tài khoản có `inventory.write`:
1. **Cập nhật ảnh**, bộ lọc mặc định *Hàng hóa chưa cập nhật ảnh* + nhóm *Tất cả* → **2.446 kết
   quả** (2.448 nhóm đang kinh doanh − 2 fixture); đổi sang *đã cập nhật ảnh* → **2**; *Tất cả* →
   **2.448**. Ba con số cộng đúng là bằng chứng bộ lọc đọc đúng bảng `media_objects`
   (`status = 'ATTACHED'`) cho cả hai owner type. (2.507 là tổng kể cả 59 nhóm ngừng kinh doanh —
   trang chỉ liệt kê nhóm đang kinh doanh, A-13; đo lại 2026-09-16 khi thi công T-01-01.)
2. Bấm **Tải ảnh** trên một dòng, chọn 2 ảnh → dòng đó hiện thumbnail ngay, và
   `GET /admin/entities/inventory-items/records/:id` trả `images` đúng 2 URL theo thứ tự chọn.
3. **Cập nhật ảnh nhanh**: thả 6 file `AAA-MEDIA-A (01).png`, `AAA-MEDIA-A (02).png`,
   `AAA-MEDIA-B.png`, `aaa-media-a-den-39.png` (mã biến thể), `KHONG-CO.png`, `to-3mb.png` → bộ đếm
   *Cập nhật 4/6 ảnh*, hai file cuối báo lỗi đúng loại; bấm **Cập nhật** → A có đúng 3 ảnh theo
   thứ tự (01, 02, rồi ảnh biến thể), B có 1 ảnh; tổng số lượt gọi tải lên = 4.

## Out of scope

- **Ảnh riêng cho từng biến thể.** Vẫn là A-08 của media-storage: biến thể dùng ảnh của mẫu
  mã. File đặt theo mã biến thể được gắn vào mẫu mã cha (A-03), không mở thêm owner type.
- **Sửa module media** (hạn mức 100 lượt tải chưa gắn/24h, TTL vé, dọn dẹp, bucket). Hạn mức
  được chấp nhận nguyên trạng và báo lỗi theo từng file (A-04).
- **Kéo thả sắp xếp ảnh, xoá từng ảnh** trên hai trang này. Muốn chỉnh chi tiết thì vào form Sửa
  như hiện nay; hai trang này chỉ *thay bộ ảnh*.
- **Thêm cột ảnh vào lưới `/admin/inventory-items`.** Sapo không có; và lưới đó dùng CTE chung
  với mobile (`buildCombinedCte`), thêm cột là đụng contract của `GET /mobile/products`.
- **Mục sidebar cho hai trang.** Sapo chỉ vào qua Tiện ích; giữ vậy (A-05).
- **Nén / đổi kích thước ảnh phía client.** Giới hạn 2 MB giữ nguyên như form hàng hoá.
- **pos-web và API đối tác** — đã trả URL ảnh từ UOW-03 của media-storage; không đổi contract.

## Constraints

| Kind | Detail |
| --- | --- |
| Dữ liệu | Dòng là **nhóm**: `type: 'product'` ⇒ `id` là `products.id`, owner `PRODUCT`; `type: 'orphan'` ⇒ `id` là `items.id`, owner `ITEM`. Owner type phải được suy từ id trên server (`item-crud.service.ts:361-367`), **không bao giờ** nhận từ body (quy tắc của skill `media-upload-fetch`). |
| Dữ liệu | `products.code` nullable theo schema nhưng **0/2.324 null** trên `erp_dev`; CTE vẫn hiển thị `COALESCE(p.code, p.name, MIN(i.code))`. Phép khớp tên file so với chính cột `code` này. |
| Dữ liệu | Nhóm hàng hoá nằm trên **`items.category_id`**, không có trên `products`. Nhóm của mẫu mã = nhóm của biến thể; đo được **0 mẫu mã có biến thể khác nhóm** (A-07). |
| Dữ liệu | `inventory_item_categories` là cây (`parent_group_id`); Sapo hiển thị nhóm cha làm tiêu đề, nhóm con thụt vào. Endpoint cây đã có: `POST /v2/inventory/item-categories/tree`. |
| Dữ liệu | Mã SKU: **0** mã kết thúc bằng `(NN)`, **0** mã chứa ký tự cấm trong tên file (`/\:*?"<>|`), **0** cặp trùng khi bỏ hoa/thường, **1** biến thể trùng mã với mẫu mã của nó (A-08, A-09). |
| Media | `GOODS_POLICY`: bucket public, 2 MiB, `image/jpeg|png|gif|webp`, **10 ảnh/owner**, ghi cần `inventory.write`. `syncOwner` là **thay toàn bộ** theo thứ tự mảng; id bị bỏ → `DELETED`, không gắn lại được. |
| Media | Hạn mức **100 dòng chưa `ATTACHED` / người / 24h**, đếm cả dòng `DELETED` (`media-upload.service.ts:18-28`). Luồng tải hàng loạt phải **gắn ngay từng mẫu mã** chứ không tải trước toàn bộ; thay lại > 100 ảnh trong ngày sẽ bị 429 từ ảnh thứ 101 (A-04). |
| Media | Bytes đi thẳng lên storage bằng `fetch` trần (`uploadToStorage`), không qua `erpApi`; helper `createUpload` / `completeUpload` / `uploadToStorage` đã export sẵn ở `lib/media/media-upload.api.ts`. |
| Kiến trúc | `buildCombinedCte()` (`search-inventory-items-v2.handler.ts`) là **contract chung với `MobileProductService`**; tái dùng bằng cách bọc ngoài, không sửa bên trong. |
| Kiến trúc | Trang mới là full-page có nút **Quay lại**, theo khuôn `InventoryItemBarcodesPage` + `navigateToBarcodePrint` (`lib/barcode-print-navigation.ts`). |
| UI | Menu Tiện ích `disabled: sel.selectedCount === 0` nhưng lưới **tự chọn dòng đầu** nên luôn bấm được khi có dữ liệu; hai mục mới bỏ qua `context` (không cần dòng chọn). |
| UI | backoffice-web **không có bộ chạy test** (`"test": "echo test"`, ghi nhận ở UOW-04 media-storage). Logic cần chứng minh — phân tích tên file `SKU (NN)` — đặt ở API để Jest chạy được. |
| Quyền | Đọc `inventory.read`; ghi `inventory.write`. Menu Tiện ích đã ẩn khi thiếu `inventory.write` (`InventoryItemsPage.tsx:38-40`). |
| Idempotency | Endpoint ghi ảnh hàng loạt là mutation ⇒ `IdempotencyInterceptor`; FE phát khoá theo thao tác như `set-item-active-status.api.ts`. |

## Existing surface touched

- **Tái sử dụng, không viết lại:**
  - `MediaLinkService.syncOwner` / `MediaQueryService.resolvePublicUrls` — toàn bộ ghi/đọc ảnh.
  - `buildCombinedCte()` — nguồn dòng nhóm (product ∪ orphan) cho trang Cập nhật ảnh.
  - `POST /v2/inventory/item-categories/tree` + `useItemCategoryTree` + `flattenCategoryTree`
    (`components/crud/itemCategoryTree.ts`) — dropdown Nhóm hàng hoá dạng cây.
  - `createUpload` / `uploadToStorage` / `completeUpload` (`lib/media/media-upload.api.ts`),
    `validateFileAgainstLimits` (`lib/media/media-limits.ts`) — tải từng file.
  - `utilitiesOptions` của `CrudListPage` (`InventoryItemsPage.tsx:100-113`) — thêm hai mục.
  - Khuôn bulk-với-partial-success: `setActiveStatus` + `POST /inventory/items/set-active-status`
    (`inventory-location.controller.ts:75-82`, `set-item-active-status.api.ts`).
  - Khuôn query "resolve": `ResolveItemLocationsController` + `ResolveItemLocationsHandler`.
  - E2E: `media-product-images.e2e-spec.ts` (tải lên qua `FakeObjectStorageService` rồi gắn),
    `inventory-item-set-active-status.e2e-spec.ts` (bulk partial success).
- **Điểm vào mới:** hai route `/admin/inventory-items/images` và `/admin/inventory-items/images/quick`
  trong `App.tsx`; hai mục trong menu Tiện ích. Không có mục nav mới.
- **Endpoint mới:** `POST /v2/inventory-items/images/search`, `POST /v2/inventory-items/resolve-image-names`,
  `POST /inventory/items/set-images`. Sau đó `pnpm openapi:generate`.
