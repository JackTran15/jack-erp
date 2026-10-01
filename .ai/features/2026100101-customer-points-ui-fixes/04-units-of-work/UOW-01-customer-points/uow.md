---
id: UOW-01
slug: customer-points
title: Điểm thành viên — xem mã thẻ, đặt lại số dư, lịch sử điểm có phân quyền
demoable: true
duration: 2d
depends_on: []
requirements: [US-01, US-02]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14]
risk: medium
status: todo
rollback: revert T-01-01..T-01-06; `pnpm migration:revert` gỡ quyền khỏi vai trò (khoá trong bảng permissions giữ lại, vô hại)
---

# UOW-01 — Điểm thành viên

## Demo script
1. Đăng nhập admin. Mở *Khách hàng* → một khách có thẻ → trang chi tiết: khối *Thẻ thành viên* hiện Mã thẻ, Hạng, Điểm (vd 120)
2. Bấm **Sửa** → form sửa cũng hiện khối *Thẻ thành viên* (mã thẻ chỉ đọc)
3. Bấm **Điều chỉnh điểm** → nhập 200, lý do "Bù điểm" → Lưu → toast, khối hiện 200 ngay
4. Tab **Lịch sử điểm**: dòng đầu là *Điều chỉnh* +80, ghi chú "Bù điểm", người thực hiện = admin
5. Điều chỉnh lại về 200 (không đổi) → không có dòng mới
6. Đăng nhập *Nhân viên bán hàng* (chỉ `customer.read/write`) → không có nút, không có tab
7. *Quản lý vai trò* → vai trò *Quản lý chi nhánh* → thấy hai quyền mới có nhãn tiếng Việt, đã tick

## In scope
- 2 khoá quyền + nhãn + seed vai trò + migration cấp quyền
- `PUT /customers/:id/membership-card/points`, `GET /customers/:id/point-history`
- `MembershipCardPanel`, `AdjustPointsDialog`, `PointHistoryTab`; nhánh `customers` trong `CrudEditPage`

## Not in scope
- Sửa mã thẻ (A-03); siết quyền endpoint cũ theo `cardId` (A-07); cột số dư sau (A-17)

## Risks
| Risk | Mitigation |
| --- | --- |
| `created_by` lưu dạng text, join `users.id` lệch kiểu | T-01-03 kiểm kiểu cột thật trước khi viết join |
| Migration cấp quyền rộng hơn ý muốn | AC-13 e2e khẳng định vai trò chỉ có `customer.read/write` không được cấp |
| Vai trò tuỳ biến của client không giữ `customer.merge` | Ghi trong PR: admin tự tick hai quyền mới ở *Quản lý vai trò* |

## Definition of done
- [x] AC-02..AC-08, AC-10, AC-11, AC-13 xanh trong e2e (3 file spec mới: 11/11, 4/4, 3/3)
- [x] AC-14 xanh trong `org-role-permissions.spec.ts` (3 test mới)
- [x] AC-01, AC-06, AC-07, AC-09, AC-12 có ảnh trong `07-verification.md` — AC-06/AC-07/AC-12 (phần *không có quyền*) là **mô phỏng**, xem mục Trước merge
- [ ] `pnpm openapi:generate` đã chạy, snapshot + schema commit
- [x] `pnpm --filter @erp/backoffice-web build` và `pnpm --filter @erp/api build` xanh

### Trước merge
- [ ] `openapi.snapshot.json` + `schema.ts` đã sinh lại nhưng **chưa commit** — agent không được commit (hook); người merge commit
- [ ] AC-06 / AC-12 với một tài khoản thật **không** giữ 2 khoá (vd NV bán hàng): không thấy nút *Điều chỉnh điểm*, không thấy tab — hiện chỉ mô phỏng bằng gỡ khoá khỏi session
- [ ] Chấp nhận AC-07 (UI) bằng mô phỏng: tạo khách tự cấp thẻ nên không có khách thật nào thiếu thẻ
- [ ] Quyết định 2 suite đỏ có sẵn trên `main` (không do feature này): `loyalty.e2e-spec.ts` (6 test, tạo khách tự cấp thẻ) và `org-role-permissions.spec.ts › withholds inventory.transfer.create from SALES and CASHIER` — T-01-01/T-01-02 đã đánh dấu box "vẫn xanh" kèm ghi chú, chờ duyệt
