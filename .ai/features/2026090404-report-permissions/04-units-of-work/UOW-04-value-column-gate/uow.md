---
id: UOW-04
slug: value-column-gate
title: Cột giá trị nhập/xuất có quyền riêng
demoable: true
duration: 1d
depends_on: [UOW-03]
requirements: [US-04]
verifies: [AC-12, AC-13, AC-14]
risk: medium
status: done
rollback: cấp reporting.inventory.value.read cho mọi vai trò → hành vi như trước
---

# UOW-04 — Cột giá trị nhập/xuất có quyền riêng

## Demo script
1. Đăng nhập Nhân viên kho (`wh.verify@erp.local`) — không có khóa xem giá trị
2. Mở "Tổng hợp nhập xuất tồn kho" → chỉ thấy nhóm "Số lượng", không có "Giá trị"
3. Đăng nhập quản trị hệ thống, mở đúng báo cáo đó → thấy cả "Số lượng" và "Giá trị"
4. Với vai trò kho, bấm Xuất khẩu → file không có cột giá trị
5. Chạy một mẫu đã lưu có cột `outValue` → báo cáo vẫn chạy, chỉ thiếu cột đó

## In scope
- `valueColumns` khai báo tường minh trên từng report definition
- Lược cột ở ba đường: xem, xuất khẩu, in
- Mẫu đã lưu có cột bị cấm thì bỏ cột thay vì lỗi

## Not in scope
- Cột tiền của báo cáo bán hàng / lợi nhuận / công nợ — cả báo cáo đã bị kẹp ở UOW-02

## Risks
| Risk | Mitigation |
| --- | --- |
| Quên một đường (export hoặc in) là thủng gate | Lược ở 3 handler, mỗi đường có test riêng |
| Cache kết quả phục vụ nhầm người | Lược `dto.columns` **trước** khi dựng cache key |
| Mẫu đã lưu 400 vì `assertKnownColumns` | Lược request thay vì lược kết quả |

## Definition of done
- [x] AC-12, AC-13, AC-14 pass
- [x] Không dùng heuristic tên cột; mọi cột tiền khai tường minh
- [x] Demoed và chấp nhận ở G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description
