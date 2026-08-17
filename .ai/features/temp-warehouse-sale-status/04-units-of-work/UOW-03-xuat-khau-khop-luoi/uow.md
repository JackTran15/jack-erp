---
id: UOW-03
slug: xuat-khau-khop-luoi
title: File Excel và bản in đọc y như lưới
demoable: true
duration: 1d
depends_on: [UOW-01, UOW-02]
requirements: [US-03]
verifies: []   # AC-08 không có bề mặt chụp được — xem ghi chú dưới
risk: low
status: done
rollback: revert commit; chỉ chạm spec của report definition, không chạm đường sinh dữ liệu
---

# UOW-03 — File Excel và bản in đọc y như lưới

Xuất khẩu và In đi qua `TempWarehouseOutReport` → `TempWarehouseReportService.list`, nên về cấu
trúc chúng phải khớp lưới. Lát cắt này biến "phải khớp" thành "đã kiểm chứng là khớp".

## Demo script
1. Backoffice → Báo cáo → Hàng hóa xuất kho tạm (chế độ chuỗi cửa hàng), chi nhánh Buôn Ma Thuật,
   kỳ "Tháng này". Ghi lại số dòng và dòng tổng ở footer
2. Bấm **Xuất khẩu**, mở file Excel
3. Cột Trạng thái chứa "Bán hàng kho tạm"; dòng tổng trong file bằng dòng tổng ở footer lưới
4. Bật filter cột Trạng thái = "Bán hàng kho tạm", Xuất khẩu lại → file chỉ chứa dòng đó, tổng
   giảm theo
5. Bấm **In** với cùng bộ lọc → bản xem trước có cùng số dòng và cùng dòng tổng

## In scope
- Cập nhật `temp-warehouse-out.report.spec.ts` theo bộ trạng thái mới
- Kiểm chứng Xuất khẩu / In khớp lưới, gồm cả khi có filter cột Trạng thái

## Not in scope
- Sửa lệch `columnFilters` giữa hai đường (`buildData:108` áp bằng JS, REST cũ áp bằng SQL) —
  defect có sẵn, Out of scope §3 của intent
- Đo trần 50.000 dòng — không còn cần thiết sau khi gỡ nguồn showroom: số dòng bằng đúng trước
  toàn bộ tính năng, nên không có áp lực mới nào lên `assertUnderRowCap`

## Risks
| Risk | Mitigation |
| --- | --- |
| `applyColumnFilters` (JS) hiểu chuỗi trạng thái khác `buildReportColumnFilter` (SQL) ⇒ Excel lệch lưới | Bước 4 của demo so trực tiếp hai đường trên cùng một filter |

## Ghi chú về `verifies:` rỗng

Không phải vì AC-08 không được kiểm, mà vì nó **không kiểm được bằng ảnh chụp**: thứ cần chứng minh
là *nội dung file tải về*, và một ảnh chụp nút "Xuất khẩu" vừa bấm xong không nói gì về nội dung đó.
Ảnh chụp ở đây sẽ là bằng chứng giả.

Thay vào đó AC-08 được kiểm bằng cách gọi thẳng `POST /reports/inventory/export` rồi giải nén XLSX
ra đọc — 4 ô `Bán hàng kho tạm`, 0 ô nhãn cũ, 3 ô `Xuất không bán`, dòng tổng `7/0/4/3` trùng đúng
ô `tfoot` mà bước S2 chụp. Bảng đối chiếu đầy đủ ở `07-verification.md` mục "Kiểm chứng ngoài trình
duyệt", và tính chất khiến hai đường không thể lệch được khoá bằng spec ở T-03-01.

## Definition of done
- [x] AC-08 pass ở tầng dữ liệu (T-03-01); bằng chứng thị giác chờ G4
- [x] `pnpm --filter @erp/api test` xanh — 217 suite / 1992 test
- [x] Đối chiếu thật: lưới (ảnh S1–S4 của UOW-01) và nội dung file XLSX giải nén — khớp từng giá trị
