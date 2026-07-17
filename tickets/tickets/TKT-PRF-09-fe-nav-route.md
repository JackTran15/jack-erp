# TKT-PRF-09 FE nav + route "/reports/profit"

## Epic

[EPIC-16072026 Báo cáo lợi nhuận (Profit Reports)](../epics/EPIC-16072026-profit-reports.md)

## Summary

Bật category "Lợi nhuận" đang bị comment out trong `REPORT_CATEGORY_METADATA` + thêm route
trong `App.tsx`. Sidebar tự sinh từ metadata nên không cần sửa `navConfig.ts` thủ công.

## Deliverables

- File chứa `REPORT_CATEGORY_METADATA` (nơi có block comment
  `// [REPORT_CATEGORY.PROFIT]: { label: "Lợi nhuận", url: "/reports/profit" }`) —
  uncomment, điền `configs[STORE_TYPE.SINGLE]`/`configs[STORE_TYPE.CHAIN]` với `listReport`
  = 3 report type key mới (`PROFIT_BY_ITEM`, `GROSS_PROFIT_BY_INVOICE`,
  `BUSINESS_RESULTS`).
- `apps/backoffice-web/src/App.tsx` — thêm
  `<Route path="/reports/profit" element={<ReportPage category={REPORT_CATEGORY.PROFIT} />} />`
  (theo đúng mẫu route SALES/INVENTORY/DEBTS hiện có).

## Acceptance Criteria

- [ ] Sidebar hiển thị mục "Lợi nhuận" dưới nhóm Báo cáo (không cần sửa `navConfig.ts`).
- [ ] Truy cập `/reports/profit` render đúng `ReportPage`, dialog "Chọn báo cáo" liệt kê đủ
      3 báo cáo.
- [ ] Permission check: user không có `reporting.profit.read` không thấy mục nav (nếu nav
      filter theo permission giống các category khác — áp dụng nhất quán với debt-reports).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Test thủ công qua preview: click sidebar → vào đúng trang, đủ 3 báo cáo trong
      dropdown.

## Tech Approach

Chỉ uncomment + set giá trị, không tạo component mới — `ReportPage` đã hoàn toàn generic.

## Testing Strategy

- Test thủ công qua `preview_start` + `preview_click`/`preview_snapshot`.

## Dependencies

- Depends on: TKT-PRF-08.
- Blocks: TKT-PRF-11.
