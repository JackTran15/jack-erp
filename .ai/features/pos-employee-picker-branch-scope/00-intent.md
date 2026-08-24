---
feature: pos-employee-picker-branch-scope
slug: pos-employee-picker-branch-scope
owner: Akenzy
created: 2026-08-24
status: draft
---

# Intent — Branch-scope hai picker nhân viên trong POS

## Problem

Hai ô chọn người trong POS đang trả về sai tập nhân sự.

**A. "Người vận chuyển" ở màn Chuyển kho tạm không ra data.** Thu ngân mở ô, gõ tên, dropdown
rỗng — không có cách nào chọn được người vận chuyển, nên phiếu chuyển kho tạm phải bỏ trống
trường này. Nguyên nhân: picker gọi `GET /branches/:id/salesmen`, endpoint đó trả về bảng
`employee_profiles` của **toàn tổ chức** (`sales-hierarchy.service.ts:48-55, 173-200` —
`where: { organizationId }`, tham số `branchId` chỉ dùng để validate quyền chứ không lọc).
Hồ sơ HR là optional khi tạo tài khoản (`create-user.dto.ts:54-58`), nên tổ chức nào tạo user
không kèm block `profile` sẽ có `employee_profiles` rỗng và dropdown rỗng theo. Lỗi HTTP cũng
bị nuốt ở `PosSearchPopover.tsx:219-222` (`catch { setSuggestions([]) }`) nên 400/404 nhìn y
hệt "không có kết quả".

**B. Bộ lọc "Thu ngân" / "Nhân viên" ở màn Báo cáo theo ngày liệt kê nhân sự toàn hệ thống.**
Với tài khoản thường thì đã đúng chi nhánh, nhưng tài khoản có quyền `iam.user.read.all` rơi
vào nhánh `mode: 'all'` (`employee-branch-scope.service.ts:89-90`) và thấy nhân sự của mọi chi
nhánh. Quản lý cửa hàng phải tự lọc bằng mắt trong danh sách hàng trăm người của cả chuỗi.

Cả hai đều là cùng một sai lệch: danh sách người để **chọn** phải bám theo chi nhánh đang làm
việc, chứ không phải theo tổ chức.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Thu ngân POS | Mở ô "Người vận chuyển", dropdown rỗng, bỏ trống trường | Thấy ngay nhân viên của chi nhánh mình; tìm theo tên, email hoặc mã nhân viên; cuộn để xem thêm |
| Quản lý cửa hàng | Lọc báo cáo ngày trong danh sách thu ngân của cả chuỗi | Dropdown chỉ còn nhân sự chi nhánh đang chọn |
| Kế toán chuỗi (backoffice) | Xem báo cáo hợp nhất nhiều cửa hàng, dropdown thu ngân toàn hệ thống | Không đổi — vẫn thấy toàn hệ thống |

## Success signal

Trên POS, với tài khoản admin có `iam.user.read.all`: ô "Người vận chuyển" trả về đúng tập
`user_branch_assignments` của chi nhánh đang chọn (khác rỗng), và dropdown "Thu ngân" / "NVBH"
ở Báo cáo theo ngày cũng vậy — đối chiếu được với
`SELECT user_id FROM user_branch_assignments WHERE branch_id = '<active>'`.

## Out of scope

- **Báo cáo chuỗi ở backoffice.** Tài khoản có `reporting.invoice.consolidated.read` chọn
  nhiều cửa hàng vẫn phải thấy thu ngân toàn hệ thống (`report-query.util.ts:53-93`); thu hẹp
  chỗ đó là phá tính năng báo cáo hợp nhất.
- **Endpoint `GET /branches/:id/salesmen`.** Nó còn phục vụ picker NVBH ở màn Checkout; sửa
  ngữ nghĩa của nó là đổi hai màn cùng lúc. Xem mục "Ghi nhận" ở `03-logical-design.md`.
- **Lọc theo hồ sơ HR.** Không giới hạn danh sách ở user có `employee_profiles` — đó chính là
  nguyên nhân rỗng hiện tại.
- **Bypass `iam.user.read.all` trong `EmployeeBranchScopeService`.** Dùng chung cho picker Đối
  tượng ở phiếu kho và phiếu thu/chi; đụng vào là đổi các màn ngoài phạm vi.

## Constraints

| Kind | Detail |
| --- | --- |
| Platform | `PosSearchPopover` dùng chung cho nhiều picker và cho cả `PosSelect` — thay đổi phải backward-compatible |
| Contract | `TempWarehousePublicUser` nằm ở `@erp/shared-interfaces`, dùng cả để hydrate carrier trên line đã lưu |
| Contract | Global `ValidationPipe` bật `forbidNonWhitelisted: true` — query param mới phải khai báo trong DTO |
| Data | `employee_profiles` không có cột branch dùng được; liên kết nhân viên-chi nhánh thật sự là `user_branch_assignments` |
| Governance | `employee-branch-scope.md` được `employee-listing-surfaces.spec.ts` canh; sửa query người là phải sửa bảng |

## Existing surface touched

- **Tái sử dụng**: `GET /inventory/temp-warehouse/carriers` (đã tồn tại, đúng ngữ nghĩa cần),
  wrapper FE `tempWarehouseService.listCarriers()` (đang là dead code),
  `employeeBranchScopeSqlNamed()` ở `modules/rbac/employee-branch-scope.service.ts`.
- **Adjacent features**: `voucher-party-branch-scope`, `employee-role-branch-scope` — cùng đặt
  ra luật "picker người thì bám active branch".
- **Entry points**: không có route mới; sửa tại chỗ hai màn POS đã có.
