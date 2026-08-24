---
id: UOW-01
slug: toggle-tren-man-cua-hang
title: Tích một ô để ngừng hoạt động cửa hàng, bỏ tích để mở lại
demoable: true
duration: 2d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-05, AC-06]
risk: medium
status: todo
rollback: revert; không có migration, không có cột mới. `branches.status` quay về chỗ chưa ai đọc như hôm nay
---

# UOW-01 — Tích một ô để ngừng hoạt động cửa hàng

Lát cắt này mang theo `BranchStatusService` — nơi duy nhất định nghĩa "cửa hàng đang hoạt
động" — vì bốn lát sau đều gọi vào nó. Sau lát này người dùng **bấm được nút**, nhưng cửa hàng
đã ngừng vẫn hiện ở mọi nơi khác: đó đúng là việc của UOW-02..04.

AC-04 cố tình **không** nằm trong `verifies` của lát này. Nó được viết ở tầng API
("tôi *gọi* `POST /branches/:id/suspend`… Then **API** trả 403") nên không có bề mặt UI để
chụp; đòi ảnh cho nó là sai thể loại. T-01-02 vẫn `verifies: [AC-04]`, nên độ phủ AC vẫn đủ —
xem `## Not verified here` trong `07-verification.md` để biết bằng chứng thật là gì.

## Demo script

1. Đăng nhập backoffice bằng tài khoản có `branch.archive`, mở **Danh mục → Cửa hàng**
2. Mở form sửa **Chi nhánh Hà Nội** → thấy ô tích **"Ngừng hoạt động"** đang bỏ trống
3. Tích ô, bấm **Lưu** → hộp thoại xác nhận hiện tên cửa hàng, câu cảnh báo thiết bị bán hàng
   sẽ không làm việc được nữa, kèm số liệu còn tồn đọng (tồn kho, lệnh điều chuyển chưa nhận,
   nhân viên chỉ thuộc cửa hàng này)
4. Bấm **Có** → lưu thành công; dòng Hà Nội trong danh sách hiện trạng thái đã ngừng
5. Mở lại form → ô tích đang bật; bỏ tích, lưu → quay về đang hoạt động
6. Thử ngừng **cửa hàng chính** → 400, thông báo tiếng Việt
7. Đăng nhập bằng tài khoản Branch Manager, gọi `POST /branches/:id/suspend` bằng curl → 403

## In scope

- `BranchStatusService`: `activeBranchIds`, `suspendedBranchIds` (cache Redis), `isActive`
- `POST /branches/:id/activate`; siết `POST /branches/:id/suspend` (quyền + chặn cửa hàng chính)
- `BranchService.update` định tuyến đổi `status` qua suspend/activate (ADR-04)
- `GET /branches/:id/deactivation-impact`
- Ô tích + hộp thoại xác nhận trong form sửa cửa hàng; màn Cửa hàng gọi kèm `includeInactive=true`

## Not in scope

- Lọc cửa hàng đã ngừng khỏi các danh sách khác (UOW-02)
- Báo cáo (UOW-03), chặn đường ghi (UOW-04)

## Risks

| Risk | Mitigation |
|---|---|
| `CrudRecordDialog` là component dùng chung, special-case có thể ảnh hưởng entity khác | Special-case theo `entityKey === "branches"`, đúng lối đã có ở `CrudListPage.tsx:523`; T-01-04 phải kiểm một entity khác không đổi hành vi |
| Gắn `PermissionGuard` vào `BranchController` có thể khoá nhầm các endpoint đang mở | Guard trả `true` khi handler không khai `@RequirePermission` (`permission.guard.ts:29`) — chỉ hai endpoint lifecycle bị siết |
| A-09 (chặn cửa hàng chính) chưa được người dùng xác nhận | Là một nhánh kiểm tra độc lập; bỏ đi chỉ mất AC-05 |

## Definition of done
- [ ] AC-01..AC-06 pass
- [ ] `branch.service.spec.ts` mở rộng cho activate + chặn cửa hàng chính + định tuyến qua update
- [ ] Không có migration nào được sinh ra
- [ ] Demo được chấp nhận ở G4

## Verification evidence
- [ ] `verify.py <feature-dir> --write` green on every required environment
- [ ] Evidence exists for every AC in `verifies`, at every declared viewport
- [ ] `08-evidence.md` regenerated and its commit sha matches HEAD
