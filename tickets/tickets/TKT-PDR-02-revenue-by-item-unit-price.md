# TKT-PDR-02 BE: cột `unitPrice` (Đơn giá) cho revenue-by-item

## Epic

[EPIC-27072026 Báo cáo theo ngày (POS Daily Report)](../epics/EPIC-27072026-pos-daily-report.md)

## Summary

Thêm cột tính toán **Đơn giá** (`unitPrice`) vào report `revenue-by-item` để tab "Doanh thu theo mặt hàng" có cột Đơn giá (screenshot). Giá trị là bình quân gia quyền `goods / quantity` của dòng đã gộp; dòng tổng để `null` (đơn giá không cộng dồn). Additive — không đổi controller/DTO; cột đi qua `columns[]` request và catalog tự động.

## Deliverables

- `apps/api/src/modules/reporting/invoice-report/revenue-by-item.columns.ts` — mở rộng union `RevenueByItemSource` computed thành `'promoRate' | 'unitPrice'`; thêm column def `{ key: 'unitPrice', type: CURRENCY, source: { kind: 'computed', computed: 'unitPrice' } }` (đặt sau `quantity`, trước `revenue.goods` để khớp thứ tự màn hình); cập nhật comment "unitPrice intentionally absent".
- `apps/api/src/modules/reporting/invoice-report/revenue-by-item.aggregator.ts` — `itemGroupCellValue()`: nhánh `computed === 'unitPrice'` → `agg.quantity !== 0 ? round2(agg.goods / agg.quantity) : 0`. `buildItemGroupTotals()`: trả `null` cho cột `unitPrice` (dù type CURRENCY là summable) — thêm guard theo def computed.
- Specs: `revenue-by-item.columns` / `.aggregator` / `.report` spec (nếu có) cập nhật catalog length + assert giá trị `unitPrice` + totals null.

## Acceptance Criteria

- [ ] `GET /reports/invoices/columns?reportType=revenue-by-item` liệt kê `unitPrice` (nhãn "Đơn giá" từ `INVOICE_REPORT_COLUMN_LABELS_VI` đã có sẵn — không sửa shared-interfaces).
- [ ] `POST search` với `columns` gồm `unitPrice`: mỗi dòng `unitPrice = round2(goods/quantity)` (0 khi quantity=0); dòng tổng `unitPrice = null`.
- [ ] 3 grain (`item`/`group`/`brand`) vẫn hoạt động; các cột cũ không đổi giá trị (no-regress).

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- revenue-by-item` xanh (aggregator + report spec).
- [ ] `pnpm --filter @erp/api lint` xanh.
- [ ] Không đổi schema/migration; controller/DTO không đổi.
- [ ] No Vietnamese trong source backend.

## Tech Approach

```ts
// revenue-by-item.aggregator.ts — itemGroupCellValue()
case 'computed':
  if (def.source.computed === 'unitPrice')
    return agg.quantity !== 0 ? round2(agg.goods / agg.quantity) : 0;
  // promoRate — discount as a % of goods.
  return agg.goods > 0 ? round2((agg.discount / agg.goods) * 100) : 0;

// buildItemGroupTotals() — skip unitPrice from footer sum
const def = getRevenueByItemColumnDef(col);
const isUnitPrice = def?.source.kind === 'computed' && def.source.computed === 'unitPrice';
out[col] = summable && !isUnitPrice ? round2(...) : null;
```

## Testing Strategy

- Unit (`revenue-by-item.aggregator.spec.ts`): dòng có qty>0 → weighted avg; qty=0 → 0; totals null.
- Report spec: catalog chứa `unitPrice`, thứ tự cột đúng.

## Dependencies

- Depends on: —
- Blocks: TKT-PDR-04 (openapi), TKT-PDR-05 (FE TAB 2 hiển thị cột)
