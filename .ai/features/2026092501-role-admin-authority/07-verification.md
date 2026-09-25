---
feature: 2026092501-role-admin-authority
environments: [local-backoffice, local-backoffice-bm]
viewports: [desktop]
---

# Verification — Quản trị hệ thống được sửa mọi vai trò dưới nó

Hai environment = hai vai trò trên cùng một màn hình: `local-backoffice`
(Quản trị hệ thống, 239/239 khóa) và `local-backoffice-bm` (Quản lý chi nhánh,
196 khóa). Cột `Env` giới hạn step theo vai trò.

S1/S2 là hai khẳng định, S3 là vế phủ định của chúng — cùng một vai trò
"Quản lý tổng", hai tài khoản, hai kết quả ngược nhau. Nếu ai đó khôi phục lại
cách chặn theo `isSystem`, S2 đỏ. Nếu ai đó gỡ luôn cả kiểm tra quyền, S3 đỏ.

S2 khẳng định cả nhãn mới lẫn sự vắng mặt của nhãn cũ: một bản build chỉ sửa
backend mà quên UI sẽ dừng ở đúng dòng đó thay vì xanh nhầm.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert | Env |
|---|---|---|---|---|---|---|
| S1 | Admin mở "Quản lý tổng": form ở chế độ sửa | `/role-management` | `wait input[aria-label="Chọn vai trò Quản lý tổng"]; click input[aria-label="Chọn vai trò Quản lý tổng"]; click [aria-label="Hành động trang"] >> text=Sửa; wait text=THÔNG TIN CƠ BẢN; wait text=Đã chọn 6/6` | AC-01 | `text=Sửa quản lý vai trò; text=Đã chọn 6/6; no-text=Xem vai trò` | local-backoffice |
| S2 | Admin mở chính "Quản trị hệ thống": cũng ở chế độ sửa, nhãn chỉ còn cấm đổi tên và xóa | `/role-management` | `wait input[aria-label="Chọn vai trò Quản trị hệ thống"]; click input[aria-label="Chọn vai trò Quản trị hệ thống"]; click [aria-label="Hành động trang"] >> text=Sửa; wait text=THÔNG TIN CƠ BẢN; wait text=Đã chọn 6/6` | AC-02 | `text=Sửa quản lý vai trò; text=Vai trò hệ thống — không đổi tên hoặc xóa; text=Đã chọn 6/6; no-text=không chỉnh sửa hoặc xóa; no-text=không chỉnh trên UI` | local-backoffice |
| S3 | Quản lý chi nhánh mở "Quản lý tổng": vẫn chỉ đọc | `/role-management` | `wait input[aria-label="Chọn vai trò Quản lý tổng"]; click input[aria-label="Chọn vai trò Quản lý tổng"]; click [aria-label="Hành động trang"] >> text=Xem; wait text=THÔNG TIN CƠ BẢN; wait text=Đã chọn 6/6` | AC-04 | `text=Xem vai trò; text=Đã chọn 6/6; no-text=Sửa quản lý vai trò` | local-backoffice-bm |

## Not verified here

- **AC-03** (cấm đổi tên / xóa vai trò hệ thống) — nút Xóa đã tắt sẵn và ô Tên
  đã khóa, nên trên UI không có thao tác nào phát sinh được request để chụp lại.
  Chặn nằm ở `RolesService.update` / `.delete`, phủ bởi unit test
  `roles.service.spec.ts` và đã đo trực tiếp qua API ngày 2026-09-25:
  `PATCH {name}` → 400 "System roles cannot be renamed".

- **AC-05** (không tự hạ quyền, không cấp quyền mình không có) — bằng chứng là
  một request **bị từ chối**, không phải một màn hình. Muốn chụp được nó phải bỏ
  tick quyền rồi bấm Lưu trên `erp_dev`, tức là ghi thật vào bảng
  `role_permissions` của dữ liệu vận hành. Phủ bởi 4 unit test trong
  `roles.service.spec.ts` và đã đo qua API: `PUT .../permissions` với tập quyền
  bị cắt → 403 "would drop 238 permission(s) you currently hold".

- **Vai trò Quản lý tổng làm actor** — đây mới là vế chứng minh cổng chặn đọc từ
  `assignable` chứ không phải từ `iam.role.write`: một tài khoản Quản lý tổng
  sửa được vai trò của chính mình nhưng không sửa được "Quản trị hệ thống".
  Không chạy được ở đây vì `qlt.verify@erp.local` đã mất sau lần dump lại DB
  (xem ghi chú trong `.ai/credentials.env`), và `e2e-manager@erp.local` không có
  mật khẩu trong file đó. Phủ bởi unit test
  "refuses an edit by a caller who lacks one of the role's permissions".

## Notes

- Mỗi step chờ `Đã chọn 6/6` chứ không chỉ chờ khung modal: cây phân quyền là một
  request thứ hai (`GET /admin/roles/:id`), và lần chạy đầu ngày 2026-09-25 đã
  chụp S3 lúc cây còn rỗng — ảnh trông như "vai trò không có quyền nào" trong
  khi API trả đủ 235 khóa. Assertion đó biến việc dữ liệu đã về thành một điều
  kiện để xanh, không còn là may rủi về thời điểm.
- Quản lý chi nhánh có `iam.role.read` nhưng **không** có `iam.role.write`, nên
  S3 chứng minh đường chỉ-đọc còn nguyên, chứ chưa tách bạch được `canWrite` với
  `assignable`. Vế tách bạch nằm ở mục ngay trên.
- S2 còn khẳng định ô Diễn giải **không** chứa chuỗi cũ "không chỉnh trên UI".
  Chuỗi đó là dữ liệu đã seed vào `roles.description`, không phải mã nguồn, nên
  sửa seed không đổi được nó — ngày 2026-09-25 đã UPDATE 2 dòng trong `erp_dev`
  cho khớp. Assertion này là thứ bắt được nếu một môi trường khác chưa chạy.
- Chạy trên `erp_dev`. Cả ba step chỉ đọc — không step nào bấm Lưu.
