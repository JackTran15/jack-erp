---
id: UOW-10
slug: per-order-branch
title: Chọn chi nhánh cho từng đơn trên lưới, Validate rồi Lưu
demoable: true
duration: 2d
depends_on: [UOW-09]
requirements: [US-11]
verifies: [AC-40, AC-41, AC-42, AC-43, AC-44, AC-45]
risk: low
status: todo
rollback: revert trang Điều phối + hook về dialog phân chung (UOW-02); không có thay đổi API hay DB
---

# UOW-10 — Chọn chi nhánh từng đơn (đợt 2, Task 3)

## Demo script
1. Fixture UOW-09, cộng: P (`SKU-500 × 2`), Q (`SKU-500 × 1`), R (`SKU-500 × 1`) trong pool
2. `/orders/dispatch`: mọi dòng có ô chọn chi nhánh; toolbar `[Validate] [Lưu] | [Nạp]`; không còn "Phân chi nhánh"
3. Chọn CN-A ở đầu cột → P, Q, R đều CN-A; đổi Q thành CN-B; xoá chọn của R
4. "Validate" → dialog: Q trước, P sau, R không có; dòng SKU-500 của P vàng "thiếu 1 tại CN-A"
5. "Lưu" → P về CN-A, Q về CN-B, R còn trong pool; lịch sử có 2 dòng `DISPATCH`
6. Chọn chi nhánh cho 2 đơn, huỷ một đơn ở tab khác, "Lưu" → đơn kia phân được, dòng bị huỷ báo lỗi tại chỗ và giữ chi nhánh đã chọn

## In scope
- Cột chi nhánh inline + ô chọn ở đầu cột (A-37)
- `ValidateDispatchDialog` gọi `stock-check` với `branchId` của từng đơn (A-39)
- `useDispatchSalesOrders` nhận `{ orderId, branchId }[]` (ADR-11); xoá `DispatchBranchDialog`

## Not in scope
- API ghi mới — dùng lại `POST /admin/sales-orders/:id/dispatch` (ADR-11)
- Gợi ý chi nhánh tự động theo tồn

## Risks
| Risk | Mitigation |
| --- | --- |
| `OrdersPageTable` dùng chung với `/orders` — thêm cột chọn chi nhánh làm lộ ô chọn ở lưới chi nhánh | Cột chọn truyền vào qua prop chỉ trang Điều phối cấp; `/orders` không truyền. Ảnh chụp `/orders` sau khi làm |
| Lựa chọn chi nhánh mất khi react-query refetch sau khi Lưu một phần | State là `Record<orderId, branchId>` của trang, không suy từ `rows`; chỉ xoá key của đơn đã phân thành công |

> **2026-09-24 (lần 2):** AC-40/AC-41 đổi — mọi đơn trong pool chọn được chi nhánh, không cần duyệt (A-41). Hai ô dưới bỏ tick cho tới khi chụp lại sau T-11-04.

> **2026-09-24 (lần 3):** Akenzy bỏ cột chọn chi nhánh trên lưới (A-48, ADR-13); UOW-12 làm lại bằng dialog. Ba ô dưới bỏ tick tới khi có bằng chứng của UOW-12.

## Definition of done
- [x] AC-40..AC-45 có bằng chứng trong `07-verification.md`
- [x] `/orders` của chi nhánh không có cột chọn chi nhánh (ảnh chụp)
- [x] Ảnh chụp (từ T-10-01): chọn ở đầu cột điền 3 dòng; đổi riêng một dòng giữ hai dòng kia
- [x] Ảnh chụp (từ T-10-02) AC-43 (Q trước P, R vắng, P vàng) và AC-45 (lỗi tại dòng, giữ chi nhánh)
- [x] Adminer (từ T-10-02) sau Lưu: P → CN-A, Q → CN-B, R NULL (AC-42, AC-44)
- [x] `pnpm --filter @erp/backoffice-web build` xanh
