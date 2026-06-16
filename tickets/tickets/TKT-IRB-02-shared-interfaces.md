# TKT-IRB-02 Shared: contract descriptor+cell (headers/dataRaw/totals) + nhãn VI + shape search/template

## Epic

[EPIC-11062026 Báo cáo tổng hợp bán hàng theo ngày](../epics/EPIC-11062026-invoice-report-builder.md)

## Summary

Định nghĩa toàn bộ kiểu dữ liệu dùng chung giữa BE và FE trong `@erp/shared-interfaces`: **response contract dạng descriptor + cell-array** (`ReportColumnHeader` cho header 2 tầng band, `ReportCell` cho ô tự mô tả, `dataRaw: ReportCell[][]` + `totals`), **rich** `ReportColumnDataType`, **nhãn tiếng Việt của cột cố định** (giữ tiếng Việt ngoài source backend, đúng tiền lệ `PERMISSION_LABELS_VI`), shape request search, và shape template. Không có Vietnamese trong backend; nhãn VI cột cố định sống ở package shared này (nhãn cột động lấy từ `PaymentAccountEntity.label`).

## Deliverables

- `packages/shared-interfaces/src/invoice-report/column.ts`:
  - `enum ReportColumnDataType { STRING='string', NUMBER='number', CURRENCY='currency', PERCENT='percent', DATE='date', DATETIME='datetime', ENUM='enum', BOOLEAN='boolean' }` (rich — phân biệt currency/percent để FE format `vi-VN` đúng).
  - `interface ReportColumnGroup { id: string; name: string }` — band header (`{ id:'revenue', name:'Doanh thu' }`, `{ id:'customerPayment', name:'Khách hàng thanh toán' }`).
  - `interface ReportColumnHeader { col: string; name: string | null; desc: string | null; type: ReportColumnDataType; group: ReportColumnGroup | null }` — `group:null` cho cột không band (`date`, `actualRevenue`); `desc` mang công thức/sub-label (`"(13)=(1)-(11)-(12)"`).
  - `const INVOICE_REPORT_COLUMN_LABELS_VI: Record<string, string>` — nhãn VI cho **mọi key cố định** của registry (vd `'date':'Ngày'`, `'actualRevenue':'Thực thu'`, `'revenue.goods':'Tiền hàng'`, `'revenue.total':'Tổng'`, `'revenue.promoRate':'Tỷ lệ KM (%)'`, `'payment.voucher':'Voucher'`…). **Không** chứa key động `*.method.<id>` (nhãn động từ `PaymentAccountEntity.label`).
  - `const INVOICE_REPORT_COLUMN_DESCS: Record<string, string>` (tùy chọn) — công thức/sub-label cố định (`'actualRevenue':'(13)=(1)-(11)-(12)'`, `'revenue.total':'(1)=(3)+(4)-(5)-(14)'`…). Có thể gộp vào registry BE thay vì shared — chốt ở TKT-03.
- `packages/shared-interfaces/src/invoice-report/column.ts` (tiếp): `interface InvoiceReportColumnsResult { headers: ReportColumnHeader[] }` — response của **API columns** (chỉ headers = toàn bộ catalog; không kèm dữ liệu).
- `packages/shared-interfaces/src/invoice-report/search.ts`:
  - Filter **scope** (pre-aggregate): `interface InvoiceReportFilterPayload { issuedAt: DateRangeFilter; status?: EnumFilter; type?: EnumFilter; branchId?: string }` (tái dùng filter type shared sẵn có; `issuedAt` **bắt buộc** — aggregate theo ngày cần khoảng ngày).
  - Filter **per-cột** (post-aggregate): `interface ColumnFilter { col: string; eq?: number | string; lt?: number; lte?: number; gt?: number; gte?: number; from?: string; to?: string }` — mirror shape `CompareFilter`/`DateRangeFilter`, áp lên giá trị đã tổng hợp theo ngày của `col`. *(Filter row trong ảnh: `=` cho `date`, `≤`/`≥`/`=` cho cột tiền — kể cả cột computed/động.)*
  - `interface InvoiceReportSearchPayload { columns: string[]; filters: InvoiceReportFilterPayload; columnFilters?: ColumnFilter[]; branchId?: string; page?: number; limit?: number }`
  - `type ReportCellValue = string | number | null` (Date serialize → ISO string).
  - `interface ReportCell { col: string; type: ReportColumnDataType; value: ReportCellValue }`
  - `type ReportDataRow = ReportCell[]` (một dòng = một ngày).
  - `interface InvoiceReportResult { dataRaw: ReportDataRow[]; totals: ReportCell[] | null; total: number; page: number; limit: number }` — response của **API search**, **KHÔNG** có `headers` (FE lấy từ API columns). `totals` = dòng tổng footer (tính trên dòng sau filter). Mỗi cell tự mô tả nên FE render được mà không cần re-join headers.
- `packages/shared-interfaces/src/invoice-report/template.ts` (template lưu cả scope filter + per-column filter để dựng lại y nguyên):
  - `interface InvoiceReportTemplateView { id: string; name: string; description?: string | null; columns: string[]; filters: InvoiceReportFilterPayload; columnFilters?: ColumnFilter[]; sortOrder: number; createdAt: string; updatedAt: string }`
  - `interface InvoiceReportTemplatePayload { name: string; description?: string; columns: string[]; filters?: InvoiceReportFilterPayload; columnFilters?: ColumnFilter[]; sortOrder?: number }`
  - *(Lưu trong cột `filters` jsonb của entity dưới dạng `{ ...scopeFilters, columnFilters }` — không cần thêm cột; `InvoiceReportFilterPayload`/`ColumnFilter` import từ `search.ts`.)*
- `packages/shared-interfaces/src/index.ts` — export 3 file trên (barrel).

## Acceptance Criteria

- [ ] `INVOICE_REPORT_COLUMN_LABELS_VI` có key khớp **đúng** tập cột **cố định** của registry BE (TKT-03) — không thiếu/thừa key (test đối chiếu ở TKT-09). Không chứa key động.
- [ ] `ReportColumnDataType` có đủ `currency`/`percent`/`date`/`datetime` (FE phân biệt format `vi-VN`).
- [ ] Không type nào trùng/định nghĩa lại shape đã có trong `@erp/shared-interfaces` (filter type tái dùng nếu có sẵn).
- [ ] Package build sạch: `pnpm --filter @erp/shared-interfaces build` (postinstall build:shared).

## Definition of Done

- [ ] `pnpm build:shared` (hoặc `pnpm --filter @erp/shared-interfaces build`) xanh; BE + FE import được.
- [ ] Chỉ nhãn cột cố định là tiếng Việt (ở shared package); type/identifier tiếng Anh.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

```ts
// column.ts — descriptor cho header 2 tầng
export enum ReportColumnDataType {
  STRING = 'string', NUMBER = 'number', CURRENCY = 'currency', PERCENT = 'percent',
  DATE = 'date', DATETIME = 'datetime', ENUM = 'enum', BOOLEAN = 'boolean',
}
export interface ReportColumnGroup { id: string; name: string }
export interface ReportColumnHeader {
  col: string;                            // stable key: "date" | "revenue.total" | "payment.method.<paymentAccountId>"
  name: string | null;                    // VI label (cố định) hoặc PaymentAccount.label (động)
  desc: string | null;                    // formula/sub-label: "(13)=(1)-(11)-(12)"
  type: ReportColumnDataType;             // drives vi-VN format + alignment + filter widget
  group: ReportColumnGroup | null;        // band header; null = ungrouped (date, actualRevenue)
}

// column.ts — API columns trả riêng headers (toàn bộ catalog)
export interface InvoiceReportColumnsResult { headers: ReportColumnHeader[] }

// search.ts — API search trả riêng data (KHÔNG headers) + per-column filter
export type ReportCellValue = string | number | null;
export interface ReportCell { col: string; type: ReportColumnDataType; value: ReportCellValue }
export type ReportDataRow = ReportCell[];
export interface ColumnFilter {      // áp post-aggregate lên giá trị ngày của 1 cột
  col: string;
  eq?: number | string; lt?: number; lte?: number; gt?: number; gte?: number; from?: string; to?: string;
}
export interface InvoiceReportResult {
  dataRaw: ReportDataRow[];               // 1 dòng = 1 ngày
  totals: ReportCell[] | null;            // footer (sau filter)
  total: number; page: number; limit: number;
}
```

- Contract cố ý **self-describing per cell** (`type` đi kèm mỗi ô) theo quyết định clarifying — FE render không cần join header↔row theo key; `headers` chỉ để dựng band/colspan + thứ tự cột.
- `value` luôn primitive (`string | number | null`); ngày serialize ISO string ở BE để JSON ổn định.
- Nếu repo đã có `StringFilter`/`CompareFilter`/`DateRangeFilter`/`EnumFilter` trong shared (mirror của `common/filters/filter.dto.ts`), import lại; tránh tạo bản sao lệch.

## Testing Strategy

- Build-time type check (tsc) qua `build:shared`.
- Test đối chiếu key labels cố định ⟷ registry nằm ở TKT-IRB-09.

## Dependencies

- Depends on: — (độc lập; nhưng key labels phải khớp registry cố định TKT-03 → verify chéo ở TKT-09).
- Blocks: [TKT-IRB-03](./TKT-IRB-03-be-column-registry-catalog.md), [TKT-IRB-04](./TKT-IRB-04-be-cqrs-report-search.md), [TKT-IRB-05](./TKT-IRB-05-be-template-cqrs-crud.md), [TKT-IRB-07](./TKT-IRB-07-fe-data-layer.md).
