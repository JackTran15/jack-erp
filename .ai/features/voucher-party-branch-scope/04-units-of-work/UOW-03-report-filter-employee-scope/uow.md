---
id: UOW-03
slug: report-filter-employee-scope
title: Bộ lọc Thu ngân / NVBH trên báo cáo chỉ liệt kê nhân viên cùng chi nhánh
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-03]
verifies: [AC-08, AC-09]
risk: medium
status: todo
rollback: revert 1 commit
---

# UOW-03 — Bộ lọc Thu ngân / NVBH chỉ liệt kê nhân viên cùng chi nhánh

## Demo script

1. Đăng nhập backoffice bằng tài khoản **không** có `iam.user.read.all`, chi nhánh **Hà Nội**
2. Vào **Báo cáo → Bán hàng**, mở bộ lọc, chọn trường **Thu ngân**: không còn `Nhân viên HCM`
3. Chọn trường **Nhân viên bán hàng**: cũng không còn hồ sơ NVBH của `Nhân viên HCM`
4. Mở các trường lọc khác trong cùng dropdown — **Cửa hàng**, **Khách hàng**, **Nhóm hàng**,
   **Thương hiệu**, **Đơn vị tính**: tất cả trả về y như trước khi sửa
5. Sang POS → **Báo cáo cuối ngày** → panel **Bàn giao ca**: dropdown nhân viên cũng đã hẹp
   lại theo chi nhánh (A-09 — đây là mong muốn, không phải hồi quy)

## In scope

- `GetReportFilterOptionsHandler.cashiers()` — hiện dùng `find()` với `FindOptionsWhere`,
  không nhận được vị ngữ raw; chuyển sang QueryBuilder
- `GetReportFilterOptionsHandler.salespeople()` — đã là QueryBuilder có join `UserEntity` alias `u`,
  chỉ thêm vị ngữ khoá trên `u.id`

## Not in scope

- Các nhánh `type` còn lại của cùng handler (`store`, `customer`, `product_group`, `brand`,
  `unit`, và nhóm enum) — không liệt kê nhân viên

## Risks

| Risk | Mitigation |
|---|---|
| Chuyển `cashiers()` từ `find()` sang QueryBuilder làm đổi thứ tự sắp xếp hoặc nhãn | Giữ nguyên `order`, `skip`, `take` và toàn bộ đoạn ghép nhãn `"{code} - {name}"`; test so nhãn từng dòng, không chỉ đếm |
| `salespeople()` khoá nhầm trên `e.id` (employee_profiles) thay vì `u.id` (users) | `user_branch_assignments.user_id` trỏ tới `users.id`; ghi rõ trong ticket và test bằng một NVBH chi nhánh khác |

## Definition of done

- [ ] AC-08, AC-09 pass
- [ ] Các `type` không liên quan có test hồi quy chứng minh không đổi
- [ ] `pnpm --filter @erp/api test` xanh
- [ ] Demoed và accepted ở gate G4
