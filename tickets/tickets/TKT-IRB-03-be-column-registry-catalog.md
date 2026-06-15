# TKT-IRB-03 BE: Registry cột cố định + cột động (PaymentAccount pivot) + GetInvoiceReportColumnsQuery + route

## Epic

[EPIC-11062026 Báo cáo tổng hợp bán hàng theo ngày](../epics/EPIC-11062026-invoice-report-builder.md)

## Summary

Định nghĩa **registry cột tổng hợp cố định** `INVOICE_REPORT_SUMMARY_COLUMNS` (whitelist tiếng Anh, có cột computed) + helper, và query CQRS `GetInvoiceReportColumnsQuery` trả `headers`: cột cố định (merge nhãn VI + công thức `desc` từ `shared-interfaces`) **+ cột động** sinh runtime từ `PaymentAccountEntity` (active, scope org/branch) — một cột / một payment account, dưới 2 band `revenue` ("Doanh thu") và `customerPayment` ("Khách hàng thanh toán"). Thêm route `GET /reports/invoices/columns`. Registry + tập payment-account id active là **nguồn sự thật** để TKT-04 (search) validate cột.

## Deliverables

- `apps/api/src/modules/reporting/invoice-report/invoice-report.columns.ts`:
  - `export const INVOICE_REPORT_SUMMARY_COLUMNS: SummaryColumnDef[]` — cột cố định v1 (đúng bảng registry trong epic, reconcile với báo cáo gốc). Mỗi def mang **metadata nội bộ** để aggregate (không trả ra FE): cách tính từ raw rows.
    - vd `{ key:'revenue.goods', group:'revenue', type:CURRENCY, agg:'sum', source:'invoice.subtotal' }`
    - cột computed: `{ key:'revenue.total', group:'revenue', type:CURRENCY, computed:'total' }`, `{ key:'actualRevenue', group:null, type:CURRENCY, computed:'actual' }`, `{ key:'revenue.promoRate', group:'revenue', type:PERCENT, computed:'promoRate' }`.
    - cột group-by: `{ key:'date', group:null, type:DATE, groupKey:true }`.
  - Helpers: `isKnownSummaryColumn(key): boolean`, `getSummaryColumnDef(key): SummaryColumnDef | undefined`, `isDynamicColumnKey(key): boolean` (match `^(revenue|payment)\.method\.[uuid]$`), `parseDynamicColumnKey(key): { band:'revenue'|'payment'; paymentAccountId:string } | null`.
  - Tách "public def" (key/group/type/desc — khớp `ReportColumnHeader`) khỏi metadata aggregate (agg/source/computed) để catalog không lộ tên cột DB.
- `apps/api/src/modules/reporting/invoice-report/queries/get-invoice-report-columns.query.ts` — `GetInvoiceReportColumnsQuery { actor }`.
- `.../queries/get-invoice-report-columns.handler.ts` — `@QueryHandler` inject `@InjectRepository(PaymentAccountEntity)` (hoặc `PaymentAccountsService`). Build `headers: ReportColumnHeader[]`:
  1. map `INVOICE_REPORT_SUMMARY_COLUMNS` → header (label VI + desc cố định + group object).
  2. fetch payment accounts `active`, scope `organizationId` (+ branch scope qua `resolveBranchScope`), order `sortOrder`; với mỗi account append **2 header động**: `revenue.method.<id>` (band `revenue`) và `payment.method.<id>` (band `customerPayment`), `name = account.label`, `type = CURRENCY`, `desc = null`.
  3. trả `{ headers }` theo thứ tự band (date/actualRevenue → revenue cố định → revenue động → customerPayment động → customerPayment cố định).
- `invoice-report.controller.ts` — thêm `@Get('columns')` + `@RequirePermission('reporting.invoice.branch.read')` → `queryBus.execute(new GetInvoiceReportColumnsQuery(actor))`. `@ApiOkResponse` mô tả shape `headers`.
- `invoice-report.module.ts` — thêm `GetInvoiceReportColumnsHandler` vào `providers`.

## Acceptance Criteria

- [ ] `GET /reports/invoices/columns` trả `headers` = cột cố định (mọi key registry, kèm `name` VI + `desc` + `group`) **+** một cặp cột động (`revenue.method`/`payment.method`) / một `PaymentAccountEntity` active của scope; **không** lộ tên cột DB / metadata aggregate.
- [ ] Cột động chỉ gồm payment-account **của org** (và branch scope) hiện tại — không lộ account org khác; account `isActive=false` hoặc đã soft-delete → không xuất hiện.
- [ ] `INVOICE_REPORT_SUMMARY_COLUMNS` khớp 1-1 với `INVOICE_REPORT_COLUMN_LABELS_VI` (mọi key cố định có label; không key thừa) — verify ở TKT-09.
- [ ] Helper `isKnownSummaryColumn`/`getSummaryColumnDef`/`isDynamicColumnKey`/`parseDynamicColumnKey` đúng (unit test).
- [ ] Route sau guard auth/permission; scope theo `actor.organizationId` (+ branch khi resolve cột động).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh; app boot (handler đăng ký providers).
- [ ] `get-invoice-report-columns.handler.spec.ts` phủ: cột cố định đủ + merge label/desc; cột động sinh từ payment-account mock (đúng band + name=label); không lộ metadata; scope org.
- [ ] Backend source tiếng Anh (chỉ label VI cột cố định nằm ở shared package, import vào; nhãn động từ `PaymentAccountEntity.label` = dữ liệu).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

```ts
// invoice-report.columns.ts
type AggKind = 'sum';
type ComputedKind = 'total' | 'actual' | 'promoRate';

type SummaryColumnDef = {
  key: string;
  group: 'revenue' | 'customerPayment' | null;
  type: ReportColumnDataType;
  /** group-by key (the 'date' column). */
  groupKey?: boolean;
  /** raw aggregation for plain summed columns. */
  agg?: AggKind;
  /** physical source field on the raw invoice row (internal only). */
  source?: string;
  /** computed columns derived from other summed values. */
  computed?: ComputedKind;
};

export const INVOICE_REPORT_SUMMARY_COLUMNS: SummaryColumnDef[] = [
  { key: 'date', group: null, type: ReportColumnDataType.DATE, groupKey: true },
  { key: 'actualRevenue', group: null, type: ReportColumnDataType.CURRENCY, computed: 'actual' },
  { key: 'revenue.promoPoints', group: 'revenue', type: ReportColumnDataType.CURRENCY, agg: 'sum', source: 'promoPoints' },
  { key: 'revenue.goods', group: 'revenue', type: ReportColumnDataType.CURRENCY, agg: 'sum', source: 'subtotal' },
  { key: 'revenue.fee', group: 'revenue', type: ReportColumnDataType.CURRENCY, agg: 'sum', source: 'fee' },
  { key: 'revenue.discount', group: 'revenue', type: ReportColumnDataType.CURRENCY, agg: 'sum', source: 'discountAmount' },
  { key: 'revenue.total', group: 'revenue', type: ReportColumnDataType.CURRENCY, computed: 'total' },
  { key: 'revenue.promoRate', group: 'revenue', type: ReportColumnDataType.PERCENT, computed: 'promoRate' },
  { key: 'revenue.cash', group: 'revenue', type: ReportColumnDataType.CURRENCY, agg: 'sum', source: 'cashAmount' },
  { key: 'payment.voucher', group: 'customerPayment', type: ReportColumnDataType.CURRENCY, agg: 'sum', source: 'voucherAmount' },
  { key: 'payment.points', group: 'customerPayment', type: ReportColumnDataType.CURRENCY, agg: 'sum', source: 'pointsAmount' },
];
// ^ `source` map sang field thật trên InvoiceEntity reconcile ở TKT-04 (đọc entity thật trước khi chốt).

const GROUP_NAME_VI: Record<string, string> = { revenue: 'Doanh thu', customerPayment: 'Khách hàng thanh toán' };
const BY_KEY = new Map(INVOICE_REPORT_SUMMARY_COLUMNS.map((c) => [c.key, c]));
export const isKnownSummaryColumn = (k: string) => BY_KEY.has(k);
export const getSummaryColumnDef = (k: string) => BY_KEY.get(k);
const DYNAMIC_RE = /^(revenue|payment)\.method\.([0-9a-f-]{36})$/i;
export const isDynamicColumnKey = (k: string) => DYNAMIC_RE.test(k);
export const parseDynamicColumnKey = (k: string) => {
  const m = DYNAMIC_RE.exec(k);
  return m ? { band: m[1] as 'revenue' | 'payment', paymentAccountId: m[2] } : null;
};
```

```ts
// get-invoice-report-columns.handler.ts
@QueryHandler(GetInvoiceReportColumnsQuery)
export class GetInvoiceReportColumnsHandler implements IQueryHandler<GetInvoiceReportColumnsQuery> {
  constructor(@InjectRepository(PaymentAccountEntity) private readonly accounts: Repository<PaymentAccountEntity>,
              private readonly rbac: RbacService) {}
  async execute({ actor }: GetInvoiceReportColumnsQuery): Promise<{ headers: ReportColumnHeader[] }> {
    const fixed: ReportColumnHeader[] = INVOICE_REPORT_SUMMARY_COLUMNS.map((c) => ({
      col: c.key, name: INVOICE_REPORT_COLUMN_LABELS_VI[c.key] ?? c.key,
      desc: INVOICE_REPORT_COLUMN_DESCS[c.key] ?? null, type: c.type,
      group: c.group ? { id: c.group, name: GROUP_NAME_VI[c.group] } : null,
    }));
    const accts = await this.accounts.find({ where: { organizationId: actor.organizationId, isActive: true }, order: { sortOrder: 'ASC' } });
    const dynamic = accts.flatMap((a) => ([
      { col: `revenue.method.${a.id}`, name: a.label, desc: null, type: ReportColumnDataType.CURRENCY, group: { id: 'revenue', name: GROUP_NAME_VI.revenue } },
      { col: `payment.method.${a.id}`, name: a.label, desc: null, type: ReportColumnDataType.CURRENCY, group: { id: 'customerPayment', name: GROUP_NAME_VI.customerPayment } },
    ] as ReportColumnHeader[]));
    return { headers: orderByBand([...fixed, ...dynamic]) };
  }
}
```

> Controller path `modules/reporting/invoice-report/` — import `@Actor()`/`ActorContext` từ `common/decorators/actor-context.decorator`, `PermissionGuard`/`@RequirePermission` từ module rbac/auth (mirror `invoice-v2.controller.ts`). `INVOICE_REPORT_COLUMN_DESCS` có thể sống ở shared (TKT-02) hoặc inline BE — chốt nơi đặt khi implement, miễn không có VI trong source backend (công thức `(n)` là ký hiệu, không phải tiếng Việt).

## Testing Strategy

- Unit (`get-invoice-report-columns.handler.spec.ts`): mock repo payment-account → assert cột cố định đủ + label/desc/group, cột động đúng band & name=label, scope org, response không chứa metadata aggregate.
- Unit (`invoice-report.columns.spec.ts`): `isKnownSummaryColumn`/`isDynamicColumnKey`/`parseDynamicColumnKey` đúng với tập key mẫu (gồm uuid hợp lệ + key lạ).

## Dependencies

- Depends on: [TKT-IRB-01](./TKT-IRB-01-be-schema-entity-module.md), [TKT-IRB-02](./TKT-IRB-02-shared-interfaces.md).
- Blocks: [TKT-IRB-04](./TKT-IRB-04-be-cqrs-report-search.md), [TKT-IRB-05](./TKT-IRB-05-be-template-cqrs-crud.md).
