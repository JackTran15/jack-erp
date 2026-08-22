---
id: UOW-02
slug: cash-voucher-employee-scope
title: Phiếu thu/chi (tiền mặt và tiền gửi) chỉ liệt kê nhân viên cùng chi nhánh
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-05, AC-06, AC-07]
risk: high
status: todo
rollback: revert 2 commit; ticket đầu là refactor thuần, revert được độc lập
---

# UOW-02 — Phiếu thu/chi chỉ liệt kê nhân viên cùng chi nhánh

Rủi ro **high** không nằm ở phần lọc mà ở cách `partner-lookup.service.ts` đánh số bind
parameter: thêm một tham số vào một fragment của UNION sẽ làm hỏng hai loại đối tượng còn
lại nếu không dựng fragment và params cùng chỗ (ADR-03).

## Demo script

1. Đăng nhập backoffice bằng tài khoản **không** có `iam.user.read.all`, chi nhánh **Hà Nội**
2. Vào **Quỹ tiền mặt → Phiếu chi** → **Thêm mới**
3. Bấm ô **Đối tượng** → chọn loại **Nhân viên**: không còn `Nhân viên HCM`
4. Bấm ô **Nhân viên chi** (ô riêng, khoá cứng loại Nhân viên): cũng không còn `Nhân viên HCM`
5. Đổi loại đối tượng về **Khách hàng**, rồi **Nhà cung cấp**: cả hai vẫn liệt kê bình
   thường — đây là bước bắt lỗi bind parameter, đừng bỏ
6. Sang **Tất cả loại**: bấm tới trang cuối, không có trang rỗng
7. Lặp bước 2–6 trên **Phiếu thu**, **Phiếu thu tiền gửi**, **Phiếu chi tiền gửi**

## In scope

- Refactor `selectFragments()` → trả `{ body, params }` để fragment và mảng tham số luôn
  khớp nhau (ADR-03)
- Áp vị ngữ chi nhánh vào `EMPLOYEE_SELECT`, cả `countSql` lẫn `pageSql`

## Not in scope

- `customerDebts` / `supplierDebts` / `customersWithDebt` / `suppliersWithDebt` trên cùng
  controller — không liệt kê nhân viên

## Risks

| Risk | Mitigation |
|---|---|
| `bind message supplies N parameters, but prepared statement requires M` khi `type=customer` | T-02-01 làm riêng phần này trước và có test cho từng giá trị `type`, kể cả loại không có nhân viên |
| Kéo `UsersService`/entity của rbac vào module cash-vouchers, phá lý do tồn tại của raw SQL ở đây | Chỉ inject `EmployeeBranchScopeService` (trả dữ liệu thuần + chuỗi SQL), không import entity class nào |
| `$3::uuid` thiếu cast → `operator does not exist: uuid = text` | Ghi rõ trong T-02-02; bảng `user_branch_assignments` toàn cột uuid (A-12) |

## Definition of done

- [ ] AC-05, AC-06, AC-07 pass
- [ ] Cả 4 giá trị `type` (`customer`, `supplier`, `employee`, `all`) đều có test và đều xanh
- [ ] `pnpm --filter @erp/api test` xanh
- [ ] Không đổi hợp đồng HTTP
- [ ] Demoed và accepted ở gate G4
