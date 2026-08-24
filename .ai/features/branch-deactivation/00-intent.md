---
feature: branch-deactivation
slug: branch-deactivation
owner: Akenzy
created: 2026-08-24
status: draft
---

# Intent — Ngừng hoạt động cửa hàng

## Problem

Backoffice không có cách nào cho một cửa hàng "nghỉ". Chỉ có **Xoá** — và
`BranchCrudService.remove` quét ~35 bảng nghiệp vụ rồi từ chối với
*"Cửa hàng đã có phát sinh dữ liệu liên quan, không thể xoá."*

Hệ quả: **mọi cửa hàng từng bán một hoá đơn đều không thể gỡ khỏi hệ thống.** Một cửa hàng
đã đóng cửa ngoài đời thực vẫn nằm nguyên trong ô chọn chi nhánh ở header, trong danh sách
chi nhánh của POS, trong bộ lọc mọi báo cáo, trong ô "kho đích" khi lập lệnh chuyển kho, và
trong cột của báo cáo tổng hợp tồn kho theo chi nhánh. Người dùng phải tự nhớ "cái này đóng
rồi, đừng chọn".

Điều bất ngờ khi khảo sát repo: **hạ tầng đã có sẵn từ lâu, chỉ là chưa ai đọc nó.**

| Thứ đã tồn tại | Ở đâu |
|---|---|
| Cột `status: ACTIVE \| SUSPENDED \| ARCHIVED` trên `branches` | `modules/branch/branch.entity.ts:41` |
| `BranchService.suspend()` và `archive()` với luật chuyển trạng thái | `modules/branch/branch.service.ts:242,283` |
| `POST /branches/:id/suspend`, `POST /branches/:id/archive` | `modules/branch/branch.controller.ts:105,113` |
| Quyền `branch.archive`, cố ý giữ riêng cho Root/General Manager | `database/seeds/org-role-permissions.ts:53` |
| Tiền lệ cùng ngữ nghĩa ở cấp kho: `StorageEntity.isActive` | `modules/inventory/location/storage.entity.ts` |

`grep BranchStatus` trên toàn repo chỉ ra kết quả **bên trong `modules/branch/`**. Không một
danh sách, một bộ lọc, một báo cáo hay một đường ghi nào đọc cột này. Hôm nay một cửa hàng
SUSPENDED hoạt động y hệt một cửa hàng ACTIVE.

Vậy việc cần làm không phải "xây tính năng ngừng hoạt động" mà là **nối cột đã có vào những
nơi buộc phải tôn trọng nó**, cộng đúng một nút bấm trên UI.

## Affected personas

| Persona | Hành vi hiện tại | Hành vi mong muốn |
|---|---|---|
| Quản trị chuỗi (Root / GM) | Muốn đóng một cửa hàng thì hết cách: xoá bị chặn vì đã có dữ liệu, không có trạng thái nào khác để đặt | Tích ô "Ngừng hoạt động" trong form sửa cửa hàng, xác nhận, xong |
| Nhân viên kho / thu ngân | Ô chọn chi nhánh vẫn liệt kê cửa hàng đã đóng; chọn nhầm không bị chặn ở đâu cả | Cửa hàng đã ngừng không còn xuất hiện trong bất kỳ ô chọn nào |
| Người lập lệnh chuyển kho | Chọn được cửa hàng đã đóng làm kho đích; hàng chuyển đi rồi kẹt ở đó | Không chọn được, và nếu gọi thẳng API cũng bị từ chối |
| Người xem báo cáo | Cột/bộ lọc báo cáo vẫn có cửa hàng đã đóng, luôn trống hoặc chỉ có số cũ | Cửa hàng đã ngừng biến mất khỏi báo cáo |
| Nhân viên chỉ thuộc cửa hàng đã đóng | (chưa từng xảy ra) | Vẫn đăng nhập được, thấy màn hình rỗng "chưa được gán cửa hàng", không phải màn hình lỗi |

## Success signal

Ngừng hoạt động chi nhánh **Hà Nội**, rồi đo bằng chính response của API chứ không đọc trên
màn hình rồi chép lại:

- `GET /branches`, `GET /branches/me`, và ba endpoint `/*/filter-options` **không** còn trả về
  Hà Nội;
- `POST /auth/switch-branch` sang Hà Nội trả 403;
- `POST /transfer-orders` với `destinationBranchId` = Hà Nội trả 400;
- `GET /reports/inventory/stock-by-branch` không còn cột Hà Nội;
- màn **Cửa hàng** trên backoffice **vẫn** thấy Hà Nội với ô "Ngừng hoạt động" đang tích —
  bỏ tích thì mọi thứ ở trên quay lại như cũ.

## Out of scope

- **Trạng thái `ARCHIVED`.** Đã có sẵn trong enum và trong `BranchService.archive()`, nhưng
  đợt này UI chỉ có một công tắc `ACTIVE ↔ SUSPENDED`. "Đóng vĩnh viễn" là quyết định nghiệp
  vụ khác, chưa ai yêu cầu.
- **Đường tra tên (resolve id → tên cửa hàng).** `GET /branches/:id` và các truy vấn
  `branchRepo.find({ id: In([...]) })` trong transfer-order, goods-issue, in phiếu… **không**
  lọc theo status. Phiếu chuyển kho cũ vẫn phải in đúng tên cửa hàng đối tác. Chỉ đường *chọn*
  và đường *tổng hợp* bị lọc, không phải đường *tra cứu* — cùng nguyên tắc đã áp ở
  `voucher-party-branch-scope`.
- **Xoá cứng cửa hàng.** `BranchCrudService.remove` giữ nguyên hành vi hiện tại. Ngừng hoạt
  động là lối thoát *thay cho* xoá, không thay thế nó.
- **Chặn ngừng khi còn tồn kho / chứng từ dở dang.** Đã chốt ở vòng hỏi: chỉ cảnh báo, không
  chặn.
- **Dọn dẹp dữ liệu của cửa hàng đã ngừng** (chuyển tồn kho đi, đóng công nợ, gán lại nhân
  viên). Là quy trình nghiệp vụ của người dùng, không phải code.
- **Cửa hàng con (`parentBranchId`).** Luật "không archive khi còn cửa hàng con đang hoạt
  động" đã có trong `archive()`; suspend không kế thừa luật này vì cây chi nhánh hiện chưa
  được dùng trong dữ liệu thật.

## Constraints

| Kind | Detail |
|---|---|
| Quyết định người dùng | Cửa hàng đã ngừng **biến mất hoàn toàn khỏi báo cáo, kể cả kỳ quá khứ** — số tổng toàn chuỗi của tháng trước sẽ nhỏ đi sau khi ngừng. Đây là điều đã chọn, không phải tác dụng phụ ngoài ý muốn |
| Quyết định người dùng | Nhân viên chỉ thuộc cửa hàng đã ngừng **vẫn đăng nhập được**; không chặn thao tác ngừng vì lý do nhân sự |
| Quyết định người dùng | Còn tồn kho / chứng từ dở dang: chỉ hiện thông báo trước khi lưu, không chặn |
| UI tham chiếu | MISA eShop: checkbox "Ngừng hoạt động" nằm trong form *Sửa cửa hàng*, kèm hộp thoại xác nhận nhắc "các thiết bị bán hàng sẽ không tiếp tục làm việc được nữa" |
| Kiến trúc | 48 entity mang `branchId` — không thể lọc từng bảng. Phải đi qua điểm nghẽn: `resolveUserBranches` (JWT), hai endpoint danh sách, ba resolver `stores()`, và các đường ghi liên chi nhánh |
| Kiến trúc | `BranchController` hiện **không gắn `PermissionGuard`** — chỉ có `AuthGuard` toàn cục. Hai endpoint lifecycle đang mở cho mọi người đăng nhập |
| Hiệu lực | Access token TTL 15 phút (`auth.service.ts:31`). Nếu chỉ lọc ở `resolveUserBranches` thì token cũ vẫn dùng được tối đa 15 phút sau khi ngừng |
| Ngôn ngữ | Source backend tiếng Anh; chuỗi UI tiếng Việt; số/ngày theo `vi-VN` |

## Existing surface touched

- **Reused:** `BranchService.suspend()` (`modules/branch/branch.service.ts:283`),
  `BranchStatus` (`packages/shared-interfaces/src/organization/index.ts:8`),
  quyền `branch.archive` (`modules/rbac/permissions.seed.ts:20`),
  khuôn quét phụ thuộc `BRANCH_DELETE_OPERATIONAL_DEPENDENCIES`
  (`modules/branch/branch-crud.service.ts:27`),
  `permittedBranchIds()` / `resolveInventoryBranchIds()`
  (`modules/inventory-reports/report/report-scope.util.ts`),
  `useBranches` / `useMyBranches` (`apps/backoffice-web/src/hooks/iam/useBranches.ts`),
  render checkbox sẵn có cho `type: "boolean"` (`components/crud/CrudFieldInput.tsx:92`),
  lối special-case theo `entityKey` đã dùng ở `CrudFieldInput.tsx:40` và `CrudListPage.tsx:523`.
- **Adjacent features:** `voucher-party-branch-scope` (cùng nguyên tắc "lọc đường chọn, không
  lọc đường tra cứu"), `employee-role-branch-scope` (cùng bảng `user_branch_assignments`).
- **Entry points:** một endpoint mới `POST /branches/:id/activate`, một endpoint mới
  `GET /branches/:id/deactivation-impact`; không có route frontend mới — checkbox nằm trong
  form sửa cửa hàng đã có.
