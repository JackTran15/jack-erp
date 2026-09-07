---
id: UOW-06
slug: frontend-surface
title: Giao diện phản ánh đúng quyền được cấp
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-01]
verifies: [AC-01, AC-04, AC-05]
risk: low
status: done
rollback: revert commit — không có state phía server
---

# UOW-06 — Giao diện phản ánh đúng quyền được cấp

## Demo script
1. Đăng nhập Nhân viên kho → menu Báo cáo vẫn có "Bán hàng" và "Kho"
2. Mở "Bán hàng", bấm "Chọn báo cáo" → ô Báo cáo chỉ có một mục
3. Vào `/role-management`, mở một vai trò → section "Báo cáo" tách thành 5 trang:
   Bán hàng / Kho / Công nợ / Lợi nhuận / Chung
4. Cuộn danh sách trái trong dialog → "Thông tin cơ bản" và "PHÂN QUYỀN" đứng yên

## In scope
- Lọc dropdown theo quyền + empty state
- Menu/route hiện khi có bất kỳ báo cáo con nào được cấp
- Role editor: tách section Báo cáo thành 5 trang
- Dialog vai trò: chỉ hai pane cuộn, không cuộn cả dialog

## Not in scope
- Ẩn cột giá trị — server đã lược khỏi catalogue, client tự theo (UOW-04)

## Risks
| Risk | Mitigation |
| --- | --- |
| 25 khóa mới đổ vào một bức tường card phẳng | `MODULE_PAGES.reporting` chia 5 trang khớp menu ứng dụng |
| Report type chưa có backend bị lọc mất | Type không có khóa quyền thì giữ nguyên — nó vô hại |

## Definition of done
- [x] AC-01, AC-04, AC-05 pass
- [x] `npx tsc --noEmit` xanh ở backoffice-web
- [x] Demoed và chấp nhận ở G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description
