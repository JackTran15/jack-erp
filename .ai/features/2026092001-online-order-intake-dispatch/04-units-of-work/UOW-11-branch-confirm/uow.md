---
id: UOW-11
slug: branch-confirm
title: Duyệt đơn chuyển sang chi nhánh — điều phối chỉ phân, chi nhánh duyệt, thu ngân xử lý đơn đã duyệt
demoable: true
duration: 2d
depends_on: [UOW-09, UOW-10]
requirements: [US-09, US-11]
verifies: [AC-30, AC-31, AC-32, AC-33, AC-34, AC-35, AC-46, AC-47, AC-48]
risk: medium
status: todo
rollback: revert service/controller/trang; cột confirmed_at giữ nguyên (T-09-01). Không migration mới. Quay về hành vi UOW-09 (duyệt ở Điều phối) bằng revert commit của UOW này.
---

# UOW-11 — Duyệt ở chi nhánh (Akenzy đổi 2026-09-24, lần 2)

## Demo script
1. Pool có 3 đơn web mới, chưa ai duyệt. `/orders/dispatch`: không có nút "Duyệt đơn", không có Chờ duyệt / Đã duyệt; mọi dòng chọn được chi nhánh (AC-46, AC-40)
2. Chọn cả ba về Cà Mau → Lưu → thành công dù chưa duyệt; DB: `branch_id` = Cà Mau, `confirmed_at` NULL
3. Gọi thẳng `POST /mobile/sales-orders/:id/approve` (thu ngân Cà Mau, đang mở ca) cho đơn #1 → 409 `ORDER_NOT_CONFIRMED`, không có hoá đơn nháp (AC-34). `GET /mobile/sales-orders?awaitingCashier=true` không trả 3 đơn này (A-47)
4. Đăng nhập backoffice ở chi nhánh Cà Mau → `/orders`: ba đơn web mang "Chờ duyệt"; đơn tư vấn viên không có nhãn duyệt (AC-48)
5. Tick ba đơn → "Duyệt đơn" → dialog cảnh báo theo tồn **Cà Mau**, xếp đủ → thiếu (AC-31); "Huỷ" không đổi gì (AC-32); lần sau "Vẫn duyệt" → cả ba Đã duyệt (AC-30)
6. Thu ngân xử lý đơn #1 → thành công như trước (AC-34)
7. Người dùng Cần Thơ gọi confirm đơn #2 (của Cà Mau) → 403 (AC-35)
8. Cà Mau trả đơn #2 về pool → `confirmed_at` NULL; Admin phân lại cho Cần Thơ → Cần Thơ thấy "Chờ duyệt" (AC-47)

## In scope
- Dời guard `ORDER_NOT_CONFIRMED` từ `dispatch()` sang `approve()`; `confirm()` cho đơn đã ở chi nhánh; `returnToPool()` xoá duyệt; `awaitingCashier` loại đơn web chưa duyệt (ADR-12)
- `POST /mobile/sales-orders/:id/confirm`, `POST /mobile/sales-orders/stock-check`; gỡ `POST /admin/sales-orders/:id/confirm`
- Gỡ "Duyệt đơn" khỏi `/orders/dispatch`; thêm vào `/orders` chi nhánh

## Not in scope
- App mobile của thu ngân (repo khác) — không cần sửa nhờ bộ lọc server (A-47)
- Permission mới (A-46: dùng lại `pos.sales-order.approve`)

## Risks
| Risk | Mitigation |
| --- | --- |
| Guard mới trong `approve()` chặn nhầm đơn tư vấn viên | Chỉ áp khi `salesperson_id IS NULL`; unit test + e2e ca đơn mobile (AC-48) |
| e2e đợt T-09-04 đã sửa "duyệt trước khi phân" — nay sai | T-11-03 đổi lại fixture: phân → duyệt ở chi nhánh → thu ngân xử lý |
| Người chi nhánh khác duyệt hộ | `BranchScopeGuard` + `branch_id = actor.branchId` trong câu cập nhật; e2e 403 |

## Definition of done
- [x] AC-30..AC-35, AC-46..AC-48 có bằng chứng trong `07-verification.md`
- [x] `pnpm --filter @erp/api test` + e2e `admin-dispatch`, `online-order-*`, `partner-order`, `branch-confirm` xanh (OUTBOX_RELAY_DISABLED=1)
- [x] `pnpm --filter @erp/backoffice-web build` xanh
