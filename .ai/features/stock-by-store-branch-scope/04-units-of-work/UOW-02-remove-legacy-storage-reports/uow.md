---
id: UOW-02
slug: remove-legacy-storage-reports
title: Gỡ bỏ đường báo cáo kho legacy không có chốt chặn chi nhánh
demoable: true
duration: 1d
depends_on: []
requirements: [US-03]
verifies: [AC-07]
risk: medium
status: todo
rollback: `git revert` — không có migration, không có dữ liệu nào bị chạm
---

# UOW-02 — Gỡ bỏ đường báo cáo kho legacy

## Demo script
1. Đăng nhập backoffice, vào Báo cáo → Kho → mở lần lượt cả 8 báo cáo, mỗi cái bấm
   **Lấy dữ liệu** → chạy như trước (đường v2 không bị chạm)
2. Gõ thẳng `/reports/storage/stock-by-branch` lên thanh địa chỉ → không còn bảng báo cáo cũ
3. `curl -i "$API/reports/inventory/stock-by-branch"` → 404
4. Mở `/docs` → không còn nhóm endpoint `GET /reports/inventory/*`

## In scope
- Backend: `InventoryReportsController`, `InventoryReportsService`, DTO riêng của chúng, spec
  đi kèm, khai báo trong module
- Frontend: 8 trang `pages/reports/storage/*`, `_shared/`, `dynamic-store-view.tsx`,
  `page-registry.constant.tsx`, `useResolvedComponent`, `use-inventory-reports`,
  `use-report-filter-options`, `api/inventory-reports.ts`, 8 route trong `App.tsx`
- Hợp đồng: regenerate `openapi.snapshot.json` + `packages/api-client`
- Tài liệu: `docs/22-inventory-reports-views.md`, `docs/23-inventory-reports-test-guide.md`

## Not in scope
- Bất kỳ thay đổi hành vi nào của đường v2 (`POST /reports/inventory/search`)
- Các service engine dùng chung: `StockPeriodService`, `StockBalancePivotService`,
  `TransferReportService`, `DocumentDetailService`, `TempWarehouseReportService`,
  `date-range-resolver`, `report-column-filter.dto.ts` — v2 vẫn dùng, **giữ nguyên**

## Risks
| Risk | Mitigation |
|---|---|
| `PERIOD_PRESETS` / `PeriodPresetLiteral` nằm nhờ trong DTO sắp xoá, v2 vẫn import (A-06) | T-02-01 tách ra trước, là ticket chặn T-02-02 |
| Import mồ côi sau khi xoá ~15 file | `pnpm build` cho cả hai app + grep từng đường dẫn đã xoá, ghi trong done-when |
| Có client ngoài gọi endpoint legacy (A-03) | Đã grep toàn monorepo: chỉ `api/inventory-reports.ts`. Người dùng đã xác nhận xoá hẳn |

## Phạm vi `verifies:` ở đây là "chứng minh được bằng trình duyệt"

Ticket giữ đủ AC-06..AC-08. Frontmatter chỉ liệt kê AC-07 (trang legacy rơi vào 404) vì đó là
điều duy nhất trình duyệt thấy được:

- **AC-06** (8 endpoint `GET /reports/inventory/*` trả 404) — kiểm bằng `curl` trên :4000 và bằng
  diff của `openapi.snapshot.json` (xoá đúng 8 path, không thêm path nào).
- **AC-08** (`PERIOD_PRESETS` vẫn dùng được sau khi xoá DTO) — kiểm bằng `pnpm build`.

## Definition of done
- [x] AC-06, AC-07, AC-08 pass
- [x] `pnpm build` xanh; `test` 3506 pass (2 lỗi TTL trong auth.service.spec.ts có sẵn trên HEAD)
- [x] `grep -rn "reports/storage\|inventory-reports.service\|use-inventory-reports" apps/` rỗng
- [x] `openapi.snapshot.json` và `packages/api-client/src/generated/schema.ts` đã commit
- [x] Demoed và accepted ở G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
