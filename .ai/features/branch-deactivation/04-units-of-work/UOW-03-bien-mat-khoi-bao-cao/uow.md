---
id: UOW-03
slug: bien-mat-khoi-bao-cao
title: Cửa hàng đã ngừng biến mất khỏi bộ lọc và số liệu báo cáo, kể cả kỳ quá khứ
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-03]
verifies: [AC-13, AC-14, AC-15]
risk: medium
status: todo
rollback: revert 2 commit; chỉ là mệnh đề lọc trong truy vấn, không có dữ liệu nào bị đổi
---

# UOW-03 — Biến mất khỏi báo cáo

Người dùng đã chốt: **biến mất hoàn toàn, kể cả kỳ quá khứ** (A-02). Nghĩa là báo cáo doanh thu
toàn chuỗi của tháng trước sẽ nhỏ đi sau khi ngừng một cửa hàng. Đây là điều đã chọn, không
phải tác dụng phụ.

Phần lớn báo cáo tồn kho đã được UOW-02 phủ miễn phí: chúng kẹp theo `permittedBranchIds(actor)`
lấy từ JWT. Lát này chỉ còn ba resolver `stores()` chưa kẹp theo actor, mảng cột của
`stock-by-branch`, và dashboard cũ trong `ReportingService` — nơi quyền xem hợp nhất khiến
`resolveBranchScope` trả `null` = không lọc chi nhánh gì cả.

## Demo script

1. Ngừng hoạt động Hà Nội (Hà Nội có doanh thu và tồn kho ở tháng trước)
2. `curl` ba endpoint `filter-options` (`/reports/invoices`, `/reports/profit`,
   `/reports/inventory`, `type=store`) → không nguồn nào còn Hà Nội
3. Mở **Báo cáo → Tồn kho theo chi nhánh** trên backoffice → không còn cột Hà Nội
4. Mở **Tổng hợp tồn kho theo chi nhánh** với phạm vi "tất cả cửa hàng", kỳ **tháng trước** →
   số của Hà Nội không được cộng vào tổng
5. Mở dashboard doanh thu bằng tài khoản có quyền xem hợp nhất, kỳ tháng trước → tổng đã trừ Hà Nội
6. Mở lại hoạt động Hà Nội → mọi số liệu quay về như cũ

## In scope

- Ba resolver `stores()`: invoice-report, profit-report, inventory-reports
- Mảng `branches[]` mà `stock-by-branch` trả về làm header cột
- `ReportingService`: 11 truy vấn raw SQL, theo ADR-06

## Not in scope

- `permittedBranchIds` / `resolveInventoryBranchIds` — UOW-02 đã phủ qua JWT; nếu sau khi chạy
  vẫn thấy cửa hàng đã ngừng ở đây thì giả thiết A-14 sai và phải mở lại G2

## Risks

| Risk | Mitigation |
|---|---|
| Đổi 11 truy vấn SQL dễ sai chỗ đánh số tham số | ADR-06: nối một mệnh đề hằng dùng lại `$1`, không thêm tham số mới |
| Kế toán đối chiếu số tháng trước thấy lệch mà không hiểu vì sao | Ghi vào release note; đây là hệ quả đã chốt của A-02 |

## Definition of done
- [ ] AC-13..AC-15 pass
- [ ] Không truy vấn nào bị đánh số lại tham số
- [ ] Demo được chấp nhận ở G4
