# Báo cáo test — 12 Phân quyền (RBAC)

---

## Thông tin phiên test

| Mục | Giá trị |
| --- | --- |
| **Test case** | TC-12 — Phân quyền (RBAC) |
| **Người test** | LocTran |
| **Ngày test** | 2026-06-26 |
| **Ứng dụng** | Backoffice Web + POS Web |
| **Môi trường** | `http://localhost:3000` + `http://localhost:3001` / API `:4000` |
| **Tài khoản** | Tất cả 4 roles |

**Trạng thái phiên:** 🔴 Có bug — FE thiếu permission guard, branch validation ERP, branch manager scope

---

## 1. Tóm tắt

### Thống kê

| | 🔴 Critical | 🟠 Major | 🟡 Minor | 💡 UX |
| --- | ---: | ---: | ---: | ---: |
| **Bug** | 0 | 3 | 0 | — |
| **UX** | — | 0 | 0 | 1 |

### Danh sách issue

| ID | Loại | Mức độ | Màn hình | TC ref | Tiêu đề | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | Bug | 🟠 Major | Backoffice (toàn bộ) | TC-12-003 | Nhân viên vào được Backoffice ERP và thao tác CRUD nhiều chức năng — FE thiếu permission guard | 🆕 Mới |
| BUG-002 | Bug | 🟠 Major | Backoffice (login/routing) | TC-12-006 | User không có chi nhánh vẫn vào được Backoffice ERP (POS đã chặn đúng, ERP chưa) | 🆕 Mới |
| BUG-003 | Bug | 🟠 Major | Backoffice › Phân quyền | TC-12-EF-002 | Quản lý chi nhánh không thao tác được trên user của chi nhánh mình — thiếu scope hoặc permission | 🆕 Mới |
| UX-001 | UX | 💡 Gợi ý | Backoffice (header) | Chung | "Quản lý tổng" không có branch selector kế bên avatar — không rõ đang xem chi nhánh nào *(đã ghi nhận ở TC-11)* | 🆕 Mới |

---

## 2. Chi tiết issue

### 📍 Backoffice › Chung

#### BUG-001 — Nhân viên truy cập và CRUD nhiều chức năng không được phép

| KQHT | KQMM |
| --- | --- |
| Nhân viên vào được Backoffice, CRUD được: Hàng hóa, Cửa hàng, Đơn vị tính, Nhóm hàng hóa, Nhà cung cấp, Chuyển kho, Lệnh điều chuyển, Phiếu kiểm kê, Kiểm kê kho, Đánh số chứng từ, Quỹ tiền (tạo phiếu thu/chi) | Menu Backoffice ẩn các chức năng ngoài phạm vi; nút Tạo/Sửa/Xóa ẩn hoặc disabled |

**Kỹ thuật:** BE trả về 403 đúng cho hầu hết các thao tác nhưng FE không có permission-based route guard và không ẩn menu item / action button dựa trên quyền của user. Cần implement guard theo `STAFF_PERMISSION_KEYS` ở FE: ẩn sidebar items, ẩn nút Tạo/Sửa/Xóa.

**Phạm vi ảnh hưởng:** Toàn bộ Backoffice sidebar — mọi page đều có thể navigate tới mà không bị chặn ở FE.

---

#### BUG-002 — User không có chi nhánh vào được Backoffice ERP

| KQHT | KQMM |
| --- | --- |
| User không có chi nhánh đăng nhập được Backoffice, vào màn hình bình thường | Blocked ngay sau login — yêu cầu chọn chi nhánh hoặc redirect về màn hình thông báo "Chưa được gán chi nhánh" |

POS Web đã xử lý đúng: `BranchSelectPage` chặn khi không có chi nhánh trong JWT. Backoffice chưa có guard tương đương.

---

### 📍 Backoffice › Phân quyền

#### BUG-003 — Quản lý chi nhánh không quản lý được user của chi nhánh mình

| KQHT | KQMM |
| --- | --- |
| `mgr-hcm@test.com` không thể gán role, gán chi nhánh, hay chỉnh sửa user thuộc Chi nhánh HCM | Quản lý chi nhánh có thể quản lý user trong phạm vi chi nhánh mình (gán role, gán chi nhánh, đặt lại mật khẩu) |

`BRANCH_MANAGER_PERMISSION_KEYS` đã có `iam.user.read`, `iam.user.roles.write`, `iam.user.branches.write`. Cần kiểm tra xem API user management có scope theo `branchId` không hay đang require `iam.user.write` để render UI.

---

## 3. Kết quả chạy TC-12

| TC | Tên | Kết quả | Ghi chú |
| --- | --- | --- | --- |
| TC-12-001 | Quản lý tổng xem báo cáo toàn hệ thống | ✅ Pass | |
| TC-12-002 | Quản lý chi nhánh A chỉ xem dữ liệu chi nhánh A | ✅ Pass | |
| TC-12-003 | Nhân viên không vào được quản lý kho, báo cáo | ❌ NG | BUG-001: FE thiếu guard |
| TC-12-004 | Nhân viên thực hiện được thao tác trong phạm vi | ✅ Pass | |
| TC-12-005 | ~~Nhân viên không mở/đóng ca~~ | 🚫 N/A | Chưa có UI mở/đóng ca POS |
| TC-12-006 | User chưa gán chi nhánh bị chặn | ⚠️ Một phần | POS ✅; Backoffice ERP ❌ BUG-002 |
| TC-12-EF-001 | Nhân viên cố tạo user mới | ✅ Pass | 403 đúng |
| TC-12-EF-002 | Quản lý chi nhánh cố gán user vào chi nhánh B | ❌ NG | BUG-003: không thao tác được cả chi nhánh mình |
| TC-12-EF-003 | Token hết hạn — auto refresh | ✅ Pass | |

---

## Sign-off

| Người test | Ngày | Kết quả |
| --- | --- | --- |
| LocTran | 2026-06-26 | 🔴 5/8 active TC pass (1 một phần), 3 NG — 3 bug major, 1 UX |
