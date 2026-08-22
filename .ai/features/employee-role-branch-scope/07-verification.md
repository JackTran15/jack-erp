---
feature: employee-role-branch-scope
environments: [local-backoffice-bm]
viewports: [desktop]
---

# Verification — Ẩn vai trò và chi nhánh ngoài quyền của Quản lý chi nhánh

Chạy bằng tài khoản **Quản lý chi nhánh** (`LOCAL_BACKOFFICE_BM_*`) của org `My Company`
trong `erp_dev`. Đây là tài khoản duy nhất chứng minh được tính năng: một tài khoản toàn
quyền nhìn thấy mọi thứ nên không phân biệt được "ẩn đúng" với "chưa lọc gì".

`verify.py` chạy **mọi bước trên mọi môi trường** — bảng Steps không có cột env — nên một
kế hoạch không thể vừa khẳng định "admin thấy 9 ô" vừa khẳng định "quản lý chi nhánh thấy 5
ô". Phần đối chiếu với tài khoản cấp cao hơn nằm ở e2e, không ở đây (xem *Not verified here*).

Số liệu trong cột `Assert` lấy từ `erp_dev`, không phải đọc trên UI rồi chép lại:

```sql
-- org My Company có đúng 3 chi nhánh và 6 vai trò seed
SELECT name FROM branches WHERE organization_id::text = '<My Company>';
--  Chi nhánh 2 | Chi nhánh kiểm thử | HCM
SELECT b.name FROM user_branch_assignments uba
JOIN branches b ON b.id = uba.branch_id
JOIN users u ON u.id = uba.user_id WHERE u.first_name = 'QuanLyCN';
--  HCM        ← tài khoản này chỉ thuộc 1 trong 3 chi nhánh
```

`assignable` là phép hiệu tập permission, nên số ô vai trò hiện ra bằng số vai trò **không**
mang key nào tài khoản này thiếu. Quản lý chi nhánh thiếu nhóm đăng ký tổ chức/chi nhánh,
nhóm xóa chứng từ tiền và hủy hóa đơn ⇒ ẩn **Quản trị hệ thống** và **Quản lý tổng**, còn 4
vai trò. Cộng 1 chi nhánh ⇒ tổng **5** ô tick trong hộp thoại — một phép đếm khóa được cả
hai yêu cầu cùng lúc.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Danh sách nhân viên mở được bằng quyền `iam.user.read` của Quản lý chi nhánh | `/admin/employees` | `wait button:has-text("Thêm mới")` | AC-01 | `text=Thêm mới` |
| S2 | Tab **Vai trò**: hai vai trò cao hơn đã biến mất khỏi lưới, không phải bị làm mờ | `/admin/employees` | `click button:has-text("Thêm mới"); wait [role="dialog"]; click [role="dialog"] button:has-text("Vai trò")` | AC-01 | `text=VAI TRÒ HỆ THỐNG; no-text=Quản trị hệ thống; no-text=Quản lý tổng` |
| S3 | Vai trò còn lại đúng 4 — những vai trò là tập con quyền của người tạo | `/admin/employees` | `click button:has-text("Thêm mới"); wait [role="dialog"]; click [role="dialog"] button:has-text("Vai trò")` | AC-01 | `text=Quản lý chi nhánh; text=Nhân viên bán hàng; text=Nhân viên thu ngân; text=Nhân viên kho` |
| S4 | **Chi nhánh được truy cập** chỉ còn HCM; tổng 4 vai trò + 1 chi nhánh = 5 ô tick | `/admin/employees` | `click button:has-text("Thêm mới"); wait [role="dialog"]; click [role="dialog"] button:has-text("Vai trò")` | AC-02 | `text=Chi nhánh được truy cập; no-text=Chi nhánh 2; no-text=Chi nhánh kiểm thử; count [role="dialog"] input[type="checkbox"] = 5` |

### Xem tài khoản cấp cao hơn — mở được, nhưng đường ghi bị khóa

Org này có `Admin User` (Quản trị hệ thống) và `QuanLyTong` (Quản lý tổng), cả hai đều thuộc
chi nhánh HCM nên đều nằm trong tầm nhìn của Quản lý chi nhánh. Server trả `canEdit: false`
cho hai dòng đó.

Ô tick đầu dòng (`aria-label="Chọn nhân viên …"`) là bằng chứng dòng **đang thực sự được
chọn** — thiếu nó thì `Sửa` bị xám chỉ vì chưa chọn gì, và bước sẽ xanh mà không chứng minh
điều gì.

Chỉ khẳng định trên nút `Sửa`, **không** trên `Ngừng HĐ`: vai trò Quản lý chi nhánh không có
`iam.user.delete`, nên nút đó xám ở mọi dòng vì một cái cổng khác. Khẳng định lên nó sẽ xanh
mà không chứng minh được gì về `canEdit`.

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S5 | Chọn `Admin User`: panel chi tiết mở bình thường, không toast lỗi; `Sửa` xám | `/admin/employees` | `click [aria-label^="Chọn nhân viên Admin User"]` | AC-06 | `count [aria-label^="Chọn nhân viên Admin User"]:checked = 1; count button:has-text("Sửa"):disabled = 1` |
| S6 | Chọn `QuanLyTong`: y hệt — quy tắc đọc permission, không đọc tên vai trò | `/admin/employees` | `click [aria-label^="Chọn nhân viên QuanLyTong"]` | AC-06 | `count [aria-label^="Chọn nhân viên QuanLyTong"]:checked = 1; count button:has-text("Sửa"):disabled = 1` |
| S7 | Đối chứng: chọn `NhanVienBH` (Nhân viên bán hàng, cùng chi nhánh) thì `Sửa` bật lại — nút không phải lúc nào cũng xám | `/admin/employees` | `click [aria-label^="Chọn nhân viên NhanVienBH"]` | AC-07 | `count [aria-label^="Chọn nhân viên NhanVienBH"]:checked = 1; count button:has-text("Sửa"):enabled = 1` |

### Nhân bản trên tài khoản cấp cao hơn

`Nhân bản` sao chép `roleIds` của tài khoản gốc sang form tạo mới, mà tab Vai trò lại **ẩn**
đúng những vai trò đó — người dùng không nhìn thấy nên không thể bỏ tick, và chỉ biết có
chuyện khi bấm Lưu và nhận 403 kèm thông báo tiếng Anh từ server. Vì vậy nút này phải bị khóa
cùng lúc với `Sửa`.

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S8 | Chọn `Admin User`: `Nhân bản` cũng phải xám như `Sửa` | `/admin/employees` | `click [aria-label^="Chọn nhân viên Admin User"]` | AC-08 | `count [aria-label^="Chọn nhân viên Admin User"]:checked = 1; count button:has-text("Nhân bản"):disabled = 1` |

### Màn "Quản lý vai trò" — gỡ người dùng khỏi vai trò

Quản lý chi nhánh nhìn thấy 9 tài khoản (chi nhánh HCM + các tài khoản cấp cao hơn). Số dòng
mỗi vai trò dưới đây lấy từ `erp_dev`, giao với đúng tập 9 tài khoản đó:

```sql
SELECT r.name, count(ur.user_id) FROM roles r
LEFT JOIN user_roles ur ON ur.role_id = r.id
WHERE r.organization_id::text = '<My Company>' GROUP BY r.name;
--  Quản lý tổng = 1  ·  Quản trị hệ thống = 1  ·  Nhân viên bán hàng = 4
-- Trong 4 người "Nhân viên bán hàng" có 1 người ở Chi nhánh 2, ngoài tầm nhìn
-- của Quản lý chi nhánh, nên lưới chỉ hiện 3.
```

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S9 | Chọn vai trò `Quản lý tổng`: dòng người dùng vẫn hiện, nhưng nút gỡ bị khóa | `/role-management` | `click [aria-label="Chọn vai trò Quản lý tổng"]` | AC-09 | `count [aria-label^="Gỡ"] = 1; count [aria-label^="Gỡ"]:disabled = 1` |
| S10 | Đối chứng: chọn `Nhân viên bán hàng` thì cả 3 nút gỡ đều bật — nút không phải lúc nào cũng xám | `/role-management` | `click [aria-label="Chọn vai trò Nhân viên bán hàng"]` | AC-10 | `count [aria-label^="Gỡ"]:enabled = 3; count [aria-label^="Gỡ"]:disabled = 0` |
| S11 | Hộp "Chọn người dùng": đúng 2 ô tick bị khóa — `Admin User` và `QuanLyTong` | `/role-management` | `click [aria-label="Chọn vai trò Nhân viên bán hàng"]; click button:has-text("Chọn"); wait [role="dialog"]` | AC-09 | `count [role="dialog"] input[type="checkbox"]:disabled = 2` |

S10 là bước bắt buộc, không phải bước thừa: thiếu nó thì "nút bị khóa" ở S9 có thể chỉ là nút
luôn khóa — đúng cái bẫy đã làm một bước đỏ oan ở vòng trước.

## Not verified here

- **AC-03** (quyền thấy-mọi-chi-nhánh đến từ permission chứ không từ số chi nhánh được gán):
  cần tài khoản Quản lý tổng — chỉ được gán 1 chi nhánh nhưng có `iam.user.branches.write.all`
  nên vẫn phải thấy đủ 3. Không dựng được trong cùng kế hoạch này vì mọi bước chạy trên mọi
  môi trường. Phủ bởi unit test `branch assignment scope` trong `users.service.spec.ts`.
- **AC-04** (403 của server) và **AC-05** (hợp đồng cờ `assignable`): không có bề mặt UI, chặn
  nằm trong `users.service.ts` và chỉ quan sát được qua HTTP. Phủ bởi
  `apps/api/test/e2e/user-branch-scope.e2e-spec.ts` — 5/5 xanh.

## Notes

Tài khoản này chỉ thuộc chi nhánh HCM nên không có menu chuyển chi nhánh để chọn; môi trường
`local-backoffice-bm` do đó **không** khai báo `post_login` như `local-backoffice`.
