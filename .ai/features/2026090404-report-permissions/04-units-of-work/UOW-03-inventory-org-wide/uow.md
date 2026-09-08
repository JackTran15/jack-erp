---
id: UOW-03
slug: inventory-org-wide
title: Cửa hàng tra được tồn kho toàn hệ thống
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-03]
verifies: [AC-10, AC-11, AC-17]
risk: medium
status: done
rollback: revert commit — hàm cũ resolveInventoryBranchIds nằm trong lịch sử git
---

# UOW-03 — Cửa hàng tra được tồn kho toàn hệ thống

## Demo script
1. Đăng nhập quản lý chi nhánh (`bm.verify@erp.local`) — được gán 4 cửa hàng
2. Mở "Tổng hợp nhập xuất tồn kho", bấm ô Cửa hàng → thấy **mọi** chi nhánh của
   tổ chức, kể cả chi nhánh chưa được gán
3. Chọn một chi nhánh chưa được gán (ví dụ Nha Trang) → ra dữ liệu, không 403
4. Bấm số lượng trên "Tổng hợp nhập xuất điều chuyển" để mở drill-down → vẫn mở
   được, không 403 giữa chừng

## In scope
- 7 báo cáo chuyển từ `resolveInventoryBranchIds` sang `resolveOrgWideBranchIds`
- Bỏ kẹp ở ô chọn cửa hàng và ô chọn kho
- Bỏ kiểm tra anchor branch ở drill-down điều chuyển
- Xóa hàm và hằng đã hết caller

## Not in scope
- Cột giá trị (UOW-04) — mở tồn kho toàn hệ thống chỉ an toàn khi có gate đó

## Risks
| Risk | Mitigation |
| --- | --- |
| Nới quá tay, lộ tiền của cửa hàng khác | Cột giá trị cắt riêng ở UOW-04; UOW này chỉ đụng số lượng |
| Ô chọn cửa hàng vẫn kẹp → user thấy báo cáo nhưng không chọn được | Sửa `get-inventory-filter-options.handler.ts` cùng lượt |
| Cột "vị trí" mất giá trị khi không còn một chi nhánh duy nhất | `resolveLocations` lùi về `actor.branchId` khi phạm vi là org-wide |

## Definition of done
- [x] AC-10, AC-11, AC-17 pass
- [x] `resolveInventoryBranchIds`, `permittedBranchIds`, `NO_ACCESS_BRANCH_IDS` đã xóa
- [x] Doc-block ADR-04 viết lại cho đúng phạm vi mới
- [x] Demoed và chấp nhận ở G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description
