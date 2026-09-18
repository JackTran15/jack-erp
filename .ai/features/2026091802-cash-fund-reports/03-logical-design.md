---
feature: cash-fund-reports
adr_count: 4
---

# Logical design — Báo cáo "Quỹ tiền"

## Approach

Thêm một **domain báo cáo `cash`** vào khung report-core hiện có, nhân bản cấu trúc của
`modules/reporting/debt-report/`: một module NestJS `modules/reporting/cash-fund-report/`
với đúng bộ route `GET columns`, `GET filter-options`, `POST search`, `templates` CRUD,
`POST export`, `POST print-payload`; một `ReportRegistry` chứa **5 `ReportDefinition`**
(một file `reports/<key>.report.ts` mỗi báo cáo); và một service dùng chung
`services/cash-fund-period.service.ts` sở hữu toàn bộ SQL trên 4 bảng chứng từ POSTED
(`cash_receipts`, `cash_payments`, `bank_receipts`, `bank_payments` + bảng dòng) để 5 báo cáo
không mỗi cái một cách lọc trạng thái / ngày / chi nhánh / phiếu đảo. Quyền đi qua
`ReportPermissionGuard` với `ReportDomain` mở rộng thêm `'cash'`.

Frontend không có trang mới: bật khối `REPORT_CATEGORY.CASH_FUND` đã stub, thêm nhánh
`backendSource: "cash"` vào 4 dispatcher trong `pages/chain-store/reports/_api/`, viết 5
file registry cột + metadata, và hai filter line mới (`PAYMENT_METHOD`, `EXPENSE_CATEGORY`)
cùng một select bucket thời gian cho #6. Drill-down dùng `ReportDrillDown` sẵn có.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Mở rộng `POST /v2/cash-vouchers/search` + `/v2/cash-ledger/search` thành báo cáo | Không có contract `columns / templates / export / print-payload`, không đi qua `ReportPermissionGuard`, FE `ReportPage` không đọc được; lại chỉ có tiền mặt, không có tiền gửi |
| Đọc `cash_movements` + `deposit_movements` (sổ cái) | Bên tiền mặt không có ngày chứng từ (`created_at` là ngày sổ — `cash-ledger.service.ts:154`), không có `purpose`, không có mục thu/chi; không thể tách "Thu từ bán hàng" hay gom theo mục |
| Bảng số dư ngày (materialized) để tính I nhanh | Chưa có khoá kỳ tiền mặt nên bảng phải tính lại mỗi khi sửa phiếu đã ghi sổ (`revision` bump, `editable-voucher.util.ts`); `SUM` trên index `(organization_id, branch_id, status, voucher_date)` đủ nhanh cho quy mô hiện tại |
| Dùng `posted_at` như Kết quả kinh doanh | Phá tín hiệu thành công (khớp MShopKeeper theo Ngày chứng từ) — A-01, ADR-02 |
| Một `ReportDefinition` duy nhất với `mode` | Mỗi báo cáo có cột, cách phân trang (phẳng / nhóm) và `exportSource` khác nhau; 5 class nhỏ đọc dễ hơn một class 5 nhánh |

## Domain model

| Entity / value | Fields | Notes |
| --- | --- | --- |
| `VoucherRow` (đọc) | `kind: 'CASH_RECEIPT' \| 'CASH_PAYMENT' \| 'BANK_RECEIPT' \| 'BANK_PAYMENT'`, `id`, `documentNumber`, `docDate`, `branchId`, `branchCode`, `branchName`, `purpose`, `referenceType`, `referenceId`, `partnerType`, `partnerId`, `partnerCode`, `partnerName`, `payerOrPayeeName`, `staffId`, `staffName`, `reason`, `depositAccountLabel`, `amountIn`, `amountOut` | Kết quả `UNION ALL` của 4 bảng, đã lọc `status = POSTED`, `reference_type <> 'REVERSAL'`, `deleted_at IS NULL`, ngày chứng từ trong kỳ, chi nhánh trong phạm vi (A-01, A-04, A-14) |
| `VoucherLineRow` (đọc) | `voucherKind`, `voucherId`, `lineId`, `docDate`, `categoryId`, `categoryName`, `categoryDirection`, `amount`, `description`, + các cột chứng từ cha | Nguồn của mục thu/chi (#2 dòng con, #4, #5, #6) — A-12 |
| `FundKind` | `'CASH' \| 'DEPOSIT'` | Cột Tiền mặt / Tiền gửi của #2; giá trị "Phương thức thanh toán" của #3/#5 (A-05) |
| `OpeningBalance` | `{ cash: number; deposit: number }` | A-03: cash = Σ trước `from`; deposit = Σ `opening_balance` (opening_date < from) + Σ trước `from` |
| `SituationLine` | `key`, `label`, `cash`, `deposit`, `total`, `bold`, `indentLevel` | 9 dòng cố định + N dòng mục; `key` ổn định (`opening`, `inTotal`, `inSales`, `inCategory:<id>`, `inUncategorized`, `outTotal`, `outPurchase`, `outCategory:<id>`, `outUncategorized`, `closing`) để FE gắn drill-down |
| `TimeBucket` | `'day' \| 'week' \| 'month' \| 'quarter' \| 'year'` | `date_trunc` trên `doc_date`; nhãn `dd/MM/yyyy`, `Tuần ww/yyyy`, `MM/yyyy`, `Qn/yyyy`, `yyyy` |
| `DocumentKind` | `'CASH_RECEIPT' \| 'CASH_PAYMENT' \| 'BANK_RECEIPT' \| 'BANK_PAYMENT'` → nhãn Phiếu thu / Phiếu chi / Thu tiền gửi / Chi tiền gửi | Cột "Loại chứng từ" (A-16), filter select |

Quy tắc bucket cố định của #2 (A-02): `inSales` = `purpose IN (POS_SALE, DEBT_COLLECTION)`;
`outPurchase` = `purpose IN (PURCHASE, SUPPLIER_PAYMENT)`; phần còn lại theo `category_id`
của dòng, `NULL` → `inUncategorized` / `outUncategorized`. Cùng tập `purpose` này bị loại
khỏi #4/#5/#6 (chúng là "chi mua hàng", không phải "mục chi").

## Contracts

Tất cả dưới `@Controller('reports/cash-fund')`, `@UseGuards(PermissionGuard, ReportPermissionGuard)`,
floor `reporting.cash.read`; `ReportPermissionGuard` thu hẹp theo `REPORT_PERMISSION_KEYS[reportType]`.

### Khoá và quyền (`packages/shared-interfaces`)
```ts
export const CASH_FUND_REPORT_KEYS = {
  CASH_IN_OUT_SITUATION: 'cash-in-out-situation',
  CASH_IN_OUT_LIST: 'cash-in-out-list',
  EXPENSES_BY_CATEGORY: 'expenses-by-category',
  EXPENSE_LIST_BY_CATEGORY: 'expense-list-by-category',
  EXPENSES_BY_TIME: 'expenses-by-time',
} as const;
// report-permissions.ts
type ReportDomain = 'sales' | 'inventory' | 'debts' | 'profit' | 'cash';
REPORT_DOMAIN_PERMISSIONS.cash = { floor: 'reporting.cash.read', consolidated: 'reporting.cash.consolidated.read' };
REPORT_PERMISSION_KEYS['cash-in-out-situation'] = 'reporting.cash.cash-in-out-situation.read'; // … ×5
```

### `GET /reports/cash-fund/columns?reportType=<key>` → `ReportColumnHeader[]`
Cột cố định theo bảng ở `00-intent.md`; `filterKind` = `date` / `text` / `number` / `select`
(Loại chứng từ, Phương thức thanh toán có `filterOptions`); `pinned: 'left'` cho 4 cột đầu của
#3 và 2 cột đầu của #5; `link: true` cho Số chứng từ, Mục chi, Ngày. Cột ẩn mặc định là
việc của registry FE (`visible: false`), header BE vẫn liệt kê đủ.

### `GET /reports/cash-fund/filter-options?type=employee|paymentMethod|expenseCategory|store&search=`
→ `ReportFilterOption[] { value, label }`. `employee` từ `hr` (nhân viên có phiếu trong tổ chức),
`expenseCategory` = `cash_voucher_categories` `direction = OUT`, `is_active`, theo `display_order`;
`paymentMethod` = `[{cash,'Tiền mặt'},{deposit,'Chuyển khoản'}]`; `store` = chi nhánh actor được đọc.

### `POST /reports/cash-fund/search`
```ts
class CashFundReportSearchDto {          // như DebtReportSearchDto
  reportType: string; columns: string[]; filters: CashFundReportFilterDto;
  columnFilters?: ColumnFilterDto[]; page = 1; limit = 50 (≤ 500);
}
class CashFundReportFilterDto {
  period?: DateRangeFilterDto;           // { from, to } yyyy-MM-dd, FE đã resolve preset (A-09)
  branchId?: string;                     // #2/#4/#6: chi nhánh header (A-14)
  store?: StoreScopeDto;                 // #3/#5: { scope: 'all'|'group', storeIds[] }
  employeeIds?: string[];                // #3
  paymentMethod?: 'cash' | 'deposit';    // #3/#5 → FundKind
  categoryIds?: string[];                // #5/#6 (drill-down từ #4/#6 truyền 1 phần tử)
  fundKind?: 'cash' | 'deposit';         // #3 khi drill từ ô IV của #2
  timeBucket?: TimeBucket;               // #6, mặc định 'day'
}
```
Response `InvoiceReportResult { rows, totals, total }`. Dòng mang thêm khoá ẩn (không có
trong `columns`): `bold: 0|1`, `indentLevel`, `rowKind: 'opening'|'grandTotal'|'group'|'detail'|'line'`,
`lineKey` (#2), `categoryId` (#4/#5), `bucketFrom`/`bucketTo` (#6), `voucherId` + `voucherKind`
(#3/#5) — FE dùng cho drill-down và mở phiếu.

Ngữ nghĩa từng báo cáo:
- `cash-in-out-situation`: `total = số dòng`, không phân trang; `totals = null`.
- `cash-in-out-list`: dòng `opening` luôn là dòng 0 của trang 1; `total` = số chứng từ; số dư
  luỹ kế = số dư đầu (của tập đã lọc theo cột) + Σ đến dòng đó — như `cash-ledger.service.ts`
  (`sumSignedBeforeOffset` cho trang > 1); `exportSource` keyset theo `(doc_date, id)`.
- `expenses-by-category`: `ORDER BY amount DESC`; `totals.amount`.
- `expense-list-by-category`: `grandTotal` là dòng 0 của trang 1; danh sách phẳng
  `[group, detail…, group, detail…]`, `total` = số dòng phẳng; `countRows` = số dòng chi tiết.
- `expenses-by-time`: `ORDER BY bucket ASC`; `totals.amount`.

### Templates, export, print
`GET/POST/PATCH/DELETE /reports/cash-fund/templates[/:id]?scope=chain|branch` — y hệt
debt-report trên `report_templates` (`domain = 'cash'`). `POST export` (`CashFundReportExportDto
= OmitType(Search, ['page','limit']) + columnLabels`) → `.xlsx` qua `ExportPipeline`;
`POST print-payload` → `ReportDocumentPayload`.

Failure modes: 400 `reportType` không có trong registry / `from > to` / `timeBucket` lạ;
403 thiếu floor hoặc key báo cáo (`ReportPermissionGuard`); 400 vượt row cap (`countRows`,
ADR-08 của report-core) cho #3/#5; 500 chỉ khi SQL lỗi.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Bộ lọc, trang, cột đang chọn, drill-down stack | `store/page-stores/report/report.store.ts` (Zustand, đã có) | Màn hình; đồng bộ URL qua `ReportUrlSync` |
| Dữ liệu báo cáo, columns, filter-options | TanStack Query, key bắt đầu `["report", "cash_fund", reportType, …]` như các domain khác | Màn hình; `staleTime` mặc định của report page |
| Mẫu cột | `report_templates` (BE), scope chain/branch (A-15) | Bền |
| Số dư, tổng | Tính tại BE mỗi request; không cache | Request |

## Error taxonomy

| Condition | Failure | UI |
| --- | --- | --- |
| Thiếu quyền floor / key báo cáo | `ForbiddenException` (403) | Menu ẩn (`visibleReportTypes`); nếu gọi tay → toast lỗi chuẩn |
| `reportType` lạ, `from > to`, `timeBucket` lạ | `BadRequestException` (400) | Toast; form giữ nguyên |
| Vượt row cap (#3/#5) | `BadRequestException` 400 với `subject` = 'chứng từ' / 'dòng chi' | Toast gợi ý thu hẹp kỳ hoặc xuất Excel (keyset) |
| Chi nhánh ngoài phạm vi trong `store.storeIds` | Bị kẹp lặng bởi `resolveReportBranchIds` (không lỗi) | Phụ đề chỉ liệt kê chi nhánh thực sự được tính |
| SQL lỗi | 500 qua filter chung | Toast lỗi chung |

## Cache & offline

Không cache dữ liệu báo cáo ở BE. FE giữ cache TanStack theo key; đổi filter → key mới.
Không có chế độ offline (backoffice).

## Observability

Dùng logging sẵn có của report-core (`search` ghi `reportType`, `organizationId`, số
dòng, thời gian). Export ghi `written` như debt-report. Không thêm metric mới.
Một request chậm nhìn thấy qua log `reportType=cash-in-out-list` với `total` lớn.

## ADRs

### ADR-01 — Domain báo cáo `cash` mới trong report-core, không mở rộng endpoint kho bạc
**Context:** Có sẵn `/v2/cash-vouchers/search` và `/v2/cash-ledger/search` trả gần đủ dữ liệu
cho #3, nhưng FE `ReportPage` chỉ nói chuyện với contract report-core (columns / search /
templates / export / print) và quyền theo báo cáo chỉ có ở `ReportPermissionGuard`.
**Decision:** Dựng `modules/reporting/cash-fund-report/` theo đúng khuôn `debt-report/`;
`ReportDomain` thêm `'cash'`; 5 khoá quyền mới.
**Consequences:** ~30 file gần như sao chép (controller, DTO, handler template) — chấp nhận
để giữ 4 domain hiện có đồng dạng; FE thêm 1 nhánh `backendSource`. Endpoint kho bạc không
đổi, trang Sổ quỹ cũ tiếp tục sống trên `created_at`.
**Status:** accepted

### ADR-02 — Ngày chứng từ là ngày sổ của mọi báo cáo quỹ tiền
**Context:** Ba quy ước ngày cùng tồn tại: `voucher_date`/`doc_date` (người dùng nhập),
`posted_at` (Kết quả kinh doanh), `cash_movements.created_at` (Sổ quỹ). MShopKeeper xếp theo
"Ngày chứng từ"; tín hiệu thành công là khớp MShopKeeper.
**Decision:** Mọi lọc kỳ, số dư đầu kỳ, bucket thời gian dùng `voucher_date` (tiền mặt) /
`doc_date` (tiền gửi). Chủ sở hữu xác nhận 2026-09-18 (A-01).
**Consequences:** Phiếu ghi lùi ngày làm III ở đây lệch "Chi khác" của Kết quả kinh doanh
cùng tháng — ghi rõ trong tooltip tiêu đề #2. Cần index
`(organization_id, branch_id, status, voucher_date)` trên `cash_receipts`/`cash_payments`
nếu chưa có (kiểm tra trong T-01-05; migration chỉ khi thiếu).
**Status:** accepted

### ADR-03 — Bảng chứng từ POSTED là nguồn duy nhất cho cả Tiền mặt và Tiền gửi; số dư tính từ chứng từ
**Context:** `cash_accounts` không có số dư đầu kỳ; `deposit_accounts` có
`opening_balance`/`opening_date`. Sổ cái (`*_movements`) thiếu mục và mục đích.
**Decision:** I = Σ chứng từ POSTED trước `from` (+ `opening_balance` bên tiền gửi); II/III
từ dòng chứng từ; IV = I + II − III. Phiếu `REVERSED` và phiếu đảo (`reference_type =
REVERSAL`) loại ở mọi báo cáo (A-03, A-04). Không thêm cột / bảng nào.
**Consequences:** IV kỳ trước = I kỳ sau theo cấu trúc, không cần khoá kỳ. Nếu sau này
thêm khoá kỳ tiền mặt hay số dư đầu kỳ nhập tay, chỉ `CashFundPeriodService.openingBalance`
đổi. IV có thể lệch `cash_accounts.balance` (sổ cái theo `created_at`) — đó là hệ quả của
ADR-02, không phải lỗi.
**Status:** accepted

### ADR-04 — Dòng phân cấp và dòng đặc biệt đi trong `rows` với khoá ẩn, không đổi envelope
**Context:** #2 có khung cố định + dòng con; #3 có dòng "Số dư đầu kỳ"; #5 có "TỔNG CHI" và
dòng nhóm. FE `ReportPageTable` đã render `bold`/`indentLevel` cho Kết quả kinh doanh.
**Decision:** Mọi dòng đặc biệt là phần tử của `rows` với `rowKind`, `bold`, `indentLevel`
(và `lineKey`/`categoryId`/`bucketFrom` cho drill-down); `InvoiceReportResult` giữ nguyên.
#5 phân trang trên danh sách phẳng, `grandTotal` chỉ ở trang 1.
**Consequences:** Không cần contract mới, `ColumnConfigDialog` / export / print dùng chung.
Export xlsx của #2/#5 in được dòng đậm nhờ `xlsx-style.ts` đọc `bold`. Sắp xếp theo cột
bị tắt cho #2/#5 (thứ tự do BE quyết định) — registry đặt `sortable: false`.
**Status:** accepted
