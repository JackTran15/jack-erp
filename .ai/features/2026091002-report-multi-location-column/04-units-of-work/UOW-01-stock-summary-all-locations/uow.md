---
id: UOW-01
slug: stock-summary-all-locations
title: Tổng hợp nhập xuất tồn kho hiện đủ mọi kho–vị trí
demoable: true
duration: 2d
depends_on: []
requirements: [US-01, US-03]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-09, AC-10, AC-11, AC-12]
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
5. Cột "Mã vị trí" của mặt hàng A hiện `A1-A101, A2-A201`; cột "Tên vị trí" hiện tên tương ứng.
6. Đặt cặp (mặt hàng A, kệ `A101`) sang Ngừng theo dõi, tải lại → ô chỉ còn `A2-A201`,
   mặt hàng A vẫn nằm trên báo cáo.
7. Chọn bộ lọc "Kho" = `A1` → tập dòng và các số nhập/xuất/tồn không đổi so với trước khi sửa.
8. Chuyển sang chế độ xem chuỗi → hai cột vị trí biến mất khỏi danh mục cột.
9. Xuất Excel → ô vị trí trong file chứa đủ mọi cặp.

## In scope

- Viết lại phần gom kệ trong `item-warehouse-location.util.ts`: hợp kệ ưu tiên và kệ còn tồn,
  khử trùng, loại đúng cặp Ngừng theo dõi, sắp tất định, nối chuỗi kèm tiền tố mã kho.
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

- [ ] AC-01 đến AC-06, AC-09 đến AC-12 pass
- [ ] `resolveItemWarehouseLocations` giữ nguyên chữ ký; bốn nơi gọi không sửa dòng nào
- [ ] Có spec riêng cho `item-warehouse-location.util.ts`
- [ ] `pnpm --filter @erp/api test` xanh
- [ ] Demo script chạy được đầu-cuối và được nghiệm thu ở G4
