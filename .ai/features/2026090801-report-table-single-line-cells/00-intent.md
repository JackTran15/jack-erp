---
feature: report-table-single-line-cells
slug: 2026090801-report-table-single-line-cells
owner: loc
created: 2026-09-08
status: approved
---

# Intent — Ô dữ liệu bảng báo cáo hiện đúng một dòng

## Problem

Lưới báo cáo (Báo cáo > Bán hàng / Kho / Công nợ / Lợi nhuận, và dialog drill-down dùng
chung lưới đó) đang cho ô dữ liệu xuống nhiều dòng: `MTY73605-H-36` gãy thành hai dòng ở
cột "Mã SKU", tên hàng dài kéo cao cả dòng. Chiều cao dòng không đều nên mắt không quét
được theo hàng ngang, và bảng trông "vỡ" ngay ở báo cáo tồn kho theo cửa hàng — màn hình
người dùng chụp gửi ngày 2026-09-08.

Hai nguyên nhân độc lập, đối chiếu trực tiếp trên mã:

1. Mọi cột đều rộng đúng 112px. `mapHeadersToTableConfig` gán cứng
   `DEFAULT_REPORT_COLUMN_WIDTH` và bỏ qua `width` mà backend trả về trong
   `ReportColumnHeader` — trong khi báo cáo kho đã khai sẵn sku 140 / name 220 / parentSku
   140. Registry FE có width nhưng chỉ là fallback khi API trả 0 cột, nên không có tác dụng.
2. `<td>` không có nowrap/ellipsis. Bảng dùng `width: max-content` + layout auto, nội dung
   dài thì cột nở hoặc chữ gãy dòng.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Kế toán / quản lý xem báo cáo | Dòng cao thấp khác nhau, SKU gãy làm hai, phải dò từng dòng | Mỗi dòng đúng một dòng 32px; SKU, tên hàng đọc trọn trên một dòng; giá trị dài cắt "..." và hover thấy đủ |
| Quản trị hệ thống thiết lập cột | Kéo hẹp cột thì chữ gãy dòng, dòng phình cao | Kéo hẹp thì chữ cắt "...", dòng vẫn 32px |

## Success signal

Trên "Số lượng tồn kho theo cửa hàng" và "Doanh thu theo mặt hàng" (dữ liệu tháng trước),
mọi `<tr>` trong tbody cao đúng 32px, không ô nào có `white-space` khác `nowrap`, và cột
"Mã SKU" của báo cáo kho đo được 140px (giá trị backend) thay vì 112px.

## Out of scope

- Header cột vẫn được xuống dòng — nhãn dài ("Chi nhánh Long Xuyên") cần đọc đủ, và logic
  sticky đã đo chiều cao header động; chủ sản phẩm chốt 2026-09-08.
- Không khai `width` backend cho cột số / tiền của báo cáo hoá đơn / công nợ / lợi nhuận —
  chỉ cột định danh dùng chung (SKU, tên hàng, khách hàng, số chứng từ, ngày…) có width
  từ backend; cột số để FE fallback 112px. Chủ sản phẩm chốt 2026-09-08.
- Không thêm trường `minWidth` / `truncate` vào `ReportColumnTableConfig` — `width` là đủ.
- Lỗi 400 "Unknown report columns" ở request search đầu tiên khi mở drill-down (dialog gửi
  danh sách cột của báo cáo cha trước khi cột báo cáo con nạp xong, rồi tự refetch thành
  công) — có từ trước, không liên quan tới lưới.

## Constraints

| Kind | Detail |
| --- | --- |
| Platform | Chỉ desktop; lưới back-office không có thiết kế mobile |
| Compat | Không đổi API, không đổi `openapi.snapshot.json`; `ReportColumnHeader.width` đã tồn tại — backend chỉ bắt đầu điền nó cho 3 nhóm còn lại |
| Side effect | `report-export.service.ts` đọc `header.width` để đặt bề rộng cột Excel, nên file xuất của 3 nhóm cũng đổi bề rộng cột định danh (px/7 ký tự) |
| Style | Dùng idiom `truncate` sẵn có của repo (`BaseDataTable.tsx:628`), không viết CSS mới |

## Existing surface touched

- Reused components: `ReportPageTableView` (lưới duy nhất cho mọi báo cáo và drill-down),
  `lib/table/report-table.ts` (helper width / align / format); backend: `enrichHeader`
  (invoice, profit) và `debtColumn` (debt) — ba điểm sinh header của 3 nhóm.
- Adjacent features: `report-sticky-header-footer` (sticky đo chiều cao header — không
  đụng), `report-column-config-per-branch` (columnSizing đi qua `table.factory.ts` — chỉ
  đổi giá trị đầu vào, không đổi luồng).
- Entry points: không có route mới.
