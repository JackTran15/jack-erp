---
feature: product-image-utilities
blocking_open: 0
---

# Assumption register

Bốn dòng đầu là câu trả lời trực tiếp của Akenzy trong vòng hỏi ngày 2026-09-16 (một lượt,
bốn câu). Phần còn lại là những chỗ tôi tự quyết sau khi đọc mã và đo `erp_dev`, ghi ra để
người khác lật lại được.

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Trang Cập nhật ảnh, **Tải ảnh** trên một dòng **thay toàn bộ** bộ ảnh của nhóm bằng các file vừa chọn (không nối thêm) | high | yes | Nối thêm ⇒ phải đọc bộ ảnh hiện có trước khi gọi ghi, thêm nút xoá từng ảnh, đổi AC-07 | confirmed | Akenzy chốt 2026-09-16: "Thay thế toàn bộ". Nhất quán với ghi chú 3 của Sapo trên trang ảnh nhanh |
| A-02 | Cập nhật ảnh nhanh: bộ ảnh của mẫu mã = **đúng các file thả cùng lượt**, STT chỉ quyết định thứ tự giữa chúng; không ghép vào slot của ảnh cũ | high | yes | Ghép theo slot ⇒ server phải nhận `{seq, mediaId}` và trộn với bộ cũ; contract `set-images` đổi | confirmed | Akenzy chốt 2026-09-16: "Thay toàn bộ bằng file đã thả" |
| A-03 | File đặt tên theo **mã biến thể** được gắn vào **mẫu mã cha**, thẻ file ghi rõ "Gắn vào mẫu mã X"; nhiều file biến thể của cùng mẫu mã gộp thành một bộ theo thứ tự tên file | high | yes | Nếu phải báo "không khớp" thì `resolve-image-names` bỏ nhánh `variant`, AC-11/AC-13 đổi | confirmed | Akenzy chốt 2026-09-16: "Gắn vào mẫu mã cha, có ghi chú" |
| A-04 | Hạn mức media (100 lượt chưa gắn / người / 24h, đếm cả `DELETED`) **giữ nguyên**; trang ảnh nhanh gắn ngay từng mẫu mã và báo 429 theo từng file còn lại | high | yes | Nới hạn mức ⇒ thêm UoW sửa `media-upload.service.ts`, mở lại ADR của media-storage | confirmed | Akenzy chốt 2026-09-16: "Chấp nhận, báo lỗi từng file". Phát hiện khi thi công T-02-03: `media-upload.service.ts` đếm-rồi-chèn, không khoá, nên với 3 vé đồng thời ở mốc 99 cả 2–3 vé đều qua (đo được 2/2 lọt). Không phải lỗi của feature này; ghi để media-storage cân nhắc (`SELECT … FOR UPDATE` hoặc đếm trong transaction) |
| A-05 | Hai trang **không có mục sidebar**; chỉ vào qua Tiện ích, nút Quay lại về `/admin/inventory-items` | medium | no | Thêm hai `NavChild` vào `navConfig.ts` — một ticket 15 phút | pending | — |
| A-06 | Lọc theo nhóm hàng hoá **cha** gồm cả hàng thuộc mọi nhóm **con** (đệ quy) | medium | no | Chỉ khớp đúng một nhóm: bỏ phần mở rộng id con trong handler | pending | — |
| A-07 | Nhóm của một mẫu mã = nhóm của biến thể (lấy `MIN(name)` khi khác nhau). Đo `erp_dev`: 0/2.324 mẫu mã có biến thể khác nhóm | high | no | Hiện sai nhóm cho các mẫu mã lệch; chỉ ảnh hưởng cột hiển thị và bộ lọc | pending | — |
| A-08 | Quy tắc tên file: bỏ phần mở rộng, cắt khoảng trắng, đuôi `(NN)` với NN 1..10 (có hoặc không có số 0 đầu, có hoặc không có khoảng trắng trước ngoặc) là STT; phần còn lại là mã. Đo: 0 mã SKU thật kết thúc bằng `(NN)` nên không nhập nhằng | high | no | Nếu có mã dạng `ABC (01)` thật: khớp nguyên tên trước, rồi mới tách STT | pending | — |
| A-09 | Khớp mã **không phân biệt hoa/thường**; khi một tên khớp cả mẫu mã lẫn biến thể (1 trường hợp trên `erp_dev`), **mẫu mã thắng**. Đo: 0 cặp mã trùng khi lower() ở cả `items` lẫn `products` | high | no | Phải hỏi lại người dùng chọn owner — thêm UI | pending | — |
| A-10 | Danh sách định dạng hiển thị trên trang ảnh nhanh theo đúng `GOODS_POLICY` (`.jpg, .jpeg, .png, .gif, .webp`, < 2 MB), không sao chép nguyên văn Sapo (không có webp) | high | no | Chỉ là chuỗi hiển thị | pending | — |
| A-11 | Trang Cập nhật ảnh **tự tải** với bộ lọc mặc định khi mở, sau đó chỉ tải lại khi bấm **Lấy dữ liệu** hoặc đổi trang/kích thước trang; đổi bộ lọc không tự tải | medium | no | Đổi `enabled`/`refetch` trong hook, không đổi API | pending | — |
| A-12 | **Tải ảnh** trên dòng cho chọn **nhiều** file một lần (≤ 10), không chỉ một như Sapo | medium | no | Bỏ `multiple` trên input | pending | — |
| A-13 | Trang Cập nhật ảnh chỉ liệt kê nhóm **đang kinh doanh** (giống mặc định lưới), còn `resolve-image-names` khớp cả mã ngừng kinh doanh (file đã đặt tên thì vẫn gắn được) | medium | no | Thêm `includeInactive` vào DTO tìm kiếm / thêm điều kiện `is_active` vào resolve. Ghi chú 2026-09-16 (T-01-01): con số 2.505/2.507 trong intent/AC-02/AC-03 ban đầu đo **không** lọc `is_active`; với A-13 số đúng là 2.446/2/2.448 (59 nhóm ngừng kinh doanh) — đã sửa lại các artifact, không đổi quyết định | pending | — |
| A-14 | `set-images` nhận tối đa **50** assignment/lần, `resolve-image-names` tối đa **500** tên/lần; FE tự chia lô | high | no | Đổi hằng số + `@ArrayMaxSize` | pending | — |
| A-15 | Trang ảnh nhanh tải lên với **đồng thời 3** file, gắn theo từng mẫu mã ngay khi đủ file của mẫu mã đó; không có nút tạm dừng | medium | no | Đổi hằng số concurrency | pending | — |
| A-16 | Bộ đếm "Cập nhật k/N ảnh": N = số file đã thả (kể cả lỗi), k = số file sẽ được gắn khi bấm Cập nhật; sau khi chạy, k đếm số file đã gắn thành công | medium | no | Chỉ là cách đếm hiển thị | pending | — |
| A-17 | Ô tìm kiếm "mã SKU hoặc tên" khớp **chứa** (ILIKE) trên mã nhóm, tên nhóm **và mã biến thể** — người dùng hay gõ mã trên tem, tức mã biến thể | medium | no | Bỏ nhánh biến thể trong vị từ | pending | — |
| A-18 | Cột Ảnh hiện **ảnh đầu tiên** theo `sort_order`; nhóm chưa có ảnh hiện placeholder icon (lucide `ImageOff`) như hình túi xám của Sapo | high | no | Chỉ là hiển thị | pending | — |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
| --- | --- | --- | --- |
| — | — | — | — |
