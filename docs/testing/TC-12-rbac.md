# TC-12 — Journey: Phân quyền (RBAC)

## Phạm vi

Kiểm tra ràng buộc phân quyền theo 4 cấp bậc: Quản trị hệ thống, Quản lý tổng, Quản lý chi nhánh, Nhân viên. Đặc biệt kiểm tra cách ly dữ liệu giữa các chi nhánh.

**Môi trường:** Backoffice Web + POS Web  
**Điều kiện chung:** Đủ 5 users theo TC-00; đã có dữ liệu từ TC-02 → TC-10 để quan sát

---

### TC-12-001: Quản lý tổng xem được báo cáo tổng hợp toàn hệ thống

> **Mục tiêu:** Xác nhận Quản lý tổng có quyền xem báo cáo consolidated từ tất cả chi nhánh

**Người thực hiện:** Quản lý tổng (`gm@test.com`)

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Đăng nhập `gm@test.com` | Đăng nhập thành công |
| 2 | Vào Báo cáo → **Tổng hợp nhập xuất tồn theo cửa hàng** | Báo cáo tải, hiện cả 2 chi nhánh HCM và HN |
| 3 | Vào Dashboard | Thấy chỉ số tổng hợp toàn công ty |
| 4 | Vào **Kho hàng** → xem phiếu nhập kho | Thấy phiếu của cả HCM và HN |
| 5 | Chuyển sang xem từng chi nhánh | Có thể lọc theo từng chi nhánh cụ thể |

---

### TC-12-002: Quản lý chi nhánh A chỉ xem được dữ liệu chi nhánh A

> **Mục tiêu:** Xác nhận Quản lý chi nhánh HCM không nhìn thấy dữ liệu của Chi nhánh HN

**Người thực hiện:** Quản lý chi nhánh HCM (`mgr-hcm@test.com`)

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Đăng nhập `mgr-hcm@test.com`, chọn Chi nhánh HCM | Vào được giao diện |
| 2 | Vào **Kho hàng → Nhập kho** | Chỉ thấy phiếu nhập kho của Chi nhánh HCM |
| 3 | Vào **Báo cáo → Tổng hợp tồn kho** | Chỉ thấy số liệu Chi nhánh HCM |
| 4 | Kiểm tra dropdown chi nhánh | Chỉ có Chi nhánh HCM; không thể chọn Chi nhánh HN |
| 5 | Vào **Báo cáo → Tổng hợp theo cửa hàng** | Chỉ thấy cột Chi nhánh HCM; không có Chi nhánh HN |

**Kiểm tra thêm:**
- [ ] Gọi API trực tiếp với `X-Branch-Id` của HN → server trả về 403 Forbidden

---

### TC-12-003: Nhân viên không vào được trang quản lý kho và báo cáo

> **Mục tiêu:** Xác nhận Nhân viên không có quyền truy cập chức năng quản lý (nhập kho, báo cáo, phân quyền...)

**Người thực hiện:** Nhân viên (`staff-hcm@test.com`)

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Đăng nhập `staff-hcm@test.com` vào **Backoffice** | Đăng nhập thành công nhưng menu bị hạn chế |
| 2 | Thử vào **Kho hàng → Nhập kho → Tạo phiếu** | Bị từ chối (403) hoặc không thấy nút Tạo phiếu |
| 3 | Thử vào **Báo cáo** | Menu báo cáo ẩn hoặc hiển thị lỗi không có quyền |
| 4 | Thử vào **Phân quyền → Người dùng** | Bị từ chối; không thấy menu |
| 5 | Thử vào **Kho hàng → Xuất kho → Tạo** | Bị từ chối |

---

### TC-12-004: Nhân viên thực hiện được các thao tác thuộc phạm vi quyền

> **Mục tiêu:** Xác nhận Nhân viên có thể làm các thao tác được phép: POS bán hàng, chuyển kho tạm, xem tồn kho

**Người thực hiện:** Nhân viên (`staff-hcm@test.com`)

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Đăng nhập `staff-hcm@test.com` vào **POS Web** | Đăng nhập thành công, màn hình bán hàng hiển thị |
| 2 | Tạo hóa đơn bán hàng, checkout thành công | Hóa đơn PAID được tạo |
| 3 | Vào menu **Chuyển kho tạm** trong POS | Giao diện kho tạm mở được |
| 4 | Thêm dòng chuyển kho tạm | Thêm được |
| 5 | Vào Backoffice → **Kho hàng → Tồn kho** (xem) | Thấy được tồn kho (read-only) |
| 6 | Vào **Kho hàng → Lệnh điều chuyển** → xem danh sách | Thấy được danh sách lệnh (quyền read) |

---

### TC-12-005: Nhân viên không mở/đóng ca POS được

> **Mục tiêu:** Xác nhận mở/đóng ca yêu cầu quyền `pos.session.manage` mà Nhân viên không có

**Điều kiện:** Không có ca nào đang mở; hoặc đang có ca để test đóng

**Lưu ý:** Cần xác nhận với developer rằng Nhân viên có/không có `pos.session.manage`. Theo seed hiện tại, Nhân viên CÓ quyền này — nếu cần tách, cần điều chỉnh role.

**Người thực hiện:** Nhân viên (`staff-hcm@test.com`)

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Đăng nhập `staff-hcm@test.com` POS | |
| 2 | Thử mở ca | Tùy theo cấu hình quyền → được phép hoặc bị từ chối |
| 3 | Ghi nhận kết quả thực tế | So sánh với thiết kế phân quyền đã chốt |

> **Ghi chú:** Test case này cần xác nhận lại business requirement: Nhân viên có được phép mở/đóng ca hay chỉ Quản lý chi nhánh?

---

### TC-12-006: User chưa gán chi nhánh không thể thao tác

> **Mục tiêu:** Xác nhận user không có chi nhánh được gán thì không thể gửi request có X-Branch-Id

**Điều kiện:** Tạo user mới, gán role nhưng chưa gán chi nhánh nào

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Tạo user `no-branch@test.com`, gán role Nhân viên, không gán chi nhánh | User tạo thành công |
| 2 | Đăng nhập `no-branch@test.com` vào POS | Đăng nhập được nhưng không chọn được chi nhánh |
| 3 | Giao diện POS yêu cầu chọn chi nhánh | Không có chi nhánh nào để chọn |
| 4 | Không thể vào màn hình bán hàng | Blocked tại bước chọn chi nhánh |
| 5 | Thử gọi API với X-Branch-Id bất kỳ | Server trả về 403 (branch không thuộc user) |

**Kiểm tra thêm:**
- [ ] BranchScopeGuard từ chối request với branchId không nằm trong `user.branchIds[]`

---

## Trường hợp biên & trường hợp lỗi

### TC-12-EF-001: Nhân viên cố tạo user mới (thiếu iam.user.write)

> **Mục tiêu:** Xác nhận Nhân viên không thể thêm user vào hệ thống

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Đăng nhập `staff-hcm@test.com` | |
| 2 | Thử truy cập Backoffice → Phân quyền → Người dùng | Không thấy menu hoặc bị 403 |
| 3 | Gọi API `POST /users` với token của staff | 403 Forbidden |

---

### TC-12-EF-002: Quản lý chi nhánh A cố gán user vào chi nhánh B

> **Mục tiêu:** Xác nhận Quản lý chi nhánh chỉ quản lý user trong phạm vi chi nhánh mình

**Điều kiện:** `mgr-hcm@test.com` chỉ quản lý Branch A

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Đăng nhập `mgr-hcm@test.com` | |
| 2 | Vào Phân quyền → Người dùng → Sửa user `staff-hcm@test.com` | |
| 3 | Cố thêm Branch B vào danh sách chi nhánh của user | Branch B không xuất hiện để chọn (hoặc bị từ chối khi lưu) |

---

### TC-12-EF-003: Token hết hạn — tự động refresh hoặc redirect đăng nhập

> **Mục tiêu:** Xác nhận hệ thống xử lý đúng khi access token hết hạn

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Đăng nhập thành công | |
| 2 | Để phiên chờ quá 5 phút (access token TTL) rồi thực hiện thao tác | |
| 3 | Hệ thống tự refresh dùng refresh_token trong localStorage | Thao tác tiếp tục bình thường, không cần đăng nhập lại |
| 4 | Xóa refresh_token trong localStorage → thực hiện thao tác | Redirect về trang đăng nhập |
