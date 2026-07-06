# Inventory Reports — Handover

Tài liệu này mô tả kiến trúc 7 báo cáo kho hàng (`/reports/storage/*`) sau khi chuyển từ mock data sang real data dùng PostgreSQL **plain views** + Redis cache.

> Tác giả: feature `feat/bo-reports` (2026-06). Đối tượng đọc: dev tiếp nhận tính năng để mở rộng / debug / thêm báo cáo mới.

---

## 0. Contract v2 (EPIC-06072026) — surface hiện hành cho chain-store ReportPage

Từ 07/2026, 8 báo cáo kho có **contract 3-API registry-driven** giống báo cáo bán hàng (EPIC-24062026), phục vụ FE generic `pages/chain-store/reports/ReportPage`:

| Endpoint | Mô tả |
|---|---|
| `GET /reports/inventory/columns?reportType=` | Column catalog giàu metadata (VI label, band, filterKind, filterOptions, align, pinned, width, summaryLabel). Report #5 pivot trả **cột động** `branch.qty.<branchId>` per branch của org. |
| `POST /reports/inventory/search` | `{reportType, columns[], filters, columnFilters[], page, limit}` → `{rows (keyed theo field), totals (trên TOÀN BỘ rows sau filter), total}` |
| `GET /reports/inventory/filter-options?type=` | Dropdown thật: `store`, `warehouse` (storages), `productGroup`, `brand`, `unit`, `statBy`, `productType` |
| `GET/POST/PATCH/DELETE /reports/inventory/templates[/:id]` | Lưu cấu hình "Hiển thị cột" `{col, displayName, visible, frozen, order}` — bảng **`report_templates`** (rename từ `invoice_report_templates`, dùng chung với invoice reports), validate theo catalog từng reportType |

- **Backend**: `apps/api/src/modules/inventory-reports/` — `report/inventory-report-definition.ts` (`InventoryReportRegistry`), `report/reports/*.report.ts` (8 definitions, backendKey `inventory-*`), `inventory-report-v2.controller.ts` + CQRS handlers. Core generic dùng chung với invoice: `apps/api/src/modules/reporting/report-core/`.
- **Data engines tái dùng nguyên** (mục 4 bên dưới): StockPeriodService, DocumentDetailService, StockBalancePivotService, TransferReportService, TempWarehouseReportService. Cache Redis 45s ở search handler.
- **VI labels/bands**: `packages/shared-interfaces/src/inventory-report/` (per-report maps — cùng key cột có label khác nhau giữa các báo cáo).
- **Permission**: tái dùng `inventory.reports.read`. Scope: org-wide khi `filters.store` absent/`all` (parity legacy); `scope:"group"` validate storeIds thuộc org.
- **Lưu ý số liệu**: báo cáo #6 (NX điều chuyển) v2 sửa bug mapping cũ của FE — `inOutDiffQty/Value` giờ lấy từ `qtyInOutDifference/valueInOutDifference` (trước đây nhầm `qtyDifference`) → số hiển thị thay đổi (đúng).
- **E2E**: `apps/api/test/e2e/inventory-report-v2.e2e-spec.ts`.

**Surface legacy bên dưới (GET endpoints + trang `/reports/storage/*`) GIỮ NGUYÊN** — sẽ dọn ở epic riêng sau khi contract v2 soak.

---

## 1. Phạm vi

7 báo cáo trên sidebar **Báo cáo → Kho hàng**:

| # | Route | Tên báo cáo | Backend endpoint |
|---|-------|-------------|------------------|
| 1 | `/reports/storage/stock-summary` | Tổng hợp nhập xuất tồn kho | `GET /reports/inventory/stock-summary` |
| 2 | `/reports/storage/stock-document-details` | Bảng kê chi tiết phiếu nhập xuất | `GET /reports/inventory/stock-document-details` |
| 3 | `/reports/storage/stock-quantity-details` | Chi tiết số lượng nhập xuất tồn | `GET /reports/inventory/stock-quantity-details` |
| 4 | `/reports/storage/stock-summary-by-branch` | Tổng hợp NXT theo cửa hàng | `GET /reports/inventory/stock-summary-by-branch` |
| 5 | `/reports/storage/stock-by-branch` | Số lượng tồn theo cửa hàng (pivot) | `GET /reports/inventory/stock-by-branch` |
| 6 | `/reports/storage/transfer-summary` | Tổng hợp NX điều chuyển | `GET /reports/inventory/transfer-summary` |
| 7 | `/reports/storage/transfer-by-branch` | Hàng hoá điều chuyển theo cửa hàng | `GET /reports/inventory/transfer-by-branch` |

**Phase 2** (chưa làm): Báo cáo 8 — Xuất kho tạm. Sẽ ráp khi nghiệp vụ rõ.

---

## 2. Quyết định kiến trúc

### 2.1. Plain view, KHÔNG materialized view

Cả 7 báo cáo đều có **period động** (Tháng này / Tháng trước / Tuỳ chọn) → MV không pre-compute được aggregation cho arbitrary `(startDate, endDate)`. Plain view + index hợp lý đủ nhanh cho quy mô hiện tại (< 10M ledger rows).

**Plain view = stored SELECT**. Mỗi lần query view, Postgres re-execute SELECT trên data hiện tại → **real-time 100%, không cần refresh, không cron**.

**Upgrade path**: khi `stock_ledger_entries` > 10M rows hoặc p95 > 2s, promote sang MV với `REFRESH MATERIALIZED VIEW CONCURRENTLY` chạy cron + sửa cache TTL.

### 2.2. Cache Redis 45s

Tất cả endpoint dùng `CacheService.getOrSet("inventory-reports", key, fn, 45)`. Key = `sha256(orgId + filters)`.

- **Delay tối đa user nhìn thấy**: 45s sau khi post phiếu.
- Hết TTL → request kế tiếp re-execute view → fresh data.
- Đổi 1 filter bất kỳ → key đổi → cache miss riêng → fresh.

### 2.3. Cost columns trên `stock_ledger_entries`

Migration `1781700000000-AddCostColumnsToStockLedger.ts` thêm:

| Column | Type | Mục đích |
|--------|------|----------|
| `unit_cost` | `numeric(18, 2)` | Đơn giá thời điểm post (immutable) |
| `line_value` | `numeric(18, 2)` | `quantity × unit_cost` (signed) |

Có index `idx_stock_ledger_org_posted (organization_id, posted_at)` để date-range filter chạy nhanh.

Posting service ghi luôn vào 2 column này:
- `goods-receipt.service.ts`: `unitCost = line.unitPrice`
- `goods-issue.service.ts`: `unitCost = line.unitPrice`
- `stock-transfer.service.ts`: `unitCost = items.purchase_price` snapshot
- `stock-adjustment.service.ts` + `stock-take.service.ts`: `unitCost = items.purchase_price`

Helper chung: [`StockLedgerService.deriveCostFields()`](../apps/api/src/modules/inventory/ledger/stock-ledger.service.ts).

---

## 3. 4 Views

Tất cả tạo bởi migration `1781800000000-CreateInventoryReportViews.ts`.

### 3.1. `vw_stock_ledger_enriched`
**Nguồn**: `stock_ledger_entries` JOIN `items`, `products`, `inventory_item_categories`, `locations`, `storages`, `branches`.

**Dùng cho**: báo cáo 1, 3, 4 (CTE engine `StockPeriodService`).

**Cột chính**: `posted_at`, `quantity`, `unit_cost`, `line_value`, `item_id`, `item_code`, `item_name`, `category_id`, `category_name`, `product_id`, `product_name`, `location_id`, `location_code`, `location_name`, `branch_id`, `branch_code`, `branch_name`, `movement_type`.

### 3.2. `vw_stock_documents`
**Nguồn**: UNION ALL 3 bảng `goods_receipts`, `goods_issues`, `stock_transfers` + lines tương ứng.

**Dùng cho**: báo cáo 2.

**Cột chính**: `doc_kind` (`'NK'|'XK'|'DC'`), `document_number`, `posted_at`, `item_id`, `item_code`, `item_name`, `quantity`, `unit_price`, `line_amount`, `branch_id`, `location_id`.

### 3.3. `vw_stock_balance_enriched`
**Nguồn**: `stock_balances` JOIN metadata.

**Dùng cho**: báo cáo 5 (pivot tồn theo cửa hàng).

**Cột chính**: `item_id`, `item_code`, `item_name`, `branch_id`, `branch_code`, `branch_name`, `quantity`, `unit_cost`, `line_value`.

### 3.4. `vw_stock_transfer_lines_enriched`
**Nguồn**: `stock_transfer_lines` JOIN `stock_transfers` + metadata 2 branch nguồn/đích.

**Dùng cho**: báo cáo 6, 7.

**Cột chính**: `transfer_id`, `posted_at`, `item_id`, `quantity`, `unit_cost`, `source_branch_id`, `source_branch_name`, `destination_branch_id`, `destination_branch_name`.

### Schema gotcha (cần biết)

`branches.id` là **uuid**, nhưng đa số `*.branch_id` foreign key là **varchar** — không cast thẳng được. Trong view dùng:
- `b.id::text = X.branch_id` cho JOIN
- `$N::text[]` (không `::uuid[]`) cho filter `ANY(branch_ids)`
- Ngoại lệ: `stock_transfers.source_branch_id` và `destination_branch_id` đúng kiểu uuid

Khi thêm view mới hoặc sửa view, **luôn kiểm tra** kiểu cột branch_id của bảng nguồn trước.

---

## 4. Module backend

```
apps/api/src/modules/inventory-reports/
├── inventory-reports.module.ts          # Registered ở app.module.ts
├── inventory-reports.controller.ts      # 7 endpoint + 1 filter-options/units
├── inventory-reports.service.ts         # Facade gọi các sub-service
├── dto/
│   ├── inventory-report-query.dto.ts    # period, branchIds[], categoryIds[], storageIds[], units[], search, page, pageSize, groupBy
│   └── transfer-by-branch-query.dto.ts
└── services/
    ├── stock-period.service.ts          # CTE opening/in/out/closing — báo cáo 1, 3, 4
    ├── document-detail.service.ts       # Query vw_stock_documents — báo cáo 2
    ├── stock-balance-pivot.service.ts   # Pivot từ vw_stock_balance_enriched — báo cáo 5
    ├── transfer-report.service.ts       # Báo cáo 6, 7
    ├── date-range-resolver.ts           # Preset → {start, end} UTC
    └── movement-classifier.ts           # StockMovementType → label vi-VN
```

**Auth & permission**:
- `AuthGuard` global (CommonModule)
- `@UseGuards(PermissionGuard, BranchScopeGuard)` ở class level
- `@RequirePermission("inventory.reports.read")` mỗi method
- **KHÔNG** `@RequireBranchScope()` ở class — báo cáo aggregate cross-branch theo `branchIds[]`, không cần header `X-Branch-Id`

Permission `inventory.reports.read` đã được seed (`apps/api/src/modules/rbac/permissions.seed.ts`). Nếu admin mới không có → chạy `pnpm seed:sync-admin-permissions` → user phải logout/login để refresh JWT.

---

## 5. Frontend

```
apps/backoffice-web/src/
├── api/
│   └── inventory-reports.ts            # 7 typed wrapper qua erpApi + requireErpData
├── hooks/
│   ├── use-inventory-reports.ts        # 7 TanStack Query hook
│   └── use-filter-options.ts           # useBranchOptions, useItemCategoryOptions, useStorageOptions, useItemUnitOptions
└── pages/reports/storage/
    ├── _shared/
    │   ├── StorageReportShell.tsx      # Layout chung — period picker, footer subtotal, pagination
    │   ├── ReportFilterDialog.tsx      # Dialog chọn bộ lọc
    │   ├── ColumnConfigDialog.tsx      # Cấu hình cột hiển thị
    │   ├── apiFilters.ts               # Map FilterValues → API query params
    │   └── types.ts
    └── *.tsx                            # 7 page component, mỗi page 1 báo cáo
```

**Pattern fetch**:
```ts
const { data, isLoading } = useStockSummary({
  preset, startDate, endDate,
  branchIds, categoryIds, storageIds, units,
  search, page, pageSize,
});
```

Hook key: `["inventory-report", reportKey, filters]` — invalidate prefix `["inventory-report"]` để bust toàn bộ báo cáo (rare case).

---

## 6. Filter wiring

`useFilterOptions` hooks gọi cố định `pageSize: 100` (giới hạn của generic CRUD endpoint). Nếu organization có > 100 nhánh/danh mục/kho, cần đổi sang autocomplete pattern (search-as-you-type) — chưa làm.

DTO `inventory-report-query.dto.ts` accept:
- `preset`: `'this_month' | 'last_month' | 'custom'`
- `startDate`, `endDate`: chỉ dùng khi `preset = 'custom'`
- `branchIds[]`, `categoryIds[]`, `storageIds[]`, `units[]`: filter array (omit = no filter)
- `search`: ILIKE trên `item_code` + `item_name`
- `page`, `pageSize`: default 1, 20
- `groupBy`: chỉ báo cáo 1 dùng, default `'item'`

`apiFilters.ts` map từ UI `FilterValues` (label tiếng Việt) sang DTO. Sentinel `__all__` được strip trước khi gửi đi.

---

## 7. Thêm 1 báo cáo mới

Workflow chuẩn:

1. **Nếu source data đã có view**: thêm endpoint mới vào `inventory-reports.controller.ts`, viết sub-service mới trong `services/`, dùng query repo gọi vào view. Không cần migration.
2. **Nếu cần thêm view mới**:
   - Tạo migration mới `<ts>-CreateMyReportView.ts` chứa `CREATE VIEW vw_xxx AS ...` + `DROP VIEW IF EXISTS vw_xxx` trong `down()`.
   - **Kiểm cột branch_id varchar/uuid** trước khi viết.
   - Đăng ký service mới ở `inventory-reports.module.ts`.
3. **Permission**: tái dùng `inventory.reports.read`, không cần thêm permission mới.
4. **Cache**: dùng `CacheService.getOrSet("inventory-reports", computeKey(actor, dto), fn, 45)`. Key MUST include `actor.organizationId`.
5. **DTO**: extend `InventoryReportQueryDto` nếu filter set khớp; tạo DTO mới nếu khác (vd `transfer-by-branch-query.dto.ts`).
6. **Frontend**:
   - Thêm wrapper trong `api/inventory-reports.ts`
   - Thêm hook trong `hooks/use-inventory-reports.ts`
   - Tạo page component trong `pages/reports/storage/` dùng `StorageReportShell<RowT>`
   - Thêm route ở `App.tsx` + nav entry ở `navConfig.ts`

---

## 8. Update views

**KHÔNG cần update lịch**. Plain view tự reflect data real-time mỗi lần query.

Chỉ cần **migration mới** khi:
- Đổi định nghĩa view (thêm/bớt cột, đổi JOIN, đổi WHERE)
- Đổi schema bảng nguồn dẫn tới view broken

Pattern migration view (idempotent):
```ts
public async up(q: QueryRunner) {
  await q.query(`DROP VIEW IF EXISTS vw_xxx CASCADE`);
  await q.query(`CREATE VIEW vw_xxx AS SELECT ...`);
}
public async down(q: QueryRunner) {
  await q.query(`DROP VIEW IF EXISTS vw_xxx CASCADE`);
}
```

`CASCADE` cần để drop được nếu view khác đang phụ thuộc.

---

## 9. Debug & tips

### Báo cáo không hiển thị data mới
1. **Phiếu đã POST chưa?** Service chỉ ghi ledger khi `status = POSTED`:
   ```sql
   SELECT document_number, status, posted_at FROM goods_receipts ORDER BY created_at DESC LIMIT 5;
   ```
   Status `DRAFT` = không ghi ledger. UI button "Hoãn" trong dialog phiếu nhập kho **đang gọi action POST** (label sai cần fix riêng).
2. **Ledger có row chưa?**
   ```sql
   SELECT * FROM stock_ledger_entries
   WHERE reference_type = 'GOODS_RECEIPT'
     AND reference_id = (SELECT id FROM goods_receipts WHERE document_number = 'NKxxxx');
   ```
3. **Cache còn 45s**: chờ hoặc đổi 1 filter để bust key.
4. **Period đúng chưa**: data ngoài range thì không hiện. Check `posted_at` của ledger entry vs period UI.

### Báo cáo 403
Permission `inventory.reports.read` chưa được grant cho role admin. Chạy:
```bash
pnpm seed:sync-admin-permissions
```
Sau đó user logout/login để JWT refresh.

### Báo cáo 500 "character varying = uuid"
Có view mới tạo bị quên cast. Check kiểu `branch_id` của bảng nguồn:
```sql
\d <table_name>
```
Sửa view dùng `b.id::text = X.branch_id` hoặc `$N::text[]`.

### Tồn đầu kỳ âm
Data seed thiếu phiếu nhập trước phiếu xuất, hoặc backfill migration ghi sai dấu. Truy:
```sql
SELECT posted_at, movement_type, quantity, unit_cost, line_value
FROM stock_ledger_entries
WHERE item_id = '<id>'
ORDER BY posted_at;
```
Receipt phải `quantity > 0`, issue phải `< 0`.

### Cross-org isolation
Mọi query backend phải filter `organization_id = actor.organizationId`. Service đã làm — nếu thêm sub-service mới phải nhớ filter này.

---

## 10. File reference

**Migration**:

- `apps/api/src/database/migrations/1781700000000-AddCostColumnsToStockLedger.ts`
- `apps/api/src/database/migrations/1781800000000-CreateInventoryReportViews.ts`

**Backend module**: `apps/api/src/modules/inventory-reports/`

**Foundation services đã sửa**:

- `apps/api/src/modules/inventory/ledger/stock-ledger.service.ts`
- `apps/api/src/modules/inventory/ledger/stock-ledger-entry.entity.ts`
- `apps/api/src/modules/inventory/location/item-cost-snapshot.service.ts` (mới)
- `apps/api/src/modules/inventory/goods-receipt/goods-receipt.service.ts`
- `apps/api/src/modules/inventory/goods-issue/goods-issue.service.ts`
- `apps/api/src/modules/inventory/transfer/stock-transfer.service.ts`
- `apps/api/src/modules/rbac/permissions.seed.ts`
- `apps/api/src/app.module.ts`

**Frontend**:

- `apps/backoffice-web/src/api/inventory-reports.ts`
- `apps/backoffice-web/src/hooks/use-inventory-reports.ts`
- `apps/backoffice-web/src/hooks/use-filter-options.ts`
- `apps/backoffice-web/src/pages/reports/storage/*`
