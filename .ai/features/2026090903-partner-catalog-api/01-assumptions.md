---
feature: partner-catalog-api
blocking_open: 0
---

# Assumption register

Số liệu trong bảng đo trên `erp_dev_3008` (snapshot 30/08) ngày 2026-09-09:
62 nhóm hàng (56 có cha), 4.731 product, 41.718 item, 8.268 attribute definition,
28.839 option, 80.616 item attribute value.

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|---|---|---|---|---|---|---|
| A-01 | Catalog trả về là của `actor.organizationId` suy từ API key; đối tác không cần và không được chọn tổ chức khác | high | no | Thêm tham số `organizationId` vào cả 3 hợp đồng + kiểm tra quyền chéo tổ chức | pending | — |
| A-02 | **Đối tác chấp nhận nhận mã màu nội bộ.** `product_attribute_options.value_label` của `Color` là 35 mã 1–3 ký tự (`B`, `BA`, `BO`, `CC`, `D`, `Đ`, `N`, `ND`, `X`, `XD`, …), không có tên tiếng Việt và **không có mã hex**. Storefront tham chiếu vẽ 17 ô màu — không dựng được từ dữ liệu hiện có | high | yes | Nếu cần tên/hex: thêm bảng ánh xạ màu + migration + màn nhập liệu ⇒ thêm hẳn 1 UoW và đổi hình dạng `colors[]` trong cả 3 response | resolved | Akenzy chốt 2026-09-09: **trả mã thô**, đối tác tự giữ bảng tên+hex phía họ. `colors[]` là mảng string mã. Không thêm bảng, không migration |
| A-03 | Tên chiều thuộc tính là `"Color"` / `"Size"` (tiếng Anh). Không có bảng master: `product_attribute_definitions` là **theo từng product**, tên do người dùng tự nhập; trên erp_dev chỉ tồn tại đúng 2 tên này | medium | no | Tổ chức nhập `"Màu sắc"` sẽ khiến bộ lọc **câm lặng không khớp** (0 kết quả, không lỗi). Giảm nhẹ: so khớp không phân biệt hoa thường + danh sách bí danh trong hằng số | pending | — |
| A-04 | **"Sắp xếp theo mức độ phổ biến" cần định nghĩa.** Không có cột đếm lượt bán trên `products`/`items`; nguồn duy nhất là gộp `invoice_items`, tốn kém và phụ thuộc khoảng thời gian | high | yes | Chọn "gộp invoice_items" ⇒ thêm 1 ticket query nặng + có thể cần bảng tổng hợp/index; chọn "bỏ" ⇒ hợp đồng chỉ còn 3 kiểu sắp xếp và đối tác phải sửa UI | resolved | Akenzy chốt 2026-09-09: **bỏ `popular`**. Hợp đồng chỉ nhận `newest` \| `price_asc` \| `price_desc`; giá trị khác trả 400 |
| A-05 | **Quyền riêng cho bề mặt đối tác.** 3 endpoint dùng quyền mới `partner.catalog.read`, không tái dùng `inventory.read` | high | yes | Nếu tái dùng `inventory.read`, key đối tác **vẫn gọi được** `/v2/inventory-items/search` và đọc `purchasePrice` ⇒ mục tiêu bảo mật của feature sụp. Nếu dùng quyền mới thì phải seed quyền + tạo role đối tác + gán khi cấp key | resolved | Akenzy chốt 2026-09-09: **quyền mới `partner.catalog.read`** + role "Đối tác" chỉ mang quyền này. Không gỡ `purchasePrice` khỏi DTO nội bộ (giữ backoffice/POS nguyên vẹn) |
| A-06 | Sản phẩm hiển thị cho đối tác khi có ít nhất một item `is_active = true`. `is_pos_visible` **không** dùng làm điều kiện hiển thị (đó là cờ của màn POS) | medium | no | Đối tác thấy hàng lẽ ra chỉ bán tại quầy, hoặc mất hàng lẽ ra bán online | pending | — |
| A-07 | Item có `selling_price = 0` (dữ liệu test, ví dụ `A02-D-39`) vẫn nằm trong kết quả; API không tự ẩn | medium | no | Storefront hiển thị "0 đ" | pending | — |
| A-08 | Nhóm hàng của một product suy từ item con (`items.category_id`), vì `products` không có cột nhóm. Lọc theo nhóm = "có ≥1 item thuộc nhánh nhóm đó"; trường `category` trong response lấy theo item có `code` nhỏ nhất | medium | no | Product có item rải nhiều nhóm sẽ hiện ở nhiều nhánh menu | pending | — |
| A-09 | Tồn kho trả về là **cờ boolean `inStock`**, không trả số lượng. Tính bằng `SUM(stock_balances.quantity) > 0` trên mọi `branch_id` mà key được phép (chốt của chủ sở hữu: phạm vi toàn tổ chức) | high | no | Đối tác cần số lượng thật để hiện "còn 3 đôi" ⇒ thêm 1 trường và một quyết định về lộ dữ liệu thương mại | pending | — |
| A-10 | Đối tác phân trang bằng `page`/`limit` như mọi endpoint v2 khác (`{ data, total, page, limit }`), không cần cursor | high | no | Danh mục 4.731 product không đủ lớn để offset thành vấn đề; nếu sai thì đổi hợp đồng phân trang | pending | — |
| A-11 | `items.variant_label` (dạng `"38 · BA"`) dùng trực tiếp làm nhãn biến thể, không ghép lại từ option | high | no | Nhãn lệch với thuộc tính nếu dữ liệu cũ không đồng bộ; giảm nhẹ bằng cách trả kèm cả `attributes[]` có cấu trúc | pending | — |
| A-12 | Bản đồ kiến trúc ký 2026-08-03 thiếu `modules/api-key` và `modules/mobile`. Đã bổ sung 2 dòng vào bảng module trong Phase 0 thay vì sinh lại (giữ phần người viết tay) | high | no | `touches` trỏ vào module không có trong bản đồ ⇒ `lint-touches` báo lỗi | resolved | Bổ sung 2 dòng vào `.ai/architecture.md` ngày 2026-09-09; không đụng các mục viết tay |
| A-13 | Dữ liệu option có rác: `Size` chứa `35,` và `36,`; `Color` chứa `D,`. API trả nguyên trạng, không dọn | high | no | Danh sách facet của đối tác có giá trị rác; dọn dữ liệu là việc khác | pending | — |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
|---|---|---|---|
| A-90 | Có sẵn bảng ảnh sản phẩm để trả `images[]` | Không có cột ảnh, không có bảng media, không có module upload trong toàn repo. Tiền lệ duy nhất là `imageUrl: null` viết cứng ở `pos-catalog-product.response.dto.ts:23-27` | `images` luôn trả `[]`; ghi vào Out of scope của `00-intent.md` theo chỉ đạo của chủ sở hữu |
| A-91 | Giá bán nằm trên `products` nên một product có một giá | Giá nằm trên `items.selling_price`; một product có nhiều item giá khác nhau | Response danh sách phải trả `priceMin`/`priceMax` (theo tiền lệ `minPrice`/`maxPrice` của POS), không phải một số |
| A-92 | Nhóm hàng gắn trên `products` | Gắn trên `items.category_id`; `products` không có cột nhóm nào | Sinh ra A-08 và khiến lọc theo nhóm phải đi qua item |
| A-93 | Có thể tái dùng `POST /v2/inventory-items/search` cho đối tác, chỉ cần thêm bộ lọc | `InventoryItemGroupRowDto:141` trả `purchasePrice` (giá vốn trung bình) và DTO này dùng chung với backoffice | Phải dựng bề mặt riêng — xem ADR-01 |
