---
id: UOW-01
slug: pivot-org-wide-scope
title: Báo cáo tồn kho theo cửa hàng hiện đủ mọi chi nhánh của tổ chức
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-02]
verifies: [AC-01, AC-02]
risk: high
status: todo
rollback: đưa `orgBranchesForPivot` / `resolveStoreScopeOrgWide` quay lại dùng `permittedBranchIds` — hai chỗ, một dòng mỗi chỗ
---

# UOW-01 — Báo cáo tồn kho theo cửa hàng hiện đủ mọi chi nhánh của tổ chức

ADR-04. Đây là **nới** quyền đọc, không phải siết — đọc ADR-04 trước khi sửa.

## Demo script
1. Đăng nhập bằng `bm.verify@erp.local` (Quản lý chi nhánh, gán 2/15 chi nhánh của org MT)
2. Báo cáo → Kho → *Số lượng tồn kho theo cửa hàng* → **Lấy dữ liệu**
3. Thấy **đủ 15 cột chi nhánh**, tổng **263.340** — gồm cả chi nhánh tài khoản KHÔNG được gán
4. Lặp lại với `wh.verify@erp.local` (Nhân viên kho) → kết quả giống hệt
5. Mở *Tổng hợp nhập xuất tồn kho theo cửa hàng* bằng cùng tài khoản → phạm vi **không** đổi
   (chứng minh việc nới không lan sang báo cáo khác)

## In scope
- `StockByStorePivotReport`: cột động, dữ liệu, dòng tổng, đường đếm cho xuất khẩu
- Hàm phân giải phạm vi **riêng cho báo cáo này** trong `report-scope.util.ts`

## Not in scope
- `permittedBranchIds` / `resolveInventoryBranchIds` — 4 report definition khác đang dùng, **không sửa**
- 7 báo cáo kho còn lại
- Ranh giới `organizationId` — giữ nguyên tuyệt đối

## Risks
| Risk | Mitigation |
|---|---|
| Nới lan sang báo cáo khác | Hàm phân giải riêng, không đụng helper dùng chung; AC-09 kiểm hồi quy |
| Rò dữ liệu xuyên tổ chức | `organizationId` vẫn truyền ở mọi truy vấn; test AC-03 giữ |
| Quyết định ngược câu chữ PQ-02 của khách | Ghi vào 00-intent.md + checklist khách; ADR-04 nêu cách đảo chiều |

## Definition of done
- [x] AC-01, AC-02, AC-03, AC-04, AC-05, AC-09 pass
- [x] `pnpm --filter @erp/api test -- stock-by-store-pivot.report.spec.ts` xanh
- [x] `permittedBranchIds` và `resolveInventoryBranchIds` không đổi một ký tự
- [x] Không file frontend nào bị sửa trong UoW này
- [x] Demoed và accepted ở G4 kèm ảnh chụp từ `/ai-dlc-verify`

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
