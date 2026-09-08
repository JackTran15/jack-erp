---
feature: report-table-single-line-cells
blocking_open: 0
---

# Assumption register

Hai dòng đầu là hai câu đã hỏi chủ sản phẩm trước khi code (một lượt, 2 câu) và đã được
trả lời. Các dòng còn lại là sự thật đọc từ mã hoặc đo trên trình duyệt, ghi lại để người
sau không phải đo lại.

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Bề rộng cột: ưu tiên `width` backend; cột text không có width → 160px; cột số/ngày giữ 112px | medium | yes | Đổi chính sách là đổi `defaultReportColumnWidth` và mapper — một chỗ, nhưng mọi báo cáo đổi bề rộng | confirmed | Chọn "Backend width + text mặc định 160" — loc, 2026-09-08 |
| A-02 | Chỉ ô dữ liệu (tbody + tfoot) ép một dòng; header cột vẫn xuống dòng | medium | yes | Nếu header cũng phải một dòng thì thêm truncate vào `SortableHeaderCell` và nhãn dài chỉ đọc được khi hover | confirmed | Chọn "Chỉ ô dữ liệu 1 dòng, header vẫn wrap" — loc, 2026-09-08 |
| A-03 | Backend nên khai `width` cho cột định danh dùng chung của 3 nhóm hoá đơn / công nợ / lợi nhuận (một bảng chung, cùng thang với báo cáo kho); cột số để FE fallback | medium | yes | Nếu chủ sản phẩm muốn mọi cột đều có width backend thì bảng chung phải mở rộng sang cột số theo từng báo cáo | confirmed | Ban đầu định chỉ dùng fallback FE; chủ sản phẩm sửa lại "BE khai width, giữ fallback FE, chỉ những cột quan trọng thường gặp" — loc, 2026-09-08 |
| A-04 | `mapHeadersToTableConfig` là điểm vào duy nhất cho cột từ API của cả 4 nguồn, nên sửa một chỗ là đủ | high | no | Nguồn nào đi đường khác thì vẫn 112px | confirmed | `ReportTableConfigSync.tsx:106` là nơi duy nhất gọi; cả 4 fetcher (invoice / inventory / debt / profit) đều đổ vào đó — 2026-09-08 |
| A-05 | Kéo tay cột hẹp lại (columnResizeMode onChange) vẫn cắt "..." chứ không gãy dòng, vì `width` / `minWidth` / `maxWidth` cùng lấy từ `column.getSize()` | high | no | Người dùng kéo cột thì dòng lại phình cao | confirmed | Kéo cột "Tên hàng hóa" từ 220px xuống 91px trên "Doanh thu theo mặt hàng" ngày 2026-09-08 (left_click_drag trên handle `cursor-col-resize`): ô đo 91px, `white-space: nowrap`, "Ba lô TX1…" cắt "...", mọi dòng vẫn 32px |
| A-06 | Lỗi 400 ở request search đầu tiên của drill-down có từ trước và không do thay đổi này | high | no | Nếu do thay đổi này thì drill-down hỏng | confirmed | Network trace 2026-09-08: request 400 mang danh sách cột của báo cáo cha (`hour, invoice_code, product_name…` không thuộc `invoice-item-revenue-detail`), request kế tiếp 201; thay đổi chỉ là CSS/inline style, không chạm payload |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
| --- | --- | --- | --- |
| A-07 | Registry FE (`report-registry/*.registry.ts`) quyết định bề rộng cột nên chỉ cần chỉnh width ở đó | Registry chỉ là fallback khi API trả 0 cột; cột thật đến từ backend qua mapper | Sửa mapper, không đụng registry |
| A-08 | `truncate` trên `<td>` là đủ để cắt chữ | Bảng `width: max-content` + `table-layout: auto` nên cột vẫn nở theo nội dung; cần thêm `maxWidth` inline | ADR-02: `maxWidth: width` đi kèm `truncate` |
| A-09 | Fallback 160px ở FE là đủ cho 3 nhóm không có width backend; sửa backend là feature riêng | Chủ sản phẩm muốn backend là nguồn sự thật cho cột định danh để 3 nhóm đồng bộ với báo cáo kho (và với Excel export) | Thêm T-01-04 + ADR-04; AC-02 đổi kỳ vọng SKU 140 / tên hàng 220 thay vì 160 |
