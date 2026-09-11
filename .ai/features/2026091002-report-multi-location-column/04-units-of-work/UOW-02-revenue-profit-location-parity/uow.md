---
id: UOW-02
slug: revenue-profit-location-parity
title: Ba báo cáo doanh thu và lợi nhuận hiện cùng chuỗi vị trí
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-07, AC-08, AC-13]
risk: low
status: todo
rollback: revert T-02-03 (bảng độ rộng dùng chung + 2 registry frontend) trả cột về độ rộng cũ; phần còn lại của lát chỉ là test
---

# UOW-02 — Ba báo cáo doanh thu và lợi nhuận hiện cùng chuỗi vị trí

Theo ADR-01, ba báo cáo này **không cần sửa mã sản phẩm**: chúng đọc `.code` / `.name` từ
cùng một hàm dùng chung mà UOW-01 đã sửa. Lát cắt này tồn tại để chứng minh điều đó thật sự
đúng — và để bắt ngay nếu nó không đúng.

Đây là lý do lát cắt chỉ gồm ticket loại `test`: giá trị nó tạo ra là bằng chứng, không phải
mã mới. Nếu một trong ba báo cáo hoá ra cần sửa, ticket tương ứng sẽ mở rộng `touches` sang
file báo cáo đó và ghi lại lý do.

> **Cập nhật khi mở lại G1 (2026-09-10):** T-02-03 nới độ rộng cột vị trí của ba báo cáo, nên
> lát này nay **có** thay đổi mã sản phẩm — bảng độ rộng dùng chung và hai registry frontend.
> Phần kiểm chứng nội dung chuỗi (T-02-01, T-02-02) vẫn không cần sửa mã, đúng như ADR-01.

## Demo script

1. Dùng chính chi nhánh và mặt hàng A đã dựng ở demo của UOW-01 (kệ ở hai kho `A1`, `A2`).
2. Tạo một hoá đơn bán mặt hàng A để ba báo cáo có dữ liệu.
3. Mở Báo cáo > Chi tiết doanh thu theo mặt hàng, bật cột vị trí → hiện `A1-A101, A2-A201`.
4. Mở Báo cáo > Doanh thu theo mặt hàng → cùng chuỗi đó ở cả cột mã và cột tên.
5. Mở Báo cáo > Lợi nhuận theo mặt hàng → cùng chuỗi đó ở cột vị trí.
6. Lấy một mặt hàng chỉ còn tồn ở showroom → ô vị trí ở cả ba báo cáo **để trống**, khác với
   Tổng hợp nhập xuất tồn kho (nơi nó hiện kệ showroom).
7. Xem cả ba báo cáo trên khung nhìn 1440x900 → ô vị trí của mặt hàng A hiện trọn
   `A1-A101, A2-A201`, không bị cắt.

## In scope

- Hồi quy `invoice-item-revenue-detail.report.ts` và `revenue-by-item.report.ts`.
- Hồi quy `profit-by-item.report.ts`, nơi chỉ lấy `loc.code` và bỏ `name`.
- Khẳng định ba báo cáo này **không** nhận `showroomFallback` và vì thế không lẫn kệ showroom.
- Nới độ rộng cột vị trí của ba báo cáo lên `220` ở bảng dùng chung `REPORT_COLUMN_WIDTHS` và registry
  frontend (T-02-03) — bổ sung khi mở lại G1.

## Not in scope

- Thêm cột vị trí cho báo cáo nào chưa có.
- Đổi cách ba báo cáo này chọn chi nhánh để tra kệ.

## Risks

| Risk | Mitigation |
| --- | --- |
| `profit-by-item.report.ts:222-229` map `[itemId, loc.code]` sang `Map<string, string \| null>` — kiểu có thể không còn khớp (A-10) | T-02-02 chạy `tsc` và test cho riêng báo cáo này trước khi kết luận "không cần sửa" |
| `invoice-item-revenue-detail` gọi hàm dùng chung một lần cho mỗi chi nhánh rồi khoá `${branchId}:${itemId}` | T-02-01 có test cho tình huống nhiều chi nhánh |

## Definition of done

- [ ] AC-07 và AC-08 pass
- [ ] Ba báo cáo hiện đúng cùng chuỗi với Tổng hợp nhập xuất tồn kho
- [ ] Ô vị trí của ba báo cáo này để trống với mặt hàng chỉ ở showroom
- [ ] Nếu có báo cáo nào phải sửa mã sản phẩm, lý do được ghi vào ticket tương ứng
- [ ] `pnpm --filter @erp/api test` xanh
- [ ] AC-13 pass: ô vị trí ở ba báo cáo hiện trọn chuỗi hai cặp trên khung nhìn 1440x900
