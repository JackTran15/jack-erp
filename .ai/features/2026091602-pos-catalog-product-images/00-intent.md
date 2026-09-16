---
feature: pos-catalog-product-images
slug: 2026091602-pos-catalog-product-images
owner: Akenzy
created: 2026-09-16
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — POS hiển thị ảnh hàng hoá trên lưới catalog và dialog chọn biến thể

## Problem

Feature `2026091301-media-storage` (UOW-03) đã làm hai endpoint POS trả URL ảnh công khai:

| Endpoint | Trường | Nguồn |
| --- | --- | --- |
| `GET /pos/branches/:branchId/catalog/products` | `data[].imageUrl` — ảnh đầu tiên của mẫu mã (card `PRODUCT`) hoặc của hàng lẻ (card `ITEM`), `null` khi chưa có ảnh | `pos-catalog-product.service.ts:194,220` |
| `GET /pos/branches/:branchId/catalog/products/:id?kind=` | `imageUrl` ở mức product **và** trên từng `variants[].imageUrl` (biến thể dùng chung ảnh mẫu mã, A-08 của media-storage) | `pos-catalog-product.service.ts:641-690` |

pos-web đã mirror đủ ba trường trong `interfaces/catalog.interface.ts:66,111,140` nhưng
**không render ở đâu cả**. Bước map từ `PosProductCard` sang shape nội bộ `CatalogProduct`
(`use-checkout-catalog.ts:141-149`) bỏ luôn `imageUrl`; `ProductCard.tsx` và
`ProductHeaderInfo.tsx` vẽ cố định `ShoppingBagIcon` trên nền `bg-gray-300` / `#D1D5DB`.
Kết quả là ảnh 1 và ảnh 2 trong yêu cầu: mọi ô của lưới đều là túi xám, ô "Xem" trong dialog
chọn biến thể cũng vậy, kể cả với hàng đã có ảnh.

Media-storage cố ý để việc này ra ngoài v1 (`00-intent.md` → Out of scope: *"POS chỉ nhận
`imageUrl` qua API và **không** hiển thị ảnh"*, A-11: *"muốn POS hiển thị: thêm 1 UoW FE"*).
Đây là UoW đó.

## Affected personas

| Persona | Hành vi hiện tại | Hành vi mong muốn |
| --- | --- | --- |
| Thu ngân POS (màn Bán hàng) | Lưới tư vấn 6 cột chỉ có mã + giá; nhận diện hàng bằng mã SKU | Ô nào có ảnh thì thấy ảnh; ô chưa có ảnh vẫn là túi xám như cũ |
| Thu ngân POS (dialog chọn biến thể) | Ô "Xem" là túi xám tĩnh, bấm không làm gì | Ô "Xem" là thumbnail ảnh; bấm mở ảnh cỡ lớn để đối chiếu với hàng trên tay |

## Success signal

Trên `erp_dev`, chi nhánh **Hồ Chí Minh**, với 3 fixture của media-storage
(`AAA-MEDIA-A` mẫu mã có màu/size + 3 ảnh, `AAA-MEDIA-B` hàng lẻ + 1 ảnh, `AAA-MEDIA-C`
không ảnh — `verify-fixtures.py --reset`):

1. Lưới catalog tìm `AIDLC` → 3 card: A và B render `<img src>` chứa `/erp-media-public/`,
   C giữ `ShoppingBagIcon`. Badge giá vẫn nằm góc dưới-trái đè lên ảnh.
2. Bấm card A → dialog chọn biến thể: khối header có `<img>` cùng URL với card, nhãn "Xem";
   bấm vào mở ảnh cỡ lớn trong `PosDialog`; đóng bằng Esc/nút đóng quay lại đúng dialog chọn
   biến thể với bảng biến thể còn nguyên.
3. Bấm card C → header dialog vẫn là túi xám + "Xem" nhưng **không** mở được gì (không có
   ảnh để xem).
4. Không thêm request nào tới API: số request `GET /pos/...` khi mở màn Bán hàng và khi mở
   dialog không đổi so với trước (ảnh tải thẳng từ `MEDIA_PUBLIC_BASE_URL`, tag `<img>` không
   mang header ERP).

## Out of scope

- **Mở rộng API.** Cả hai endpoint giữ nguyên contract; dialog chỉ xem được ảnh đầu tiên
  (`imageUrl`), không có gallery nhiều ảnh. Chủ sở hữu chọn phương án này 2026-09-16
  (A-01). Muốn gallery về sau: thêm `images: string[]` vào `PosProductDetailDto` — việc BE +
  openapi riêng.
- **Ảnh trên các màn POS khác**: picker của `FastStockTransferPage` (dùng chung endpoint
  danh sách), `ReturnGoodsPage`, danh sách hoá đơn. Chỉ màn Bán hàng (A-02).
- **Ảnh riêng theo biến thể** trong `VariantTable` — `variants[].imageUrl` luôn bằng ảnh mẫu
  mã (A-08 media-storage), vẽ lại 20 lần cùng một ảnh không thêm thông tin (A-03).
- **Xử lý ảnh** (thumbnail, resize, webp): media-storage lưu nguyên file người dùng tải lên
  (A-24 của nó); POS tải ảnh gốc ≤ 2 MB rồi để trình duyệt co lại.
- **Cấu hình nginx production** để trình duyệt với tới bucket công khai: vẫn là T-05-02 của
  media-storage (đang `blocked`). Feature này không làm gì cho tới khi ảnh có URL với tới
  được; khi đó nó tự hiện (A-04).
- **Vị trí lưu kho / trưng bày** trong header dialog — vẫn "Chưa có thông tin", không đụng.

## Constraints

| Kind | Detail |
| --- | --- |
| Contract | Không đổi `PosProductCardDto` / `PosProductDetailDto`; không chạy `pnpm openapi:generate`. |
| Mạng | Ảnh tải bằng `<img src>` thẳng từ storage — **không** qua `erpApi`/axios (interceptor gắn `Authorization` + `X-Branch-Id` vào mọi request; media-storage đã cấm đường này). URL công khai là tuyệt đối (`MEDIA_PUBLIC_BASE_URL`, local `http://localhost:3000/erp-media-public/...`); pos-web `vite.config.ts` **không** proxy `/erp-media-public`, nên ảnh là cross-origin với `:3001` — hợp lệ với `<img>`, không cần CORS. |
| Hiệu năng | Lưới tối đa 20 card/trang (ADR-02 của `2026090802-pos-catalog-search-perf`), tối đa 20 ảnh gốc ≤ 2 MB; dùng `loading="lazy"` + `decoding="async"`; không được làm layout nhảy — ô ảnh giữ đúng `h-[120px]` hiện tại. |
| Hiển thị | Card: ảnh phủ kín ô (`object-cover`, chủ sở hữu chọn 2026-09-16, A-05); badge giá vẫn đè góc dưới-trái. Header dialog: ô 96×96 hiện có. |
| Lỗi ảnh | `onError` của `<img>` (URL chết, bucket chưa mở ở prod) → rơi về placeholder túi xám, không toast, không log lỗi ra người dùng (`failure_signals` của verify bắt toast lỗi). |
| Kiểu dữ liệu | `CatalogProduct` là shape nội bộ của checkout (`interfaces/checkout.interface.ts:78-86`), không phải type dùng chung; thêm `imageUrl` ở đây không đụng `@erp/shared-interfaces`. |
| Test | pos-web không có bộ chạy test (`"test": "echo test"`, không có `*.test.tsx`). Bằng chứng là build type-check + browser verify (`aidlc-verify`, env `local-pos`). |
| UI | Chuỗi tiếng Việt; icon từ `PosIcons` (pos-web không dùng `lucide-react` trực tiếp); dialog qua `PosDialog`. |
| Feature liền kề | `2026091301-media-storage` 26/27 done trên cùng nhánh `feat/media-storage`; feature này dựng trên nhánh đó, không sửa file nào của media-storage. |

## Existing surface touched

- `apps/pos-web/src/interfaces/checkout.interface.ts` — `CatalogProduct` (thêm `imageUrl`).
- `apps/pos-web/src/hooks/page-hooks/checkout/use-checkout-catalog.ts:141-149` — map
  `PosProductCard → CatalogProduct` (truyền `imageUrl`).
- `apps/pos-web/src/components/page-components/Checkout/CheckoutLeftPane/ProductCatalogGrid/ProductCard/ProductCard.tsx`
  — ô ảnh của card.
- `apps/pos-web/src/components/page-components/Checkout/CheckoutDialogs/ProductVariantSelectionModal/ProductHeaderInfo/ProductHeaderInfo.tsx`
  — ô "Xem" của header dialog (thêm prop `imageUrl`).
- `apps/pos-web/src/components/page-components/Checkout/CheckoutDialogs/ProductVariantSelectionModal/ProductVariantSelectionModal.tsx:200-203`
  — truyền `detail?.imageUrl` xuống header.
- **Mới:** `page-components/Checkout/ProductImage/ProductImage.tsx` (ảnh có fallback) và dialog xem ảnh cỡ lớn (`PosDialog` bọc `<img>`) bên trong `ProductHeaderInfo`.
- Không đụng: `apps/api/**`, `packages/api-client/**`, `packages/shared-interfaces/**`,
  `apps/pos-web/src/interfaces/catalog.interface.ts` (đã có `imageUrl`), `ProductCatalogGrid.tsx`.
