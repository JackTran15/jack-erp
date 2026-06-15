# TKT-RBI-02 BE: column registry + group-and-sum aggregator

## Epic

[EPIC-15062026 Doanh thu theo mặt hàng](../epics/EPIC-15062026-revenue-by-item-report.md)

## Summary

Registry cột phẳng `revenue-by-item.columns.ts` (cột chiều + đo lường, có `classification`) + aggregator thuần `revenue-by-item.aggregator.ts`: **gộp dòng hàng theo key động** (item/group/brand), **cộng dồn** đo lường, tính `revenue.promoRate`, build cell/row/totals. Tách hẳn 3 registry/aggregator cũ. Aggregator pure (test được, không chạm DB).

## Deliverables

- `apps/api/src/modules/reporting/invoice-report/revenue-by-item.columns.ts` — `REVENUE_BY_ITEM_COLUMNS: RevenueByItemColumnDef[]` + `isKnownRevenueByItemColumn` + `getRevenueByItemColumnDef`.
- `apps/api/src/modules/reporting/invoice-report/revenue-by-item.aggregator.ts` — `RevenueByItemRowInput` (1 dòng hàng đã inline metadata) + `aggregateByItem(rows, groupBy)` → `ItemGroupAggregate[]` + `itemGroupCellValue` + `buildItemGroupRow` + `buildItemGroupTotals`.

## Acceptance Criteria

- [ ] Catalog phẳng (`group: null`, `desc: null`), thứ tự MISA: cột chiều (`sku`,`itemName`,`itemCategory`,`brand`,`unit`) → đo lường (`quantity`,`revenue.goods`,`revenue.discount`,`revenue.total`,`revenue.promoRate`,`revenue.promoPoints`).
- [ ] `aggregateByItem`: gom theo `keyOf(row, groupBy)` — `item`→`itemId`, `group`→`categoryId`, `brand`→`brand`; cộng `quantity`, `goods (Σ qty×unitPrice)`, `discount (Σ lineDiscount)`, `total (Σ lineTotal)`; `promoRate = goods>0 ? round2(discount/goods×100) : 0`; sort theo `itemName` (vi locale) ổn định.
- [ ] **Cột chiều đổi nghĩa theo groupBy:** `item`→`sku=itemCode,itemName=itemName,unit,brand,itemCategory`; `group`→`itemName=categoryName, sku/unit/brand=null`; `brand`→`itemName=brand, sku/unit/itemCategory=null`.
- [ ] `revenue.promoPoints` = placeholder `0` (chưa có backing theo dòng). `unitPrice` KHÔNG nằm trong catalog (vô nghĩa khi gộp).
- [ ] `buildItemGroupTotals`: chỉ cộng cột NUMBER/CURRENCY; `revenue.promoRate` (PERCENT) **không** cộng ở footer (để null hoặc tính lại từ tổng — chốt: để null, mirror `NON_SUMMABLE`).
- [ ] Pure: không import repo/Nest; test bằng input dựng tay.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` (unit aggregator) + `lint` xanh.
- [ ] Không Vietnamese trong source. Tách biệt 3 registry/aggregator cũ (không sửa chúng).

## Tech Approach

```ts
// revenue-by-item.aggregator.ts
import { ReportGroupBy } from '@erp/shared-interfaces';

export interface RevenueByItemRowInput {
  itemId: string | null;
  itemCode: string | null;   // sku
  itemName: string;
  itemCategory: string | null;
  brand: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  lineTotal: number;
}

export interface ItemGroupAggregate {
  key: string;                // groupBy key value
  sku: string | null;
  name: string;               // dimension display name
  itemCategory: string | null;
  brand: string | null;
  unit: string | null;
  quantity: number;
  goods: number;              // Σ qty×unitPrice
  discount: number;           // Σ lineDiscount
  total: number;              // Σ lineTotal
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function aggregateByItem(
  rows: RevenueByItemRowInput[],
  groupBy: ReportGroupBy,
): ItemGroupAggregate[] {
  const byKey = new Map<string, ItemGroupAggregate>();
  for (const r of rows) {
    const { key, sku, name, unit, category, brand } = dimensionOf(r, groupBy);
    if (key === null) continue; // skip rows with no key for that grain (e.g. no brand)
    let agg = byKey.get(key);
    if (!agg) {
      agg = { key, sku, name, itemCategory: category, brand, unit,
              quantity: 0, goods: 0, discount: 0, total: 0 };
      byKey.set(key, agg);
    }
    agg.quantity += r.quantity;
    agg.goods += r.quantity * r.unitPrice;
    agg.discount += r.lineDiscount;
    agg.total += r.lineTotal;
  }
  return [...byKey.values()]
    .map((a) => ({ ...a, goods: round2(a.goods), discount: round2(a.discount),
                   total: round2(a.total), quantity: round2(a.quantity) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}
```

> `dimensionOf` map groupBy → `{key, sku, name, unit, category, brand}` (group: key=categoryId, name=categoryName; brand: key=brand, name=brand). `itemGroupCellValue(col, agg, groupBy?)` map từng cột → giá trị (promoRate computed, promoPoints=0).

## Testing Strategy

- Unit (`revenue-by-item.aggregator.spec.ts`): 3 groupBy, cộng dồn nhiều dòng cùng item, promoRate, null-key skip, totals footer.

## Dependencies

- Depends on: TKT-RBI-01 (enum + nhãn cột)
- Blocks: TKT-RBI-03, TKT-RBI-05
