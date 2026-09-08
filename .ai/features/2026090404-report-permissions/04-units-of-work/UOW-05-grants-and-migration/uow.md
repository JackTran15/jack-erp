---
id: UOW-05
slug: grants-and-migration
title: Deploy không ai mất quyền, siết là bước riêng
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-05, US-02]
verifies: [AC-15, AC-16, AC-19]
risk: high
status: done
rollback: migration có down() — gỡ grant rồi gỡ khóa
---

# UOW-05 — Deploy không ai mất quyền

## Demo script
1. Trước migration: đếm quyền báo cáo của từng vai trò, ghi lại
2. `pnpm migration:run`
3. Truy vấn lại: mọi vai trò từng giữ `inventory.reports.read` nay có đủ 11 khóa
   báo cáo kho + khóa xem giá trị; vai trò giữ key consolidated của hóa đơn có
   thêm hai key consolidated mới
4. `pnpm seed:sync-admin-permissions` → SALES/CASHIER thu về đúng một báo cáo
   bán hàng. Đây là bước siết có chủ đích. Nhân viên kho **giữ** khóa xem giá trị,
   nên với vai trò này seed và migration ra cùng một kết quả.

## In scope
- Migration tự chứa: chèn khóa, cấp bù theo quyền nhóm đang giữ
- Seed vai trò: allow-list của quản lý chi nhánh, danh sách loại trừ consolidated
- Spec hợp đồng nối catalogue ↔ nhãn ↔ seed

## Not in scope
- Xóa 4 khóa nhóm cũ — chúng đổi vai trò thành "quyền mở nhóm", không bị bỏ

## Risks
| Risk | Mitigation |
| --- | --- |
| Bộ lọc quản lý chi nhánh là allow-list liệt kê tường minh — quên thêm prefix là mất sạch báo cáo mới | Spec hợp đồng khẳng định vai trò này giữ đủ 22 khóa |
| Migration chạy trước khi khóa tồn tại | Migration tự chèn khóa, không chờ `PermissionSyncService` (chạy ở bootstrap, tức sau migration) |
| Cache quyền 300s làm grant mới chưa có hiệu lực | Ghi vào tài liệu bàn giao; restart API hoặc chờ |

## Definition of done
- [x] AC-15, AC-16, AC-19 pass
- [x] Chạy thật trên `erp_dev`, đối chiếu số grant theo từng tổ chức và vai trò
- [x] Demoed và chấp nhận ở G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description
