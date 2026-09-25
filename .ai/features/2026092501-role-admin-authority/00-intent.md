---
feature: 2026092501-role-admin-authority
date: 2026-09-25
---

# Intent — Quản trị hệ thống được sửa mọi vai trò dưới nó

Trên màn "Quản lý vai trò", quyền **sửa** một vai trò được chặn bằng cờ `isSystem`
của chính vai trò đó. Cờ ấy không nhìn người đang thao tác, nên nó chặn tất cả như
nhau — kể cả tài khoản Quản trị hệ thống, vốn nắm đủ 239/239 khóa quyền.

Yêu cầu của chủ sản phẩm (2026-09-25): *"tuy cùng permissions, nhưng Admin phải
được làm toàn quyền trên hệ thống"*.

Đổi trục quyết định: quyền sửa đọc từ tập quyền của **actor**, dùng lại đúng vị từ
`RbacService.getGrantableRoleIds` mà việc gán vai trò đang dùng — vai trò nào gán
được cho người khác thì sửa được. `isSystem` chỉ còn giữ vòng đời: cấm đổi tên, cấm
xóa.

Ba ràng buộc an toàn do chủ sản phẩm chọn, không được bỏ:
1. Không tự hạ quyền mình.
2. Không ghi vào vai trò một quyền mình không có.
3. Vẫn cấm xóa / đổi tên vai trò hệ thống.
