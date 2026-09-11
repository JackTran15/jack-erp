---
feature: product-no-variant-price-edit
blocking_open: 0
---

# Assumption register

| ID   | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| ---- | ---------- | ---------- | -------- | --------------------- | ------ | ---------- |
| A-01 | "Giá nhập" trong yêu cầu là ô Giá mua (`purchasePrice`, giá vốn mặc định của hàng), không phải "Đơn giá nhập đầu kỳ" (`initialStockUnitPrice`, gắn với bút toán tồn đầu) | high | yes | Fix mở nhầm ô; sửa đơn giá đầu kỳ là feature khác hẳn (bút toán đảo trong sổ kho bất biến) | confirmed | Xác nhận bởi Akenzy, 2026-09-11, qua AskUserQuestion: "Đúng, là Giá mua" |
| A-02 | Giữ nhãn "Giá mua TB" / "Giá bán TB" lấy từ `INVENTORY_ITEM_ENTITY_CONFIG`, không đặt nhãn riêng cho form sửa hàng không biến thể | high | no | Chỉ là chữ trên form; đổi sau là một override nhãn trong `renderDynamicField` | confirmed | Xác nhận bởi Akenzy, 2026-09-11, qua AskUserQuestion: "Giữ nhãn hiện có" |
| A-03 | Hàng có biến thể giữ nguyên hành vi hiện tại ở màn sửa: không hiện ô giá chung, giá sửa tại bảng "Danh sách phiên bản". Đang sửa hàng không biến thể mà nhập Màu/Size thì ô giá chung ẩn theo | high | yes | Hiện ô giá chung cho hàng có biến thể → sửa một ô → `pickProductVariantSharedItemFields` ghi cùng giá xuống mọi biến thể | confirmed | Xác nhận bởi Akenzy, 2026-09-11, qua AskUserQuestion: "Giữ như hiện tại" |
| A-04 | Ở màn sửa, xoá trống ô Giá mua TB / Giá bán TB được hiểu là 0 (cùng ngữ nghĩa form Thêm mới: bỏ trống → cột mặc định 0), không báo lỗi "bắt buộc" | high | no | Nếu muốn báo lỗi bắt buộc thay vì về 0: đổi hàm map thành validate, chỉ trong form — không ảnh hưởng thiết kế | pending | — |
| A-05 | Hàng lẻ CÓ thuộc tính (vd fixture `AAA-AIDLC-ATTR`: `product_id IS NULL` nhưng có `item_attribute_values`) nằm ngoài phạm vi — yêu cầu nói rõ "không có thuộc tính"; loại này có bảng phiên bản 1 dòng và giữ nguyên hành vi | medium | no | Nếu người dùng cũng không sửa được giá ở loại này, cần một feature riêng xem nhánh `variants` của hàng lẻ (không có `initialRecord.variants` nên dòng phiên bản không mang `itemId`) | pending | — |
| A-06 | POS đọc giá bán từ `items.selling_price`; giá mới có hiệu lực ở POS theo cơ chế làm mới danh mục POS hiện có, feature này không đụng tới cache POS | medium | no | Thu ngân có thể thấy giá cũ đến khi danh mục POS làm mới — không ảnh hưởng form backoffice | pending | — |
| A-07 | Không tồn tại product có >1 item mà không item nào có thuộc tính (0 trên `erp_dev_3008`), nên ô giá chung không bao giờ ghi một giá cho nhiều item không thuộc tính | high | no | Không còn ảnh hưởng thiết kế: ADR-02 (sửa đổi sau code review 2026-09-11) ẩn ô giá chung khi bản ghi có >1 item, bất kể giả định này đúng hay sai | pending | — |
| A-08 | Product có thuộc tính đặt tên khác Color/Size (theo code review, trang Sản phẩm cho đặt tên tự do, vd "Màu sắc") nằm ngoài phạm vi: form Hàng hoá vốn không hiện bảng phiên bản cho loại này vì `loadProductAttributes` chỉ nhận color/size; feature này chỉ bảo đảm ô giá chung không lộ ra (AC-09), không mở rộng `loadProductAttributes`. Dữ liệu local chỉ có tên Color/Size | medium | no | Người dùng vẫn không sửa được giá từng item của loại product này trong form Hàng hoá — cần feature riêng | pending | — |
