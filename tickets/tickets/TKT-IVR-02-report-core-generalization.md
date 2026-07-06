# TKT-IVR-02 BE: report-core generalization (generic registry + extract matchColumnFilter) — zero behavior change

## Epic

[EPIC-06072026 Báo cáo kho hàng theo structure báo cáo bán hàng](../epics/EPIC-06072026-inventory-report-v2.md)

## Summary

Refactor thuần (zero behavior change) để core report platform dùng được cho cả invoice lẫn inventory: generic hoá `ReportDefinition`/`ReportRegistry` theo search DTO, extract predicate lọc theo cột `matchColumnFilter` ra util chung. Invoice module giữ nguyên hành vi + specs xanh nguyên trạng.

## Deliverables

- `apps/api/src/modules/reporting/report-core/` (new folder):
  - `report-definition.ts` — `interface ReportDefinition<TDto> { key; buildColumns(actor); buildData(dto: TDto, actor) }` + `class ReportRegistry<TDef extends ReportDefinition<any>>` (list/get). Giữ nguyên semantics hiện có.
  - `column-filter.util.ts` — `matchColumnFilter`, `hasTextOperator` chuyển từ `invoice-report/invoice-report.aggregator.ts`.
- `apps/api/src/modules/reporting/invoice-report/report-definition.ts` (edit) — trở thành re-export + type alias: `type InvoiceReportDefinition = ReportDefinition<InvoiceReportSearchDto>`; `ReportRegistry` alias/subclass giữ tên cũ để DI token + import sites không đổi.
- `apps/api/src/modules/reporting/invoice-report/invoice-report.aggregator.ts` (edit) — import + re-export `matchColumnFilter` từ report-core (spec cũ import từ đường cũ vẫn xanh).
- `apps/api/src/modules/reporting/invoice-report/invoice-report-template.columns.util.ts` (edit nếu cần) — chữ ký `buildColumnCatalog(registry, ...)` nhận `ReportRegistry<any>`.

## Acceptance Criteria

- [ ] KHÔNG đổi hành vi: toàn bộ spec hiện có của invoice-report xanh không sửa assertion (chỉ được phép sửa import path nếu bắt buộc — ưu tiên re-export để khỏi sửa).
- [ ] `ReportRegistry` invoice vẫn resolve đúng 4 report definitions qua DI.
- [ ] Type-safe: `ReportDefinition<InvoiceReportSearchDto>` compile, không dùng `any` lộ ra public API.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` xanh (đặc biệt `invoice-report.aggregator.spec.ts`, `report-column.util.spec.ts`, các `reports/*.report.spec.ts`).
- [ ] Không đổi endpoint/OpenAPI (verify `openapi.snapshot.json` không diff).
- [ ] Diff chỉ chạm reporting module — không file nào ngoài scope.

## Tech Approach

```ts
// report-core/report-definition.ts
export interface ReportDefinition<TDto> {
  readonly key: string;
  buildColumns(actor: ActorContext): Promise<ReportColumnHeader[]>;
  buildData(dto: TDto, actor: ActorContext): Promise<InvoiceReportResult>;
}
export class ReportRegistry<TDef extends ReportDefinition<any> = ReportDefinition<any>> {
  private readonly byKey: Map<string, TDef>;
  constructor(definitions: TDef[]) { this.byKey = new Map(definitions.map((d) => [d.key, d])); }
  list(): string[] { return [...this.byKey.keys()]; }
  get(key: string): TDef | undefined { return this.byKey.get(key); }
}
```

Invoice giữ file cũ làm façade: `export class ReportRegistry extends CoreReportRegistry<InvoiceReportDefinition> {}` (tên class trùng — DI token không đổi).

## Testing Strategy

- Chạy nguyên suite reporting; thêm 1 spec nhỏ cho `report-core` (registry get/list + matchColumnFilter smoke từ vị trí mới).

## Dependencies

- Depends on: —
- Blocks: TKT-IVR-03, TKT-IVR-06
