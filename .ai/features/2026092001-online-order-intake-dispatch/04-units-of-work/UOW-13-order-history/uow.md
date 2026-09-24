---
id: UOW-13
slug: order-history
title: Xem lịch sử điều phối của một đơn trong modal
demoable: true
duration: 2d
depends_on: [UOW-11, UOW-12]
requirements: [US-12]
verifies: [AC-49, AC-50, AC-51, AC-52, AC-53, AC-54]
risk: low
status: todo
rollback: revert service/route/modal; chỉ ĐỌC, không migration, không dữ liệu nào cần dọn
---

# UOW-13 — Lịch sử đơn

## Demo script
1. Một đơn web đi đủ vòng: nhận → phân Cà Mau → Cà Mau duyệt → Cà Mau trả về ("hết hàng") → phân Main Branch → Main duyệt → thu ngân Main xử lý
2. `/orders/all`: chưa chọn dòng → nút "Lịch sử" khoá; click dòng đơn đó → bấm "Lịch sử" → modal 7 mốc đúng thứ tự, mỗi mốc: giờ vi-VN, loại, người, chi nhánh, lý do, trạng thái sau (AC-49, AC-50)
3. Cùng thao tác trên `/orders/dispatch` (một đơn bị trả về) và `/orders` của Main Branch (AC-49)
4. Một đơn bị huỷ có lý do → mốc cuối "Huỷ đơn" + lý do; một đơn cũ đã xử lý → có mốc nhận + xử lý (AC-51)
5. Gọi `GET /mobile/sales-orders/:id/history` bằng người dùng Cần Thơ cho đơn của Main → 403 (AC-52)

## In scope
- `SalesOrderHistoryService`, hai route GET history, response DTO (ADR-14)
- `OrderHistoryModal` + nút "Lịch sử" trên ba màn

## Not in scope
- Ghi thêm loại sự kiện mới (A-51)
- Lịch sử sửa đơn / đổi phí

## Risks
| Risk | Mitigation |
| --- | --- |
| Hai mốc cùng giây (vd phân và duyệt trong cùng transaction test) đảo thứ tự | Khoá phụ theo thứ tự vòng đời khi `at` bằng nhau; unit test |
| Chi nhánh xem đơn chi nhánh khác | Route chi nhánh lọc `branch_id = actor.branchId`; e2e 403 |

## Definition of done
- [x] AC-49..AC-54 có bằng chứng trong `07-verification.md`
- [x] `pnpm --filter @erp/api test` + e2e `sales-order-history` xanh
- [x] `pnpm --filter @erp/backoffice-web build` xanh
