---
id: UOW-03
slug: stock-summary-supplier-transfer-columns
title: Báo cáo "Tổng hợp nhập xuất tồn kho" lọc được Nhà cung cấp và 4 cột điều chuyển
demoable: true
duration: 2d
depends_on: [UOW-02]
requirements: [US-02]
verifies: [AC-02, AC-07, AC-08]
risk: high
status: todo
rollback: revert CTE pending-transfer trong `stock-period.service.ts`; `applyPendingTransfers` giữ nguyên trong repo cho tới khi test đối chiếu xanh, nên quay lại là một lượt revert
---

# UOW-03 — Báo cáo "Tổng hợp nhập xuất tồn kho" lọc được Nhà cung cấp và 4 cột điều chuyển

## Demo script

1. Mở "TỔNG HỢP NHẬP XUẤT TỒN KHO", bật cột "Nhà cung cấp"
2. Lọc cột đó chứa tên một nhà cung cấp → dòng giảm, và tổng số dòng KHÔNG lớn hơn khi bỏ lọc (join không nở)
3. Bật 4 cột "Tồn đang chuyển đi" / "Giá trị chuyển đi" / "Tồn đang về" / "Giá trị đang về"
4. Lọc "Tồn đang chuyển đi" lớn hơn 0 → chỉ còn dòng có phiếu chuyển chờ, footer khớp tổng cột
5. Đối chiếu một mặt hàng có nhiều lượt chuyển chờ với màn hình Chuyển kho → khớp quy tắc "chỉ tính lượt pending đầu tiên"

## In scope

- Spec `supplier` — join `item_providers` + `providers` với `is_primary = true` vào cả câu dữ liệu lẫn câu count (A-04 chứng minh không nở dòng)
- Bỏ `primarySuppliers()` (truy vấn JS sau khi phân trang) khỏi `stock-summary.report.ts`
- CTE pending-transfer bằng `DISTINCT ON`, tái lập đúng quy tắc khử trùng "chỉ lượt pending đầu tiên" mà `applyPendingTransfers` đang giữ
- 4 spec transferOutQty / transferOutValue / incomingQty / incomingValue

## Not in scope

- Sửa quy tắc khử trùng — đây là port nguyên nghĩa, không phải cơ hội sửa nghiệp vụ

## Risks

| Risk | Mitigation |
|---|---|
| Quy tắc "chỉ lượt pending đầu tiên" là một quirk có chủ ý; `buildRowKeysSql` sinh ra chính là để footer khớp cột. Viết lại bằng SQL rất dễ lệch | T-03-05 đối chiếu SQL với `applyPendingTransfers` trên cùng fixture, khẳng định bằng nhau — không tin mắt thường |
| Bỏ `applyPendingTransfers` khỏi đường v2 mà đường GET cũ vẫn dùng | Giữ nguyên hàm và đường GET; chỉ đường v2 chuyển sang CTE |

## Definition of done

- [x] AC-07 và AC-08 xanh
- [x] ~~Test đối chiếu SQL ↔ `applyPendingTransfers`~~ — thay bằng test khoá hành vi MỚI (ADR-07): phép đối chiếu vô nghĩa sau khi chốt sửa lỗi đếm thiếu
- [x] `total` không đổi khi bật cột Nhà cung cấp
- [x] `pnpm --filter @erp/api test` xanh
- [ ] Demo được nghiệm thu ở gate G4
