---
id: UOW-01
slug: counterparty-employee-scope
title: Ô Đối tượng trên phiếu nhập/xuất/chuyển kho chỉ liệt kê nhân viên cùng chi nhánh
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-12]
risk: medium
status: todo
rollback: revert 2 commit; không có migration, không có cột mới, không có cờ tính năng cần tắt
---

# UOW-01 — Ô Đối tượng trên phiếu nhập/xuất/chuyển kho chỉ liệt kê nhân viên cùng chi nhánh

Lát cắt này mang theo **quy tắc phạm vi dùng chung** (`EmployeeBranchScopeService`) vì
không có nó thì không demo được gì; UOW-02 và UOW-03 sau đó chỉ việc gọi lại.

## Demo script

1. Đăng nhập backoffice bằng tài khoản **không** có `iam.user.read.all`, chọn chi nhánh **Hà Nội**
2. Vào **Nhập kho** → mở một phiếu mới → bấm ô **Đối tượng**
3. Chọn loại **Nhân viên** trong dropdown "Loại đối tượng": danh sách còn `Nhân viên HN`
   và `Nhân viên HN (staff-03)`, **không** còn `Nhân viên HCM`
4. Gõ `HCM` vào ô tìm kiếm: kết quả rỗng (không phải "tìm thấy rồi lọc mất", mà là 0 dòng
   với `total = 0`)
5. Đổi loại về **Tất cả**: nhà cung cấp và khách hàng vẫn đầy đủ như trước; chỉ phần nhân
   viên hẹp lại
6. Lặp bước 2–5 trên **Xuất kho** và **Chuyển kho** — cùng một endpoint nên cùng kết quả
7. Chuyển sang chi nhánh **Hồ Chí Minh** (BranchSelector → reload): giờ thấy `Nhân viên HCM`,
   không thấy `Nhân viên HN`

## In scope

- `EmployeeBranchScopeService` trong `modules/rbac/`: giải `ActorContext` → `EmployeeScope`
  (`all` | `branch` | `none`) và hai hàm thuần dựng văn bản vị ngữ SQL
- Áp vị ngữ vào `SearchCounterpartiesHandler.searchEmployees()`, cả câu lấy dòng lẫn câu đếm

## Not in scope

- Phiếu thu/chi (UOW-02), bộ lọc báo cáo (UOW-03)
- Chặn 403 ở đường ghi — xem Out of scope trong `00-intent.md`

## Risks

| Risk | Mitigation |
|---|---|
| `total` đếm trên tập chưa lọc → trang cuối rỗng | AC-03 khoá lại; `searchEmployees()` dùng chung `baseWhere()` cho cả rows và count nên chỉ cần sửa một chỗ, và test phải kiểm đúng `total` chứ không chỉ `data.length` |
| Nhánh `types` nhiều loại lấy `cap = page * pageSize` từ mỗi nguồn rồi trộn — lọc làm lệch phép trộn | AC-03 kiểm cả `type=all`; giữ nguyên thuật toán trộn, chỉ đổi tập nguồn |
| Vị ngữ là chuỗi SQL, không được type-check (ADR-02) | Unit test cho hàm dựng chuỗi + test tích hợp trên DB thật ở UOW-04 |

## Definition of done

- [ ] AC-01, AC-02, AC-03, AC-04 pass
- [ ] AC-12 (fail-closed) pass ở mức unit cho `EmployeeBranchScopeService`
- [ ] `pnpm --filter @erp/api test` xanh
- [ ] Không đổi hợp đồng HTTP: `openapi.snapshot.json` không đổi dòng nào
- [ ] Source backend tiếng Anh (comment, log, message)
- [ ] Demoed và accepted ở gate G4
