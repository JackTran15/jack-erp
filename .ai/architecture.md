---
generated: 2026-07-27
repo_root: /Users/akenzy/Documents/work/erp/be/jack-erp
generator: discover_generic + manual read (export/print focus)
verified_by: akenzy          # a human puts their name here after checking it
---

# Architecture map — jack-erp, export/print focus

Stack-agnostic inventory (`discover_generic.py`) enriched by reading the closest
existing code by hand. Scoped to what the Xuất khẩu / In feature touches — this is
not a full repo map. Use it as the source of truth for `touches` paths.

Ecosystem: **node** (pnpm workspace, Node ≥20, pnpm 10.x).

## Packages

| Name                     | Path                         | Role                                                                  |
| ------------------------ | ---------------------------- | --------------------------------------------------------------------- |
| `@erp/api`               | `apps/api`                   | NestJS 11 + TypeORM + CQRS backend (:4000)                            |
| `@erp/backoffice-web`    | `apps/backoffice-web`        | React 19 admin SPA (:3000)                                            |
| `@erp/pos-web`           | `apps/pos-web`               | React 19 POS SPA (:3001)                                              |
| `@erp/shared-interfaces` | `packages/shared-interfaces` | shared TS types (report contracts live here)                          |
| `@erp/api-client`        | `packages/api-client`        | OpenAPI-generated client (do not hand-edit `src/generated/schema.ts`) |
| `@erp/ui`                | `packages/ui`                | shared shadcn/Radix component library                                 |

## Relevant dependencies already present

- `exceljs` — **already a direct dependency of `@erp/api`**, used by 7 non-test services.
- `xlsx` — also present, used only on the **import** side (parsing).
- **No PDF library anywhere in the repo** (no puppeteer / pdfkit / pdf-lib / wkhtmltopdf).
- `@nestjs/cqrs` — the reporting surface is fully CQRS.

---

## 1. What already exists (the survey said "chưa có" — it is partly wrong)

### 1a. Excel export already ships, hand-rolled per call site

| Route                                  | Controller                                                                               | Builder                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `POST /inventory/stock/summary/export` | `apps/api/src/modules/inventory/ledger/stock-summary-v2.controller.ts:43`                | `apps/api/src/modules/inventory/ledger/stock-summary-export.service.ts` (255 L)            |
| `GET /deposit-ledger/export`           | `apps/api/src/modules/accounting/deposit/deposit-ledger/deposit-ledger.controller.ts:37` | `apps/api/src/modules/accounting/deposit/deposit-ledger/deposit-ledger.service.ts` (644 L) |
| `GET /deposit-recon/export`            | `apps/api/src/modules/accounting/deposit-recon/deposit-recon.controller.ts:38`           | `apps/api/src/modules/accounting/deposit-recon/deposit-recon.service.ts`                   |
| `GET /stock-take/:id/export.xlsx`      | `apps/api/src/modules/inventory/stock-take/stock-take.controller.ts:347`                 | `apps/api/src/modules/inventory/stock-take/stock-take.service.ts`                          |
| `POST /transfer-orders/:id/export`     | `apps/api/src/modules/inventory/transfer-order/transfer-order.controller.ts:420`         | `transfer-order.service.ts`                                                                |
| 8 routes under `/inventory/exports/*`  | `apps/api/src/modules/inventory/csv/csv-export.controller.ts`                            | `csv/*.service.ts`                                                                         |
| 1 route under `/customers/exports`     | `apps/api/src/modules/customer/csv/customer-export.controller.ts`                        | `customer/csv/*`                                                                           |

**Shared code across all of them: exactly one 50-line util** —
`apps/api/src/common/utils/excel-workbook-font.util.ts` (`applyWorkbookFont`,
Times New Roman). Everything else is duplicated per builder: the branch header
block (name / address / phone), the title row, the filter-summary line, the header
row fill `FF1E3A6E` + white bold, freeze pane, autoFilter, `numFmt '#,##0.###'`,
column widths, `Buffer.from(await workbook.xlsx.writeBuffer())`. The
`res.setHeader('Content-Type', …spreadsheetml.sheet)` +
`Content-Disposition: attachment` pair is likewise re-typed in every controller
(`csv-export.controller.ts` is the only one that factored it, into a private
`sendExcel`).

**This duplication is the reuse target.**

### 1b. Print already ships — client-side HTML, no PDF service

`apps/pos-web/src/lib/page-libs/checkout/printing/`:

| File                             | Lines | Role                                                                                  |
| -------------------------------- | ----- | ------------------------------------------------------------------------------------- |
| `InvoicePrinter.ts`              | 14    | strategy interface                                                                    |
| `renderInvoiceHtml.ts`           | 408   | payload → self-contained HTML doc, **khổ A80 thermal, layout copied from MISA eShop** |
| `BrowserWindowInvoicePrinter.ts` | 73    | writes the HTML into a hidden iframe → `win.print()`; avoids popup blockers           |

`InvoicePrinter.ts` carries the extension point in its own doc comment: *"anything
device-specific belongs in a sibling implementation (e.g. ThermalEscPosInvoicePrinter,
PdfServiceInvoicePrinter)"*. `renderInvoiceHtml.ts` says its output is *"suitable for
`iframe.contentDocument.write(...)` or for dropping into a server-side PDF renderer"*.

The repo's second print path — `apps/backoffice-web/src/pages/inventory-item-barcodes/_lib/print-barcode-labels.ts`
(24 L) — takes a **PDF blob** and does `window.open(objectUrl)`, i.e. the exact
new-tab-preview pattern the survey attributes to MISA. Its comment says so verbatim.

### 1c. The FE buttons already exist as stubs

Five call sites already render "In" / "Xuất khẩu" and fire a placeholder toast:

| File:line                                                                                           | Button                           |
| --------------------------------------------------------------------------------------------------- | -------------------------------- |
| `apps/backoffice-web/src/pages/reports/storage/_shared/StorageReportShell.tsx:326`                  | In                               |
| `apps/backoffice-web/src/pages/reports/storage/_shared/StorageReportShell.tsx:333`                  | Xuất khẩu                        |
| `apps/backoffice-web/src/pages/treasury/ledger-cash/LedgerCashPage.tsx:251`                         | Xuất khẩu                        |
| `apps/backoffice-web/src/pages/treasury/documents/invoice-detail-dialog/InvoiceDetailDialog.tsx:52` | Xuất khẩu                        |
| `apps/backoffice-web/src/pages/chain-store/reports/InvoiceDetailDialog/InvoiceDetailDialog.tsx:62`  | Xuất khẩu                        |
| `apps/backoffice-web/src/lib/list-toolbar/crud-entity-toolbar.ts:69`                                | Xuất khẩu (generic CRUD toolbar) |

`apps/backoffice-web/src/lib/download.ts` already holds `triggerBlobDownload(blob, filename)`.

---

## 2. The report platform — already generic across four domains

`apps/api/src/modules/reporting/report-core/`:

| File                        | Lines | Contract                                                                                                                                                             |
| --------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report-definition.ts`      | 37    | `ReportDefinition<TDto>` = `{ key, buildColumns(actor) → ReportColumnHeader[], buildData(dto, actor) → InvoiceReportResult }`; `ReportRegistry<TDef>` indexes by key |
| `report-template.entity.ts` | 48    | `report_templates` — ORGANIZATION-scoped, soft-deleted, `columns: ReportTemplateColumn[]` jsonb, `filters` jsonb. **Explicitly generic across report domains.**      |
| `report-query.util.ts`      | 142   | shared query helpers                                                                                                                                                 |
| `column-filter.util.ts`     | 40    | shared column-filter helpers                                                                                                                                         |
| `report-template.view.ts`   | 26    | view mapper                                                                                                                                                          |

Four domains implement it, each with its own registry + permission + DTO:

| Domain    | Path                                             | Controller route                                          |
| --------- | ------------------------------------------------ | --------------------------------------------------------- |
| invoice   | `apps/api/src/modules/reporting/invoice-report/` | `reports/invoice`                                         |
| profit    | `apps/api/src/modules/reporting/profit-report/`  | `reports/profit`                                          |
| debt      | `apps/api/src/modules/reporting/debt-report/`    | `reports/debt`                                            |
| inventory | `apps/api/src/modules/inventory-reports/`        | `reports/inventory` (`inventory-report-v2.controller.ts`) |

Each exposes the same shape: `GET columns`, `GET filter-options`, `POST search`,
`GET/POST/PATCH/DELETE templates[/:id]`. `InventoryReportV2Controller` (130 L) is the
cleanest example. Inventory registers **8** report definitions under
`apps/api/src/modules/inventory-reports/report/reports/`.

Shared types (`packages/shared-interfaces/src/invoice-report/`):

- `column.ts:31` — `ReportColumnHeader { col, name, desc, type, group, filterKind, filterOptions?, align?, pinned?, link?, width? }`
- `search.ts:108` — `InvoiceReportResult { rows: ReportRow[], totals: ReportRow | null, total: number }`
- `template.ts:4` — `ReportTemplateColumn { col, displayName, visible, frozen, order }`

**Consequence for this feature:** headers + template column config + rows + totals is
everything an exporter needs, and all four domains already produce it in one shape.
One generic exporter can serve all four. Do not write a per-report exporter.

## 3. FE report shells — there are **two**, and they differ

### 3a. Generic shell, all four domains — `apps/backoffice-web/src/pages/chain-store/reports/`

| Path                                                                                      | Role                                                                                                                              |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ReportPage.tsx`                                                                          | one page serving every report type                                                                                                |
| `_api/report-data-source.ts`                                                              | **dispatcher across all four domains** — normalizes `ReportDataArgs` → `{rows, totals, total}`; the FE mirror of `ReportRegistry` |
| `_api/{invoice,inventory-report-v2,debt,profit}-report.api.ts`                            | per-domain fetchers + filter builders                                                                                             |
| `_api/report-template.api.ts`                                                             | `report_templates` CRUD client                                                                                                    |
| `ReportPageHeader/ReportPageToolbar/`                                                     | toolbar — **no export/print button yet**                                                                                          |
| `ReportPageTable/`, `ReportUrlSync/`, `ReportColumnFilterSync/`, `ReportTableConfigSync/` | table + URL/state sync                                                                                                            |

Column config here syncs through `report_templates` (`ReportTableConfigSync`).

### 3b. Storage shell, 8 inventory pages — `apps/backoffice-web/src/pages/reports/storage/_shared/`

| File                      | Lines                                                          |
| ------------------------- | -------------------------------------------------------------- |
| `StorageReportShell.tsx`  | 385 — holds the two stub buttons (`:326` In, `:333` Xuất khẩu) |
| `ReportFilterDialog.tsx`  | 300                                                            |
| `ColumnConfigDialog.tsx`  | 219 — the "Sửa mẫu" equivalent, already built                  |
| `StorageReportSelect.tsx` | 52                                                             |

Column config here persists to **localStorage** keyed by `storageKey`. 8 pages consume it
(`apps/backoffice-web/src/pages/reports/storage/*.tsx`).

**Consequence:** the same inventory report is reachable through both shells with two
different column-config stores. An export driven by a client-supplied `columns[]` is
correct under both without unifying them first.

## 4. Voucher modules (per-document print/export targets)

| Voucher                          | Path                                                | Detail route                                                |
| -------------------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| Goods receipt                    | `apps/api/src/modules/inventory/goods-receipt/`     | `GET goods-receipts/:id` (`goods-receipt.controller.ts:73`) |
| Goods issue                      | `apps/api/src/modules/inventory/goods-issue/`       | controllers under `controllers/`                            |
| Transfer order                   | `apps/api/src/modules/inventory/transfer-order/`    | `transfer-order.controller.ts`                              |
| Cash receipt / payment           | `apps/api/src/modules/accounting/cash-vouchers/`    | `controllers/cash-voucher-v2.controller.ts`                 |
| Bank (deposit) receipt / payment | `apps/api/src/modules/accounting/deposit-vouchers/` | `controllers/deposit-voucher-v2.controller.ts`              |

FE dialogs: `apps/backoffice-web/src/components/document/{GoodsReceipt,GoodsIssue}FormDialog.tsx`,
`apps/backoffice-web/src/pages/treasury/documents/{receipt,payment,deposit-receipt,deposit-payment}-voucher-dialog/`.

## 5. Conventions that constrain this feature

- Controllers: `@UseGuards(PermissionGuard[, BranchScopeGuard])` at class level,
  `@RequirePermission("x.y")` per method, `@Actor()` for `ActorContext`; every query
  filters by `actor.organizationId`.
- Global `ValidationPipe` is `whitelist + forbidNonWhitelisted` — DTOs must declare
  every accepted field.
- Backend source is **English only** (errors, comments, Swagger). Vietnamese belongs
  in FE UI strings *and* in generated document content (existing exporters already
  write Vietnamese headers into the workbook — that is document data, not source).
- Global `IdempotencyInterceptor` dedupes mutations on `X-Idempotency-Key`. Exports
  are reads; `POST /export` bodies are query payloads, not mutations.
- FE fetches via `erpApi` / `requireErpData` wrapper, except the existing blob
  downloads which go through `apiClient` (axios) with `responseType: "blob"`.
- After API changes: run the API, then `pnpm openapi:generate`.

## 6. Inconsistencies and absences found (feed the assumption register)

1. **Two sources of truth for column config.** `StorageReportShell` persists
   visibility/freeze/order in **localStorage** keyed by `storageKey`; the backend has
   `report_templates` + full template CRUD on all four report controllers. MISA's rule
   is "export only the visible columns", so the exporter must be told which one wins.
2. **No PDF library, but the repo has two print precedents** — pos-web renders HTML
   into an iframe and calls `window.print()`; backoffice takes a PDF blob and opens a
   tab. The barcode-label path implies something already produces a PDF blob; the
   backend builder for barcode labels (`csv/barcode-label-workbook.service.ts`) is
   ExcelJS-based, so the PDF source for `printBarcodeLabels` needs confirming before
   any plan leans on it.
3. **No shared Excel document builder.** Only `applyWorkbookFont` is shared; the
   header/title/filter-line/styling block is copy-pasted across 7 services.
4. **No shared "send this buffer as a download" controller helper** outside
   `csv-export.controller.ts`'s private `sendExcel`.
5. **Export volume is unbounded in the *legacy* exporter.** `StockSummaryExportService.loadAllRows`
   pages 200 rows at a time in a `do/while` with no ceiling. The **registry reports do
   not have this problem** — see §7.
6. **`AsyncReportService`** (`apps/api/src/modules/reporting/async-report.service.ts`)
   is an in-memory `Map` job store (`setImmediate` + WS notify) serving 5 legacy
   `ReportingService` types. It is **not** wired to the v2 registry, and its job state is
   lost on restart / not shared across instances. Do not build on it without replacing
   the store.
7. **Two FE report shells with two column-config stores** — see §3.

## 7. Pagination and totals semantics — uniform across all four domains

`apps/api/src/modules/inventory-reports/report/report-data.util.ts` (the only place the
helpers are factored, though the pattern is hand-rolled identically elsewhere):

- `MAX_REPORT_ROWS = 50_000` + `assertUnderRowCap(total)` — a report over the cap
  **throws 400** rather than truncating, because truncating would produce wrong totals.
- `buildTotalsRow(...)` sums over **all filtered rows**, not the current page;
  `nonAdditive` marks numeric columns whose sum is meaningless (unit prices, averages).
- `paginateRows(rows, columns, page, limit)` slices **last**, after filtering and totals.

Verified the same materialize → filter → total-over-all → slice order in the other three
domains: `debt-report/reports/customer-debts.report.ts:280-283`,
`profit-report/reports/profit-by-item.report.ts:217-218`,
`invoice-report/reports/revenue-by-item.report.ts:254-258`,
`invoice-report/reports/daily-sales-summary.report.ts:250-251`.

**Consequence for this feature:** an exporter can call `buildData` **once** with a large
`limit` and receive every row plus already-correct totals. It must not loop pages, and it
inherits the 50k cap for free. The `@Max(500)` on `limit` lives only on the HTTP search
DTO (`inventory-report-search.dto.ts:48`), not on `buildData`.
