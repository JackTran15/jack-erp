---
id: UOW-09
slug: retire-js-filter-layer
title: Xoá tầng lọc JS của miền kho và khoá lại bằng test hồi quy
demoable: true
duration: 1d
depends_on: [UOW-02, UOW-03, UOW-04, UOW-05, UOW-06, UOW-07, UOW-08, UOW-10]
requirements: [US-01]
verifies: [AC-01, AC-22, AC-23]
risk: low
status: todo
rollback: revert một lượt; đây là dọn dẹp, không đổi hành vi
---

# UOW-09 — Xoá tầng lọc JS của miền kho và khoá lại bằng test hồi quy

## Demo script

1. Mở lần lượt cả bảy báo cáo kho trên tổ chức 74515 dòng → cả bảy lên trang 1, không cái nào 400
2. Chạy `grep -rn 'assertUnderRowCap\|MAX_REPORT_ROWS' apps/api/src/modules/inventory-reports/report/reports/` → không kết quả
3. Mở màn hình báo cáo kho cũ (đường GET) → số liệu không đổi
4. `pnpm --filter @erp/api test` xanh trọn vẹn

## In scope

- Xoá `applyColumnFilters` / `paginateRows` / `buildTotalsRow` khỏi `report-data.util.ts` nếu không còn ai gọi
- Gỡ re-export `assertUnderRowCap` / `MAX_REPORT_ROWS` khỏi `report-data.util.ts`
- Test hồi quy quét `report/reports/` khẳng định không định nghĩa nào còn tham chiếu trần
- E2E bảy báo cáo trên fixture vượt trần

## Not in scope

- `row-cap.util.ts` — trần vẫn sống và vẫn đúng chỗ cho đường export

## Risks

| Risk | Mitigation |
|---|---|
| Một helper có thể còn được báo cáo ngoài miền kho dùng | Xoá theo kết quả grep thật, không theo trí nhớ; done-when là `tsc` sạch |

## Definition of done

- [x] Bảy báo cáo trả 200 trên tổ chức 74515 dòng
- [x] Test hồi quy trần xanh
- [x] `tsc` sạch, `pnpm --filter @erp/api test` xanh
- [ ] Demo được nghiệm thu ở gate G4
