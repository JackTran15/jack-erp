---
feature: employee-role-branch-scope
stories: 4
acceptance_criteria: 10
---

# Requirements — Phân quyền theo permission cho form "Thêm mới Nhân viên"

Quy ước: "người tạo" = tài khoản đang đăng nhập và mở form `Thêm mới Nhân viên`
(`/admin/employees` → **Thêm mới** → tab **Vai trò**).

Nguyên tắc xuyên suốt: mọi quyết định phân quyền đọc **permission key**, không đọc tên hay
thứ bậc vai trò. "Vai trò cao hơn tôi" được định nghĩa bằng phép hiệu tập permission:
một vai trò là *cao hơn* khi nó mang ít nhất một key mà người tạo không có.

## Story 1 — Người tạo chỉ thấy thứ mình được phép cấp

- **AC-01** — Tab **Vai trò** chỉ liệt kê những vai trò mà người tạo được phép gán, tức
  vai trò không chứa permission key nào người tạo thiếu (`RoleSummary.assignable`).
  Vai trò cao hơn bị **ẩn**, không phải làm mờ.
- **AC-02** — Mục **Chi nhánh được truy cập** chỉ liệt kê chi nhánh người tạo thuộc về,
  trừ khi họ có `iam.user.branches.write.all` thì thấy toàn bộ chi nhánh của tổ chức.
- **AC-03** — Quyền thấy-mọi-chi-nhánh đến từ **permission**, không từ số chi nhánh được
  gán: một tài khoản chỉ thuộc 1 chi nhánh nhưng có `iam.user.branches.write.all` vẫn
  thấy đủ danh sách.

## Story 2 — Server chặn thật, không chỉ ẩn trên UI

- **AC-04** — `POST /admin/users` và `POST /admin/users/:id/branches` từ chối chi nhánh
  ngoài phạm vi người tạo bằng 403, kể cả khi gọi thẳng API không qua UI.
- **AC-05** — Cờ `assignable` trên `GET /admin/roles` dùng đúng phép so sánh mà đường ghi
  áp dụng, nên UI không bao giờ mời một vai trò mà API sẽ trả 403.

## Story 3 — Tài khoản cấp cao hơn hiện ra nhưng chỉ để đọc

Người tạo vẫn **thấy** tài khoản cấp cao hơn trong danh sách (cố ý: giấu hẳn thì họ không
hiểu vì sao mã nhân viên đã tồn tại), nhưng mọi đường ghi phải bị chặn từ UI.

- **AC-06** — Chọn một tài khoản cấp cao hơn: màn hình không báo lỗi, panel chi tiết vẫn mở
  bình thường; **Sửa** và **Ngừng HĐ** bị vô hiệu hóa thay vì để bấm rồi nhận 403.
- **AC-07** — Chọn một tài khoản ngang hoặc thấp hơn: **Sửa** bật lại. Nếu thiếu vế này thì
  AC-06 vô nghĩa — một nút luôn xám cũng thỏa mãn nó.
- **AC-08** — Mọi hành động ghi khác xuất phát từ dòng đó cũng phải bị khóa, **kể cả Nhân
  bản**: bản sao mang theo `roleIds` của tài khoản gốc, mà tab Vai trò lại ẩn đúng những vai
  trò đó, nên người dùng không thể bỏ tick thứ khiến server trả 403.

## Story 4 — Màn "Quản lý vai trò" tuân đúng luật đó

Trang này gác bằng `iam.role.read`, mà Quản lý chi nhánh có key đó chỉ để form nhân viên liệt
kê được vai trò. Họ vào được trang, và nút gỡ người dùng lại chỉ gác bằng `iam.user.roles.write`
org-wide — không nhìn `canEdit` của từng dòng như trang Nhân viên vẫn làm.

- **AC-09** — Trong "Danh sách người dùng" của một vai trò, nút gỡ bị khóa trên dòng mà người
  dùng hiện tại không quản lý được (`canEdit === false`), kèm tooltip nói rõ lý do. Ô tick
  trong hộp "Chọn người dùng" cũng vậy — bỏ tick ở đó đi đúng một đường API với nút gỡ.
- **AC-10** — Trên dòng ngang hoặc thấp hơn, nút gỡ vẫn bật. Thiếu vế này thì AC-09 vô nghĩa.

## Not verified here

AC-04 và AC-05 là hợp đồng API, không có bề mặt UI để chụp — được phủ bởi
`apps/api/test/e2e/user-branch-scope.e2e-spec.ts` (5 case) và các unit test trong
`users.service.spec.ts` / `roles.service.spec.ts`.
