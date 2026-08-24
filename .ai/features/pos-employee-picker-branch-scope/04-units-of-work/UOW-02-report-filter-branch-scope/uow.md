---
id: UOW-02
slug: report-filter-branch-scope
title: Bộ lọc Thu ngân / NVBH ở Báo cáo theo ngày bám active branch trên POS
demoable: true
duration: 1d
depends_on: []
requirements: [US-02]
verifies: [AC-08, AC-09]
risk: low
status: todo
rollback: revert diff — tham số `branchId` là optional, bỏ nó đi là quay về hành vi cũ, không có state nào tồn dư
---

# UOW-02 — Thu ngân / NVBH theo chi nhánh (Báo cáo theo ngày, POS)

## Demo script

1. Đăng nhập POS bằng tài khoản admin có `iam.user.read.all`, chọn chi nhánh B
2. Vào Báo cáo theo ngày, mở dropdown "Thu ngân"
   → chỉ còn user thuộc chi nhánh B (AC-08)
3. Mở tab bàn giao ca, mở ô "Nhân viên" → cùng danh sách đó (AC-08)
4. Mở dropdown "NVBH" → chỉ còn NVBH thuộc chi nhánh B (AC-09)
5. Gọi `GET /reports/invoices/filter-options?type=cashier&branchId=<uuid chi nhánh không thuộc token>`
   → 403, không có dòng nhân sự nào (AC-10)
6. Mở backoffice bằng tài khoản có `reporting.invoice.consolidated.read`, vào báo cáo chain-store,
   chọn phạm vi "tất cả cửa hàng", mở dropdown "NV thu ngân"
   → vẫn liệt kê toàn hệ thống, và request **không** kèm `branchId` (AC-11)

## In scope

- Query param `branchId` optional trên `GET /reports/invoices/filter-options`, có đối chiếu
  `actor.branchIds`, áp cho cả `type=cashier` và `type=salesperson`.
- POS gửi active branch từ `usePosBranchStore`.

## Not in scope

- Bỏ bypass `iam.user.read.all` trong `EmployeeBranchScopeService` (ADR-02).
- Backoffice: không sửa một dòng nào; nó là đối chứng của AC-11.
- Các `type` khác của endpoint (store, customer, product_group…) — không liệt kê người.

## Risks

| Risk | Mitigation |
| --- | --- |
| Quên đối chiếu `actor.branchIds` → tham số thành đường đọc nhân sự chi nhánh khác | AC-10 là AC riêng, có spec bắt 403, không chỉ kiểm bằng mắt |
| Thu hẹp lan sang backoffice | Đường cũ chỉ chạy khi `dto.branchId` undefined; AC-11 canh đúng chỗ đó |

## AC không nằm trong `verifies:` của UoW này

**AC-10** và **AC-11** vẫn do UOW-02 giao và vẫn ở `verifies:` của T-02-01. Bỏ khỏi `verifies:`
của UoW vì cả hai về bản chất không chụp được, không phải vì chưa làm:

- AC-10 là một mã 403 trên tham số mà POS không bao giờ gửi — không có bề mặt UI nào để chụp.
  Bằng chứng: spec trong `get-report-filter-options.handler.spec.ts`, và reviewer đã mutation-test
  (bỏ bước đối chiếu `actor.branchIds` → đúng hai case đó đỏ).
- AC-11 cần môi trường `local-backoffice`, nhưng `verify.py` chạy **mọi bước trên mọi môi trường**
  — bảng Steps không có cột env — nên một kế hoạch không thể vừa đi route POS vừa đi route
  backoffice. Bằng chứng: spec "omitting branchId leaves the consolidated scope untouched", cộng
  với việc caller backoffice không bao giờ gửi `branchId` (reviewer đã grep).

Giữ chúng ở `verifies:` của UoW chỉ để `evidence_check` đòi một tấm ảnh không tồn tại được thì
kết cục là hoặc G4 kẹt vĩnh viễn, hoặc ai đó tick bừa — đúng thứ mà cả bộ khung này sinh ra để
chặn.

## Definition of done

- [x] AC-08 đến AC-11 pass
- [x] `pnpm --filter @erp/api test -- get-report-filter-options.handler.spec.ts employee-listing-surfaces.spec.ts` xanh
- [x] `employee-branch-scope.md` mô tả đúng hai chế độ scope của endpoint
- [x] `pnpm openapi:generate` đã chạy, snapshot + schema generated đã commit
- [x] Demoed và accepted ở gate G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
