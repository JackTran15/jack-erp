# TKT-IOL-02 BE: Registry cột per-invoice + aggregator/row-builder (JS) + classification

## Epic

[EPIC-14062026 Bảng kê hóa đơn và đơn hàng](../epics/EPIC-14062026-invoice-order-listing-report.md)

## Summary

Tạo registry cột **per-invoice** riêng cho report `invoice-order-listing` và builder dựng **một dòng / một hóa đơn** trong JS. Tách hoàn toàn khỏi `invoice-report.columns.ts` / `invoice-report.aggregator.ts` (per-day, phục vụ `daily-sales-summary`) để không regress. Mỗi cột mang `classification` (BACKED / DERIVED / PLACEHOLDER) để builder biết lấy/derive/trả 0-null.

## Deliverables

- `apps/api/src/modules/reporting/invoice-report/invoice-listing.columns.ts` (mới) — `INVOICE_LISTING_COLUMNS: ListingColumnDef[]` (whitelist cố định theo bảng classification trong epic), `ReportListingBandId = 'revenue' | 'customerPayment' | 'platform'`, helper `isKnownListingColumn(key)`, `getListingColumnDef(key)`, `isAcceptedListingColumn(key)` (cố định ∪ động `payment.method.<id>`). Tái dùng `dynamicColumnKey`/`parseDynamicColumnKey`/`isDynamicColumnKey` từ `invoice-report.columns.ts`.
- `apps/api/src/modules/reporting/invoice-report/invoice-listing.aggregator.ts` (mới) — input types per-invoice (`InvoiceRowInput` đã inline customer/branch/employee + `PaymentRowInput` + `PromotionRowInput`), `buildInvoiceRow(columns, ctx)` → `ReportCell[]`, `buildListingTotals(columns, rows)` → `ReportCell[]` (chỉ cộng cột tiền; cột string/enum/date → null ở totals), `listingCellValue(col, ctx)`. Tái dùng `matchColumnFilter` từ `invoice-report.aggregator.ts`.
- `apps/api/src/modules/reporting/invoice-report/invoice-listing.columns.spec.ts` + `invoice-listing.aggregator.spec.ts` (mới).

## Acceptance Criteria

- [ ] `INVOICE_LISTING_COLUMNS` khai báo **đủ** cột MISA trong epic, đúng `group` (band) + `type` + `classification`.
- [ ] `isAcceptedListingColumn` true cho key cố định ∈ registry và key động `payment.method.<uuid>` hợp lệ; false cho key lạ.
- [ ] `listingCellValue`: BACKED lấy đúng field/aggregate; DERIVED tính đúng (`revenue.total`, `revenue.promoRate`, `payment.debt`); PLACEHOLDER trả `0` (currency) / `null` (string) **tất định**.
- [ ] `buildInvoiceRow` trả mảng cell theo đúng thứ tự `columns` truyền vào; mỗi cell `{ col, type, value }` tự mô tả.
- [ ] `buildListingTotals` cộng đúng cột currency/number trên tập rows; cột `date`/`time`/`status`/`invoiceCode`/string → `null`.
- [ ] Pivot payment: `payment.cash`=Σ amount method=cash; `payment.bankTransfer`=Σ method=bank_transfer; `payment.method.<id>`=Σ amount theo `accountId`. Voucher=Σ promotions type=voucher.
- [ ] Không đụng `invoice-report.columns.ts`/`invoice-report.aggregator.ts` (no regress daily-sales).

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- invoice-listing` xanh (specs columns + aggregator).
- [ ] `pnpm --filter @erp/api test -- invoice-report` vẫn xanh (daily-sales không regress).
- [ ] Không tiếng Việt trong source (nhãn ở shared-interfaces từ TKT-IOL-01).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

```ts
// invoice-listing.columns.ts
export type ListingClassification = 'backed' | 'derived' | 'placeholder';
export type ListingBandId = 'revenue' | 'customerPayment' | 'platform';

export type ListingSource =
  | { kind: 'invoiceField'; field: 'issuedAtDate' | 'issuedAtTime' | 'code' | 'status'
      | 'subtotal' | 'discountAmount' | 'pointsDiscountAmount' | 'totalPaid' | 'note' }
  | { kind: 'cashPayments' } | { kind: 'bankTransferPayments' }
  | { kind: 'voucherPromotions' }
  | { kind: 'relation'; rel: 'customerName' | 'customerPhone' | 'cashier' | 'salesperson' | 'storeCode' }
  | { kind: 'computed'; computed: 'total' | 'promoRate' | 'debt' }
  | { kind: 'placeholder'; placeholder: 0 | null };

export interface ListingColumnDef {
  key: string;
  group: ListingBandId | null; // null = cột nền (date/time/invoiceCode/status)
  type: ReportColumnDataType;
  classification: ListingClassification;
  source: ListingSource;
}

export const INVOICE_LISTING_COLUMNS: ListingColumnDef[] = [
  { key: 'date',        group: null, type: ReportColumnDataType.DATE,   classification: 'backed',  source: { kind: 'invoiceField', field: 'issuedAtDate' } },
  { key: 'time',        group: null, type: ReportColumnDataType.STRING, classification: 'backed',  source: { kind: 'invoiceField', field: 'issuedAtTime' } },
  { key: 'invoiceCode', group: null, type: ReportColumnDataType.STRING, classification: 'backed',  source: { kind: 'invoiceField', field: 'code' } },
  { key: 'status',      group: null, type: ReportColumnDataType.ENUM,   classification: 'backed',  source: { kind: 'invoiceField', field: 'status' } },
  // band revenue (Doanh thu)
  { key: 'revenue.total',       group: 'revenue', type: ReportColumnDataType.CURRENCY, classification: 'derived',     source: { kind: 'computed', computed: 'total' } },
  { key: 'revenue.goods',       group: 'revenue', type: ReportColumnDataType.CURRENCY, classification: 'backed',      source: { kind: 'invoiceField', field: 'subtotal' } },
  { key: 'revenue.fee',         group: 'revenue', type: ReportColumnDataType.CURRENCY, classification: 'placeholder', source: { kind: 'placeholder', placeholder: 0 } },
  { key: 'revenue.discount',    group: 'revenue', type: ReportColumnDataType.CURRENCY, classification: 'backed',      source: { kind: 'invoiceField', field: 'discountAmount' } },
  { key: 'revenue.promoPoints', group: 'revenue', type: ReportColumnDataType.CURRENCY, classification: 'backed',      source: { kind: 'invoiceField', field: 'pointsDiscountAmount' } },
  { key: 'revenue.promoRate',   group: 'revenue', type: ReportColumnDataType.PERCENT,  classification: 'derived',     source: { kind: 'computed', computed: 'promoRate' } },
  // band customerPayment (Khách hàng thanh toán)
  { key: 'payment.voucher',        group: 'customerPayment', type: ReportColumnDataType.CURRENCY, classification: 'backed',      source: { kind: 'voucherPromotions' } },
  { key: 'payment.points',         group: 'customerPayment', type: ReportColumnDataType.CURRENCY, classification: 'backed',      source: { kind: 'invoiceField', field: 'pointsDiscountAmount' } },
  { key: 'payment.debt',           group: 'customerPayment', type: ReportColumnDataType.CURRENCY, classification: 'derived',     source: { kind: 'computed', computed: 'debt' } },
  { key: 'payment.collectOnBehalf',group: 'customerPayment', type: ReportColumnDataType.CURRENCY, classification: 'placeholder', source: { kind: 'placeholder', placeholder: 0 } },
  { key: 'payment.cash',           group: 'customerPayment', type: ReportColumnDataType.CURRENCY, classification: 'backed',      source: { kind: 'cashPayments' } },
  { key: 'payment.bankTransfer',   group: 'customerPayment', type: ReportColumnDataType.CURRENCY, classification: 'backed',      source: { kind: 'bankTransferPayments' } },
  { key: 'actualRevenue',          group: 'customerPayment', type: ReportColumnDataType.CURRENCY, classification: 'backed',      source: { kind: 'invoiceField', field: 'totalPaid' } },
  { key: 'payment.bankAccount',    group: 'customerPayment', type: ReportColumnDataType.STRING,   classification: 'placeholder', source: { kind: 'placeholder', placeholder: null } },
  { key: 'customer',               group: 'customerPayment', type: ReportColumnDataType.STRING,   classification: 'backed',      source: { kind: 'relation', rel: 'customerName' } },
  { key: 'customerPhone',          group: 'customerPayment', type: ReportColumnDataType.STRING,   classification: 'backed',      source: { kind: 'relation', rel: 'customerPhone' } },
  { key: 'salesChannel',           group: 'customerPayment', type: ReportColumnDataType.STRING,   classification: 'placeholder', source: { kind: 'placeholder', placeholder: null } },
  { key: 'cashier',                group: 'customerPayment', type: ReportColumnDataType.STRING,   classification: 'backed',      source: { kind: 'relation', rel: 'cashier' } },
  { key: 'salesperson',            group: 'customerPayment', type: ReportColumnDataType.STRING,   classification: 'backed',      source: { kind: 'relation', rel: 'salesperson' } },
  { key: 'note',                   group: 'customerPayment', type: ReportColumnDataType.STRING,   classification: 'backed',      source: { kind: 'invoiceField', field: 'note' } },
  { key: 'storeCode',              group: 'customerPayment', type: ReportColumnDataType.STRING,   classification: 'backed',      source: { kind: 'relation', rel: 'storeCode' } },
  // band platform (Doanh thu sàn TMĐT) — toàn placeholder v1
  { key: 'platform.fee',         group: 'platform', type: ReportColumnDataType.CURRENCY, classification: 'placeholder', source: { kind: 'placeholder', placeholder: 0 } },
  { key: 'platform.otherIncome', group: 'platform', type: ReportColumnDataType.CURRENCY, classification: 'placeholder', source: { kind: 'placeholder', placeholder: 0 } },
  { key: 'platform.revenue',     group: 'platform', type: ReportColumnDataType.CURRENCY, classification: 'placeholder', source: { kind: 'placeholder', placeholder: 0 } },
];
```

```ts
// invoice-listing.aggregator.ts (per-invoice — KHÔNG group-by ngày)
export interface InvoiceRowInput {
  id: string;
  issuedAt: Date;            // → date + time cells
  code: string;
  status: string;
  subtotal: number;
  discountAmount: number;
  pointsDiscountAmount: number;
  totalPaid: number;
  amountDue: number;         // cho computed 'debt'
  note: string | null;
  customerName: string | null;   // inline FK (feedback inline_relations_over_root_map)
  customerPhone: string | null;
  cashierLabel: string | null;
  salespersonLabel: string | null;
  storeCode: string | null;
  cash: number;              // pivot sẵn từ payments
  bankTransfer: number;
  voucher: number;
  byAccount: Record<string, number>; // payment.method.<accountId>
}

export function listingCellValue(col: string, r: InvoiceRowInput): ReportCellValue {
  const dyn = parseDynamicColumnKey(col);
  if (dyn) return r.byAccount[dyn.accountId] ?? 0;
  const def = getListingColumnDef(col);
  if (!def) return null;
  switch (def.source.kind) {
    case 'placeholder':     return def.source.placeholder;
    case 'cashPayments':    return r.cash;
    case 'bankTransferPayments': return r.bankTransfer;
    case 'voucherPromotions':    return r.voucher;
    case 'relation':        return relValue(def.source.rel, r);
    case 'invoiceField':    return invoiceFieldValue(def.source.field, r);
    case 'computed':
      if (def.source.computed === 'total')    return r.subtotal + 0 /*fee=0*/ - r.discountAmount - r.pointsDiscountAmount;
      if (def.source.computed === 'debt')     return DEBT_STATUSES.has(r.status) ? Math.max(r.amountDue - r.totalPaid, 0) : 0;
      return r.subtotal > 0 ? round2(((r.discountAmount + r.pointsDiscountAmount) / r.subtotal) * 100) : 0; // promoRate
  }
}
```

> Công thức `revenue.total` / `revenue.promoRate` / `payment.debt` ở trên là **giả định ban đầu** — **đối chiếu lại numbering MISA (ảnh #1: `(1)=(2)+(3)-(4)-(5)-(16)`)** khi làm TKT-03 và chốt `desc` tương ứng. `fee` hiện = 0 (placeholder) nên không ảnh hưởng `total`.

## Testing Strategy

- `invoice-listing.columns.spec.ts`: assert classification/group/type từng cột; `isAcceptedListingColumn` (cố định/động/lạ).
- `invoice-listing.aggregator.spec.ts`: từng `source.kind` (placeholder 0/null, cash/bank pivot, voucher, computed total/promoRate/debt, relation inline); `buildListingTotals` chỉ cộng cột tiền.

## Dependencies

- Depends on: TKT-IOL-01
- Blocks: TKT-IOL-03
