---
id: UOW-01
slug: stock-summary-all-locations
title: Tổng hợp nhập xuất tồn kho hiện đủ mọi kho–vị trí
demoable: true
duration: 2d
depends_on: []
requirements: [US-01, US-03]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-09, AC-10, AC-11, AC-12, AC-14]
risk: medium
status: todo
rollback: revert `item-warehouse-location.util.ts` về bản một-kệ; không có migration, không có cột dữ liệu mới, nên revert code là đủ
---

# UOW-01 — Tổng hợp nhập xuất tồn kho hiện đủ mọi kho–vị trí

Đây là lát cắt chứa toàn bộ lời giải kỹ thuật. UOW-02 chỉ đi kiểm chứng ba báo cáo còn lại
thừa hưởng được gì từ đây.

## Demo script

1. Đăng nhập backoffice, chọn chi nhánh có ít nhất hai kho lưu trữ.
2. Vào Danh mục > Kho hàng, xác nhận chi nhánh có kho `A1` và `A2`.
3. Vào Chi tiết vị trí hàng hoá, xếp mặt hàng A lên kệ `A101` (kho `A1`) và `A201` (kho `A2`).
4. Mở Báo cáo > Tổng hợp nhập xuất tồn kho ở chế độ một chi nhánh.
5. Cột "Mã vị trí" của mặt hàng A hiện `A101, A201`; cột "Tên vị trí" hiện
   `<tên kệ A101>, <tên kệ A201>` (sửa lần hai 2026-09-12, ADR-06: ô tên cũng không còn tên kho;
   hai ô sắp theo mã vị trí nên đọc cùng thứ tự).
6. Đặt cặp (mặt hàng A, kệ `A101`) sang Ngừng theo dõi, tải lại → ô "Mã vị trí" chỉ còn `A201`,
   mặt hàng A vẫn nằm trên báo cáo.
7. Chọn bộ lọc "Kho" = `A1` → tập dòng và các số nhập/xuất/tồn không đổi so với trước khi sửa.
8. Chuyển sang chế độ xem chuỗi → hai cột vị trí biến mất khỏi danh mục cột.
9. Xuất Excel → ô vị trí trong file chứa đủ mọi cặp.

## In scope

- Viết lại phần gom kệ trong `item-warehouse-location.util.ts`: hợp kệ ưu tiên và kệ còn tồn,
  khử trùng, loại đúng cặp Ngừng theo dõi, sắp tất định, rồi nối chuỗi — ô mã chỉ gồm mã vị trí
  đã khử trùng, ô tên chỉ gồm tên vị trí và **không** khử trùng, sắp theo
  `(mã vị trí, tên vị trí, mã kho)` (A-03, A-07 và A-18, sửa lần hai 2026-09-12; T-01-06).
- Giữ nguyên chữ ký và kiểu trả về của `resolveItemWarehouseLocations` (ADR-01).
- Cập nhật kỳ vọng trong `stock-summary.report.spec.ts` và thêm spec riêng cho hàm dùng chung
  (hiện chưa có file nào).
- Nới độ rộng hai cột vị trí ở khai báo backend và registry frontend.

## Not in scope

- Ba báo cáo doanh thu/lợi nhuận — UOW-02.
- Thêm bộ lọc theo vị trí (A-05).
- Bất kỳ thay đổi nào ở `stock-period.service.ts`.

## Risks

| Risk | Mitigation |
| --- | --- |
| Truy vấn `stock_balances` nay chạy cho mọi mặt hàng của trang thay vì phần còn thiếu (A-11) | T-01-01 kèm test đếm số lần gọi repository; phạm vi vẫn là một trang 20 dòng |
| Quy tắc Ngừng theo dõi của `2026090401-untracked-location-hidden` bị phá khi chuyển sang nhiều cặp (A-12) | T-01-02 tách riêng, có test cho đúng tình huống "một cặp bị ngừng, cặp khác còn lại" |
| Test hiện có kỳ vọng chuỗi trần `'A10'` / `'DEFAULT'` (ADR-03) | T-01-03 cập nhật kỳ vọng có chủ đích, không nới lỏng assert |

## Definition of done

- [x] AC-01 đến AC-06, AC-09 đến AC-12, AC-14 pass
- [x] `resolveItemWarehouseLocations` giữ nguyên chữ ký; bốn nơi gọi không sửa dòng nào
- [x] Có spec riêng cho `item-warehouse-location.util.ts`
- [x] `pnpm --filter @erp/api test` xanh — **chạy lại sau T-01-06/T-02-05: 4664/4670 test, 359/362 suite**
      (trước là 4663/4669; chênh đúng 1 test mới của T-01-06). Ba suite đỏ còn lại là lỗi sẵn có, không
      liên quan và không nằm trong diff: `employee-listing-surfaces` (đòi khai báo `api-key-crud.service.ts`, từ #195),
      `auth.service` (2 test TTL, lỗi DI `BranchEntityRepository`), `partner-catalog.module` (2 test, lỗi DI `RbacService`)
- [x] Demo script chạy được đầu-cuối và được nghiệm thu ở G4 — Akenzy build và kiểm trên nhánh `develop`, 12/09/2026. Nghiệm thu bằng mắt trên môi trường develop, **không** phải demo chạy tay từng bước ở local và không có ảnh chụp; AC-19 vẫn không đạt (xem T-03-04).
- [x] ADR-06 (2026-09-12): ô tên chỉ còn tên vị trí, thứ tự đổi sang khoá nhìn thấy được — T-01-06

Trạng thái 2026-09-12: AC-12 đã đo thật ở 1440x900 trên `erp_dev_3008` (chi tiết và ảnh ở T-01-04); lần đo đầu
**đỏ** với `220`, Akenzy chọn nới cột tên lên `320`, đo lại xanh. AC-11 vẫn là bằng chứng đọc mã (`xlsx-stream.writer.ts`
chép nguyên giá trị ô), không phải test xuất file. Ô nghiệm thu để trống chờ Akenzy chốt.
