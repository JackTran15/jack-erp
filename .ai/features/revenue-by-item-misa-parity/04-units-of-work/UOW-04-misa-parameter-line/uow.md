---
id: UOW-04
slug: misa-parameter-line
title: Dòng tham số đầy đủ kiểu MISA cho revenue-by-item
demoable: true
duration: 1d
depends_on: [UOW-03]
requirements: [US-03]
verifies: [AC-12, AC-13, AC-14, AC-15, AC-16]
risk: medium
status: todo
rollback: revert 1 commit — handler chọn builder theo reportType, bỏ nhánh là về hành vi cũ
---

# UOW-04 — Dòng tham số đầy đủ kiểu MISA

## Demo script

1. Mở **Doanh thu theo mặt hàng**, chọn kỳ, **không** đặt filter nào khác, một cửa hàng
2. Bấm Xuất khẩu, mở file → dưới dòng `Từ ngày … Đến ngày …` có dòng in nghiêng:
   `Xem theo cửa hàng: <tên chi nhánh>; Nhóm hàng hóa: Tất cả nhóm; Thống kê theo: Hàng hóa; Thống kê theo chi nhánh: Không; Loại hàng hóa: Hàng hóa; Thương hiệu: Tất cả`
3. Đặt "Nhóm hàng hóa" = `Giày nam`, "Thống kê theo" = `Mẫu mã`, xuất lại → dòng đổi thành
   `… Nhóm hàng hóa: Giày nam; Thống kê theo: Mẫu mã; …` (tên nhóm thật, không phải `đã lọc`)
4. Đổi phạm vi sang **Toàn hệ thống**, xuất lại → `Xem theo cửa hàng: Toàn hệ thống`
5. Mở **Doanh thu theo ngày**, xuất khẩu → **không** có dòng tham số nào mới, chỉ có
   `Từ ngày … Đến ngày …` như trước (luật cũ giữ nguyên cho 3 báo cáo kia)

## In scope

- Provider `RevenueByItemParamsBuilder`: sinh dòng tham số 6 phần theo MISA, kể cả giá trị
  mặc định (A-03)
- Resolve **tên thật** của cửa hàng và nhóm hàng hóa, lùi về marker `đã lọc` khi không
  resolve được (A-11, AC-14)
- Handler chọn builder theo `dto.reportType`; 3 báo cáo hóa đơn khác đi đường
  `invoiceFilterSummary` không sửa đổi

## Not in scope

- Đổi luật dòng tham số cho 3 báo cáo hóa đơn khác — AC-16 khóa lại là KHÔNG đổi
- Copy chuỗi rác `; : False` của MISA (A-19)
- Làm `productType` có tác dụng thật — dòng tham số in `Hàng hóa` như mặc định (A-10)

## Risks

| Risk | Mitigation |
|---|---|
| Dòng tham số hứa `Loại hàng hóa: Hàng hóa` trong khi filter `productType` không có tác dụng (A-10) | Phát biểu vẫn đúng trên dữ liệu thật (ERP chỉ bán hàng hóa). Ghi assumption và một comment tại chỗ để lần sau `productType` có backing thì kiểm lại trước |
| 2 truy vấn thêm cho mỗi lần export | Không phụ thuộc số dòng (NFR); resolve theo id đơn lẻ. T-04-01 khẳng định số lời gọi repository |
| `Thống kê theo chi nhánh: Không` là hằng số, dễ bị coi là filter thật (A-09) | Comment tại chỗ nói rõ ERP không có chức năng tách theo chi nhánh nên câu này luôn đúng |

## Definition of done

- [x] AC-12..AC-16 pass
- [~] Dòng tham số trên file thật khớp thứ tự 6 phần — xác nhận qua T-05-01 (workbook thật đọc lại qua ExcelJS, nhưng repository mock) + unit test của builder; CHƯA tải file thật qua HTTP endpoint (cần xin phép tải file, Akenzy chọn dừng ở mức đã xác nhận — xem `07-reconciliation-note.md`)
- [x] Không chứa `": False"`, không chứa `"đã lọc"` khi id resolve được — khóa bằng test
- [x] `pnpm --filter @erp/api test` xanh
- [x] Demoed và accepted ở gate G4 — solo, `done --no-review`
