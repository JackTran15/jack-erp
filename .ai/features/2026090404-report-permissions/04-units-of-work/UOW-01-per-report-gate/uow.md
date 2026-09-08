---
id: UOW-01
slug: per-report-gate
title: Mỗi báo cáo một quyền, gác được ở API
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-02, AC-03, AC-18]
risk: medium
status: done
rollback: gỡ ReportPermissionGuard khỏi @UseGuards của 4 controller — quyền nhóm vẫn gác như cũ
---

# UOW-01 — Mỗi báo cáo một quyền, gác được ở API

## Demo script
1. Đăng nhập bằng vai trò Nhân viên kho (`wh.verify@erp.local`)
2. Gọi `POST /reports/invoices/search` với `reportType: "daily-sales-summary"`
   → 403, thông điệp nêu đúng `reporting.sales.daily-sales-summary.read`
3. Gọi lại với `reportType: "revenue-by-item"` → 200
4. Gọi với `reportType: "khong-ton-tai"` → 400 `Unknown report type`, không phải 403

## In scope
- Catalogue khóa dùng chung, nhãn tiếng Việt, seed 25 khóa mới
- `ReportPermissionGuard` + gắn vào 4 controller registry-driven
- Vá lỗ hổng: template CRUD của `/reports/invoices` trước đây không gác gì

## Not in scope
- Phạm vi cửa hàng (UOW-02, UOW-03)
- Lọc dropdown phía client (UOW-06)

## Risks
| Risk | Mitigation |
| --- | --- |
| Ba nguồn khóa trôi khỏi nhau (catalogue / nhãn / seed) | Một catalogue duy nhất ở shared-interfaces; spec hợp đồng ở T-05-03 khoá lại |
| Gác nhầm làm 403 báo cáo hợp lệ | `reportType` lạ hoặc vắng thì guard cho đi tiếp, không tự ý từ chối |

## Definition of done
- [x] AC-02, AC-03, AC-18 pass
- [x] `pnpm --filter @erp/api test -- report-permission.guard` xanh
- [x] Không endpoint báo cáo nào còn `@RequirePermission` bị comment out
- [x] Demoed và chấp nhận ở G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description
