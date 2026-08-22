---
id: UOW-02
slug: stock-summary-pushdown
title: Báo cáo "Tổng hợp nhập xuất tồn kho" hết lỗi 400 và lọc được các cột mặt hàng, vị trí
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-01, US-02, US-03]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-09, AC-10, AC-11, AC-12, AC-22, AC-23]
risk: high
status: todo
rollback: revert `stock-period.service.ts` + `stock-summary.report.ts`; specs chỉ THÊM khoá nên đường GET cũ không đổi nghĩa dù revert nửa chừng
---

# UOW-02 — Báo cáo "Tổng hợp nhập xuất tồn kho" hết lỗi 400 và lọc được các cột mặt hàng, vị trí

## Demo script

1. Mở "TỔNG HỢP NHẬP XUẤT TỒN KHO" ở chế độ Chuỗi cửa hàng, kỳ "Tháng này", không lọc gì — đúng bối cảnh trong ảnh chụp lỗi
2. Bấm Lấy dữ liệu → 200, lưới hiện 50 dòng, footer có số. Network tab KHÔNG còn "Report exceeds 50000 rows (74515)"
3. Đọc `total` trong response → 74515, tức footer đang mô tả toàn tập chứ không phải trang
4. Lọc cột "Nhóm hàng" = một nhóm cụ thể → footer và tổng số dòng đổi theo; sang trang 2 vẫn đúng bộ lọc đó
5. Lọc cột "Mã vị trí" bắt đầu bằng một tiền tố kho → số dòng giảm, không lỗi 42P01 (câu count đã có join)
6. Chọn "Đơn vị tính" trên thanh lọc → tổng số dòng giảm, chứng tỏ không còn lọc sau khi cắt trang
7. Lọc cột "Nhà cung cấp" → nhận 400 nêu đích danh tên cột (cố ý, đóng ở UOW-03)

## In scope

- `periodColumnSpecs` thêm 5 spec mức mặt hàng: parentSku, parentName, color, size, group — dùng chung cho cả ba báo cáo chạy trên `StockPeriodService`
- 2 spec mức vị trí: positionCode, positionName
- Bổ sung join `products` / `inventory_item_categories` / `locations` vào **câu count**, hiện chỉ join `items` (A-08, ADR-04)
- `filters.unit` / `filters.brand` gộp vào `columnFilters` thay vì lọc JS (ADR-06)
- `countRows()` cho `stock-summary` và chuyển trọn `stock-summary.report.ts` sang pushdown

## Not in scope

- Cột `supplier` và 4 cột điều chuyển — UOW-03
- Hai báo cáo còn lại của cùng engine — UOW-04

## Risks

| Risk | Mitigation |
|---|---|
| Câu count hiện không join locations/products/categories; spec mới làm nó vỡ 42P01 (A-08) | T-02-01 và T-02-02 mỗi cái sửa cả hai câu trong cùng ticket, done-when chạy thật cả hai |
| Join thêm có thể làm nở số dòng ở câu count và làm sai `total` | `products`/`inventory_item_categories` là quan hệ nhiều-một nên không nở; done-when có test khẳng định `total` không đổi khi bật/tắt bộ lọc rỗng |
| Đường GET cũ dùng chung engine (A-10) | Specs chỉ thêm khoá mới; T-02-01 có test hồi quy cho `runStockPeriod` |

## Definition of done

- [x] AC-01 chạy được trên tổ chức 74515 dòng
- [x] AC-04 — parity với đường JS trên tổ chức nhỏ, từng dòng từng cột
- [x] `stock-summary.report.ts` không còn `assertUnderRowCap` / `applyColumnFilters` / `paginateRows`
- [x] `pnpm --filter @erp/api test` xanh
- [ ] Demo được nghiệm thu ở gate G4
