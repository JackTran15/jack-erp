# TKT-RTC-01 shared-interfaces: ReportTemplateColumn + đổi type `columns`

## Epic

[EPIC-15062026 Cấu hình cột báo cáo theo template](../epics/EPIC-15062026-report-template-column-config.md)

## Summary

Thêm interface `ReportTemplateColumn` mô tả 1 cột đã cấu hình trong template, và đổi `columns: string[]` → `ReportTemplateColumn[]` ở `InvoiceReportTemplateView` + `InvoiceReportTemplatePayload`. Pure types — không runtime. Là contract dùng chung cho BE (DTO/handler/view) và (sau này) api-client/FE.

## Deliverables

- `packages/shared-interfaces/src/invoice-report/template.ts` — thêm `ReportTemplateColumn`; đổi field `columns` ở 2 interface.
- Export `ReportTemplateColumn` qua barrel của domain `invoice-report` nếu các interface khác được export ở đó (giữ đúng pattern export hiện tại của package).

## Acceptance Criteria

- [ ] `ReportTemplateColumn` có đủ 4 thuộc tính cấu hình + key: `col`, `displayName`, `visible`, `frozen`, `order`.
- [ ] `InvoiceReportTemplateView.columns` và `InvoiceReportTemplatePayload.columns` đều là `ReportTemplateColumn[]`.
- [ ] `pnpm --filter @erp/shared-interfaces build` xanh; type được re-export ra `@erp/shared-interfaces` (BE import được `ReportTemplateColumn`).
- [ ] Không đụng `InvoiceReportSearchPayload.columns` (vẫn `string[]`) — search không nằm trong scope.

## Definition of Done

- [ ] Build shared-interfaces xanh, không lỗi type ở consumer trong cùng PR (entity/DTO/handler sẽ cập nhật ở TKT-RTC-02/03).
- [ ] Không Vietnamese trong source (chỉ doc-comment English).

## Tech Approach

```ts
// packages/shared-interfaces/src/invoice-report/template.ts
import { ColumnFilter, InvoiceReportFilterPayload } from './search';

/** One configured column inside a saved report template. */
export interface ReportTemplateColumn {
  /** Catalog column key (fixed registry key or dynamic `payment.method.<coaAccountId>`). */
  col: string;
  /** User-renamed label; null ⇒ fall back to the catalog `name`. */
  displayName: string | null;
  /** Whether the column is emitted/rendered. Hidden columns are still stored. */
  visible: boolean;
  /** Sticky/pinned column flag (presentation-only passthrough). */
  frozen: boolean;
  /** 0-based position; server-assigned from array order. */
  order: number;
}

export interface InvoiceReportTemplateView {
  id: string;
  reportType: string;
  name: string;
  description?: string | null;
  columns: ReportTemplateColumn[]; // was string[]
  filters: InvoiceReportFilterPayload;
  columnFilters?: ColumnFilter[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceReportTemplatePayload {
  reportType: string;
  name: string;
  description?: string;
  columns: ReportTemplateColumn[]; // was string[]
  filters?: InvoiceReportFilterPayload;
  columnFilters?: ColumnFilter[];
  sortOrder?: number;
}
```

## Testing Strategy

- Type-only: `pnpm --filter @erp/shared-interfaces build`. Không unit test riêng.

## Dependencies

- Depends on: — (đầu chuỗi, song song với TKT-RTC-02)
- Blocks: TKT-RTC-03
