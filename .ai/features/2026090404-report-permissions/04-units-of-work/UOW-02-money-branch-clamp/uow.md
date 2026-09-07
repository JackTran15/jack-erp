---
id: UOW-02
slug: money-branch-clamp
title: Báo cáo tiền kẹp theo cửa hàng được gán
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-06, AC-07, AC-08, AC-09]
risk: high
status: done
rollback: revert commit — không có thay đổi schema, chỉ là điều kiện truy vấn
---

# UOW-02 — Báo cáo tiền kẹp theo cửa hàng được gán

## Demo script
1. Đăng nhập quản lý chi nhánh (`bm.verify@erp.local`, được gán 4 cửa hàng)
2. Chạy "Lợi nhuận theo mặt hàng", Cửa hàng = Tất cả → ghi lại số dòng và tổng
3. Đăng nhập quản trị hệ thống (`adminmt@gmail.com`), chạy y hệt → số phải lớn hơn
4. Quay lại quản lý chi nhánh, chọn một cửa hàng ngoài 4 cửa hàng được gán → 403
5. Lặp bước 4 với "Công nợ nhà cung cấp" → cũng 403 (trước đây ra số liệu)

## In scope
- `resolveReportBranchIds` thay `resolveBranchIds`, sàn là `actor.branchIds`
- Key consolidated riêng cho từng domain; profit thôi mượn key của invoice
- Kẹp cả 4 báo cáo công nợ, kể cả số dư đầu kỳ

## Not in scope
- Báo cáo kho (UOW-03) — ngược chiều, cố tình org-wide

## Risks
| Risk | Mitigation |
| --- | --- |
| Đổi con số công nợ đang chạy (A-05) | Báo trước khi code; cập nhật `docs/24-debt-reports-spec.md` kèm ngày và lý do |
| Kẹp thân bút toán mà quên số dư đầu kỳ → số dư luỹ kế sai | Kẹp theo chi nhánh *phát sinh nợ* (`debt.branchId`) ở cả hai vế, khoá bằng spec |
| Vai trò đang giữ key consolidated của invoice bị mất tầm nhìn profit | Migration cấp bù (T-05-01) |

## Definition of done
- [x] AC-06..09 pass
- [x] `resolveBranchIds` không còn caller nào
- [x] Ma trận phạm vi có spec: {assigned, consolidated} × {no store, all, group, legacy}
- [x] Demoed và chấp nhận ở G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description
