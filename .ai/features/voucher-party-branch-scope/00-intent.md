---
feature: voucher-party-branch-scope
slug: voucher-party-branch-scope
owner: Akenzy
created: 2026-08-22
status: draft
---

# Intent — Ô "Đối tượng" chỉ liệt kê nhân viên của chi nhánh đang làm việc

## Problem

Trên **Phiếu nhập kho / Phiếu xuất kho**, ô **Đối tượng** khi lọc theo loại *Nhân viên*
trả về **toàn bộ nhân viên của tổ chức**, không phân biệt chi nhánh. Người lập phiếu ở
Hà Nội phải cuộn qua nhân sự Hồ Chí Minh để tìm đúng người, và chọn nhầm một nhân viên
chi nhánh khác không bị chặn ở bất cứ đâu — phiếu vẫn lưu, vẫn ghi sổ.

Đây không phải lỗi riêng của phiếu nhập/xuất. Kiểm tra toàn bộ ERP cho thấy **bốn**
nguồn dữ liệu khác nhau cùng liệt kê nhân viên, và chỉ có hai trong số đó lọc theo
chi nhánh:

| Nguồn | Bề mặt | Lọc chi nhánh? |
|---|---|---|
| `POST /v2/counterparties/search` | Phiếu nhập kho, Phiếu xuất kho, Chuyển kho | ✗ chỉ `organizationId` |
| `GET /cash-vouchers/partners` | Phiếu thu, Phiếu chi, Phiếu thu/chi tiền gửi (ô Đối tượng **và** ô Nhân viên thu/chi) | ✗ chỉ `organizationId` |
| `GET /reports/invoices/filter-options?type=cashier` | Bộ lọc Thu ngân trên báo cáo + POS bàn giao ca | ✗ chỉ `organizationId` |
| `GET /reports/invoices/filter-options?type=salesperson` | Bộ lọc NVBH trên báo cáo | ✗ chỉ `organizationId` |
| `POST /v2/employees/search`, `GET /admin/users` | Màn Nhân viên (backoffice) | ✓ qua `UsersService.visibleUserIds()` |
| `GET /branches/:id/salesmen` | Chọn NVBH trên POS | ✓ theo `:branchId` trên path |

Hai đường đã đúng chứng minh luật này vốn tồn tại trong repo — bốn đường còn lại chỉ là
chưa được nối vào.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| Nhân viên kho chi nhánh | Mở ô Đối tượng > Nhân viên, thấy danh sách toàn công ty, tự nhớ ai thuộc chi nhánh mình | Chỉ thấy nhân viên của chi nhánh đang làm việc; không còn cơ hội chọn nhầm |
| Kế toán quỹ chi nhánh | Ô Đối tượng và ô "Nhân viên thu/chi" trên phiếu thu/chi liệt kê cả người chi nhánh khác | Cả hai ô chỉ còn nhân sự chi nhánh của phiếu |
| Người xem báo cáo | Bộ lọc Thu ngân / NVBH đổ ra toàn bộ nhân viên, phần lớn không bao giờ có giao dịch ở chi nhánh đang xem | Bộ lọc chỉ còn nhân sự chi nhánh đang xem |
| Quản trị viên (`iam.user.read.all`) | Thấy toàn bộ | Không đổi — vẫn thấy toàn bộ, để còn lập phiếu hộ chi nhánh khác |

## Success signal

Đăng nhập chi nhánh Hà Nội, mở ô Đối tượng > Nhân viên trên cả bốn bề mặt: không bề mặt
nào còn trả về `Nhân viên HCM` (tài khoản chỉ thuộc Hồ Chí Minh), trong khi tài khoản
`iam.user.read.all` vẫn thấy đủ. Đo bằng chính response của bốn endpoint, không đọc trên
màn hình rồi chép lại.

## Out of scope

- **Nhà cung cấp và Khách hàng trong cùng ô Đối tượng** — là dữ liệu cấp tổ chức
  (`inventory_providers`, `customers` không có cột chi nhánh); lọc chúng theo chi nhánh
  là một thay đổi nghiệp vụ khác, không phải lỗi đang báo.
- **Đường đọc (resolve id → tên)** — phiếu cũ trỏ tới nhân viên nay ngoài chi nhánh vẫn
  phải hiển thị đúng tên. Chỉ đường *tìm kiếm* bị lọc, không phải đường *tra cứu*.
- **Chặn ghi phía server** — bản này chỉ lọc danh sách chọn. Việc từ chối 403 khi POST
  một `employeeId` ngoài chi nhánh là lớp phòng thủ thứ hai, tách thành việc riêng.
- **Các select không liệt kê nhân viên** (kho, quỹ tiền mặt, tài khoản tiền gửi, nhóm
  hàng…) — đã chốt ở vòng hỏi: đợt này chỉ quét select nhân viên.
- **Gán chi nhánh cho nhân viên đang thiếu** — nghiệp vụ dữ liệu, không phải code.

## Constraints

| Kind | Detail |
|---|---|
| Quy ước sẵn có | `UsersService.visibleUserIds()` đã là chuẩn cho màn Nhân viên; đường mới phải giải thích được vì sao không dùng lại nguyên si (xem G2) |
| Kiến trúc | `partner-lookup.service.ts` cố tình dùng raw SQL để tách module cash-vouchers khỏi entity của module khác — không được kéo `UsersService` vào đó một cách tuỳ tiện |
| Dữ liệu | `user_branch_assignments` toàn cột `uuid` (đã kiểm `information_schema`), nên join với `users.id` không cần cast — nhưng `$n` trong raw SQL vẫn tới dạng text, phải `$n::uuid`. Trái lại `employee_profiles.organization_id` là `varchar` nên mọi join sang đó vẫn phải `::cast` |
| Ngôn ngữ | Source backend tiếng Anh; chuỗi UI tiếng Việt |

## Existing surface touched

- **Reused:** `UsersService.visibleUserIds()` / `actorBranchIds()` (`modules/rbac/users.service.ts`),
  `ActorContext.branchId` (`common/decorators/actor-context.decorator.ts`),
  `user_branch_assignments` (`UserBranchAssignmentEntity`)
- **Adjacent features:** `employee-role-branch-scope` (cùng bảng `user_branch_assignments`,
  nhưng giải quyết đường *ghi* — ai được gán vai trò/chi nhánh cho ai)
- **Entry points:** không có route mới. Bốn endpoint sẵn có đổi hành vi truy vấn;
  frontend không đổi hợp đồng.
