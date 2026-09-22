---
id: UOW-02
slug: admin-dispatch
title: Admin thấy pool đơn chưa phân và phân tay về chi nhánh
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-09, AC-10, AC-11, AC-12, AC-13]
risk: medium
status: todo
rollback: revert controller + migration bảng sự kiện; đơn đã phân giữ nguyên branch_id (dữ liệu hợp lệ với đường mobile cũ), chỉ mất lịch sử điều phối
---

# UOW-02 — Admin phân đơn về chi nhánh

## Demo script
1. Tạo 3 đơn web qua API key (UOW-01), để nguyên trong pool
2. Đăng nhập backoffice bằng tài khoản có `pos.sales-order.dispatch` → `/orders/dispatch` → lưới hiện đúng 3 đơn
3. **Đóng mọi ca POS của chi nhánh Hồ Chí Minh** (chứng minh điều phối không cần ca mở)
4. Chọn đơn #1 → phân cho Hồ Chí Minh → thành công, không lỗi `NO_OPEN_SESSION`, đơn biến khỏi lưới Điều phối
5. Adminer: `sales_orders.branch_id` = Hồ Chí Minh, `status` vẫn `SENT`, **không** có hoá đơn nháp nào sinh ra
6. Đăng nhập POS Hồ Chí Minh → lưới đơn hàng thấy đơn #1; đăng nhập chi nhánh kiểm thử → không thấy
7. `sales_order_dispatch_events`: 1 dòng `DISPATCH`, đúng người, đúng thời điểm
8. Đăng nhập bằng tài khoản thu ngân (không có quyền điều phối) → `/orders/dispatch` không vào được; gọi thẳng API → 403

## In scope
- `sales_order_dispatch_events` (A-06)
- `AdminSalesOrderController` org-scoped, KHÔNG `BranchScopeGuard` (ADR-07)
- Hai quyền mới: `pos.sales-order.dispatch`, `pos.sales-order.read-all`
- Màn `/orders/dispatch` dùng lại lưới `/orders` có sẵn

## Not in scope
- Màn Tất cả đơn (UOW-03)
- Trả đơn về pool (UOW-06) — bảng sự kiện đã sẵn `action = RETURN` nhưng chưa có đường gọi
- Gợi ý chi nhánh theo tồn / khoảng cách: Akenzy chốt phân **thủ công**

## Risks
| Risk | Mitigation |
| --- | --- |
| Controller mới không `BranchScopeGuard` trở thành lỗ nhìn xuyên chi nhánh cho người không được phép | Mọi route đều `@RequirePermission`; demo bước 8 là ca kiểm âm bắt buộc, không phải tuỳ chọn |
| Phân đơn hai lần cùng lúc cho hai chi nhánh khác nhau | Cập nhật có điều kiện `WHERE branch_id IS NULL`; 0 dòng bị ảnh hưởng → 409 `ORDER_ALREADY_DISPATCHED` |
| Lưới `/orders` đang là mock, dựng `/orders/dispatch` trên nền mock rồi quên nối thật | Ticket T-02-03 nối API thật cho **chính màn dispatch**; `/orders` của chi nhánh vẫn mock tới UOW-05 |

## Definition of done
- [x] AC-09..AC-13 có bằng chứng trong `07-verification.md`, gồm cả ca 403
- [x] `/mobile/sales-orders` không đổi một dòng nào (ADR-07)
- [x] `pnpm --filter @erp/api test` xanh
