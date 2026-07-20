# TKT-DBT-10 FE nav + route "/reports/debts"

## Epic

[EPIC-15072026 Báo cáo công nợ (Debt Reports)](../epics/EPIC-15072026-debt-reports.md)

## Summary

Bật category "Công nợ" đang bị comment out trong `REPORT_CATEGORY_METADATA` +
thêm route trong `App.tsx`. Sidebar tự sinh từ metadata nên không cần sửa
`navConfig.ts` thủ công.

## Deliverables

- File chứa `REPORT_CATEGORY_METADATA` (nơi có block comment
  `// [REPORT_CATEGORY.DEBTS]: { label: "Công nợ", url: "/reports/debts" }`) —
  uncomment, điền `configs[STORE_TYPE.SINGLE]`/`configs[STORE_TYPE.CHAIN]` với
  `listReport` = 4 report type key mới (`CUSTOMER_DEBTS`,
  `RECEIVABLES_DETAIL_BY_PRODUCT`, `SUPPLIER_DEBTS`,
  `SUPPLIER_DEBTS_DETAIL_BY_DOCUMENT_AND_PRODUCT`).
- `apps/backoffice-web/src/App.tsx` — thêm
  `<Route path="/reports/debts" element={<ReportPage category={REPORT_CATEGORY.DEBTS} />} />`
  (theo đúng mẫu route SALES/INVENTORY hiện có).

## Acceptance Criteria

- [ ] Sidebar hiển thị mục "Công nợ" dưới nhóm Báo cáo (không cần sửa
      `navConfig.ts` — xác nhận qua khảo sát: nav tự sinh từ
      `REPORT_CATEGORY_METADATA`).
- [ ] Truy cập `/reports/debts` render đúng `ReportPage`, dialog "Chọn báo cáo"
      liệt kê đủ 4 báo cáo (không có 2 báo cáo ngoài phạm vi: "Công nợ đối tác
      giao hàng", "Tổng hợp công nợ phải thu theo tuổi nợ" — vì chúng chưa có
      registry/backendKey nên không được đưa vào `listReport`).
- [ ] Permission check: user không có `reporting.debts.read` không thấy mục nav
      (nếu nav filter theo permission giống các category khác — xác nhận pattern
      hiện có khi implement, áp dụng nhất quán).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Test thủ công qua preview: click sidebar → vào đúng trang, đủ 4 báo cáo
      trong dropdown.

## Tech Approach

Chỉ uncomment + set giá trị, không tạo component mới — `ReportPage` đã hoàn toàn
generic (đã xác nhận qua khảo sát mã nguồn).

## Testing Strategy

- Test thủ công qua `preview_start` + `preview_click`/`preview_snapshot`.

## Dependencies

- Depends on: TKT-DBT-09.
- Blocks: TKT-DBT-11.
