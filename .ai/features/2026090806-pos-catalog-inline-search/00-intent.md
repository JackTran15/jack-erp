---
feature: pos-catalog-inline-search
slug: 2026090806-pos-catalog-inline-search
owner: Akenzy
created: 2026-09-08
status: draft
---

# Intent — pos-catalog-inline-search

## Problem

Một màn hình, hai câu trả lời khác nhau cho cùng một câu hỏi.

Gõ `112` vào ô tìm ở thanh "TƯ VẤN BÁN HÀNG": dropdown hiện 5 SKU khớp
(`Dép nữ AKDP1129-D-35`, `-36`, `-37`…), còn lưới ngay bên dưới ghi
**"Chưa có hàng phù hợp"**.

Cả hai đều đọc cùng một chuỗi `catalogQuery`, nhưng hỏi hai nơi khác nhau:

| | Nguồn | Phạm vi |
|---|---|---|
| Dropdown | `GET /catalog/search` (server) | mọi SKU của chi nhánh, khớp mã vạch / SKU / tên |
| Lưới | lọc trong bộ nhớ | **20 card đã tải**, chỉ khớp `name` |

Đường lọc của lưới nằm ở `use-checkout-catalog.ts:118-129`:

```ts
// Grid hiển thị MỖI SẢN PHẨM 1 card (product-level). Lọc client-side theo tên
// trên danh sách product đã tải (endpoint products không có tham số search).
const q = catalogQuery.trim().toLowerCase();
return productCards.filter((c) => !q || c.name.toLowerCase().includes(q))
```

Chú thích đó **không còn đúng**. `PaginationQueryDto` vốn đã khai báo `search`, và
[[2026090805-pos-initial-load-latency]] vừa hiện thực nó trong SQL: khớp trên
`items.code`, `items.name`, `items.variant_label`, `products.name` và tên nhóm hàng.
Lưới đang không dùng thứ đã có sẵn.

Hệ quả với dữ liệu thật: `AK59` là tiền tố **mã**, không phải tên. Không card nào trong
20 card đầu có `name` chứa `AK59`, nên lưới trống — trong khi đúng 6 card khớp theo mã.

## Success signal

- Gõ `AK59` → lưới hiện đúng các card khớp theo mã (AK5907, AK598-6, AK5903, AK5901A,
  AK5908, AK5938), không cần bấm Enter.
- Gõ `112` → lưới hiện các card chứa SKU khớp, **không còn** "Chưa có hàng phù hợp"
  khi thực tế có hàng.
- Không còn dropdown gợi ý mức SKU dưới ô tìm — lưới là câu trả lời duy nhất.
- Tìm ra đúng một card → dialog chọn biến thể tự mở.
- Quét mã vạch vẫn tự thêm thẳng vào giỏ như hôm nay, **không** mở dialog.

## Out of scope

- **`POST /v2/.../catalog/products/search` theo chuẩn CQRS.** Chủ sở hữu chốt 2026-09-08:
  dùng `GET` hiện tại kèm `search`. Endpoint đã nhận tham số này; không thêm endpoint,
  không chạy lại `openapi:generate`.
- **Máy móc auto-add mã vạch** (`use-checkout-barcode-auto-add.ts`): guard khử trùng
  `claimRef`, `tryAutoAdd`, nhánh `added` của `searchWithAutoAdd`. Không đụng — đây là
  đường bán hàng bằng máy quét.
- **Ô tìm thứ hai (F3)** trong `POSToolbar/ProductSearchInput`. Nó ghi `toolbar.query`,
  không phải `catalogQuery`, và không lái lưới. Ngoài phạm vi.
- Hiệu năng đường tìm kiếm SQL (35–42 ms, quét tuần tự) — đã ghi thành việc kéo theo ở
  [[2026090805-pos-initial-load-latency]] A-04.
- Bố cục/kích thước ô tìm. Ảnh mục tiêu cho thấy ô rộng hơn và icon mã vạch thay vì icon
  kính lúp; đó là ô F3 ở một chỗ khác. Feature này đổi **hành vi**, không đổi bố cục.

## Constraints

- **Quét mã vạch không được hỏng.** Một lần quét trúng SKU tuyệt đối phải thêm thẳng vào
  giỏ và xoá ô tìm, đúng như hôm nay — không được biến thành "mở dialog".
- `minChars = 3` hiện chặn dropdown vì `pg_trgm` cần ≥3 ký tự. Đường lưới đi qua truy vấn
  khác (`LIKE` trên cột đã `lower()`, không dùng trigram), nên ngưỡng này phải được quyết
  lại chứ không bê nguyên.
- Debounce đã có sẵn 150 ms trong `PosSearchPopover` và `hooks/common/use-debounce.ts` —
  dùng lại, không đặt số mới.
- Không đổi hợp đồng API. `GET /pos/branches/:branchId/catalog/products` giữ nguyên.
- Dialog biến thể đã có (`useCheckoutVariantSelection.openForCatalogCard`) — tái dùng,
  không dựng dialog mới.
