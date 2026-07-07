# TKT-RFF-04 FE: mode-aware scoping + warehouse cascade + extend hook + reset

## Epic

[EPIC-06072026 Report filter theo mode + kho phụ thuộc cửa hàng](../epics/EPIC-06072026-report-filter-store-warehouse.md)

## Summary

Logic cốt lõi: (1) SINGLE mode inject `store=[headerBranchId]` vào search để số liệu scope theo chi nhánh header dù không hiện dòng Cửa hàng; (2) dropdown "Kho" cascade — `branchIds` từ STORE scope (CHAIN) hoặc `[headerBranchId]` (SINGLE); (3) extend `useReportFilterOptions` nhận `branchIds`; (4) reset WAREHOUSE khi STORE đổi (CHAIN).

## Deliverables

- `.../_api/report-filter-options.api.ts` (edit) — `useReportFilterOptions(type, search?, params?: { branchIds?: string[] })`: đưa `branchIds` vào queryKey + truyền xuống `fetchReportFilterOptions` (query param; backend Transform xử lý array/comma).
- `.../ReportPageTable/ReportPageTable.tsx` (edit) — đọc `activeBranchId = useBranchStore((s) => s.branchId)`, thêm vào `ReportDataArgs` (`activeBranchId`) + queryKey.
- `.../_api/report-data-source.ts` (edit) — `ReportDataArgs` thêm `activeBranchId?: string | null`; `inventoryDataFetcher` truyền `{ branch, activeBranchId }` cho `buildInventorySearchFilters`.
- `.../_api/inventory-report-v2.api.ts` (edit) — `buildInventorySearchFilters(filters, ctx: { branch: STORE_TYPE; activeBranchId?: string | null })`:
  - CHAIN: `store` từ dòng STORE như hiện tại.
  - SINGLE + `activeBranchId` + report thuộc nhóm split (backendKey ∈ {inventory-stock-summary, inventory-document-detail, inventory-stock-quantity-detail, inventory-transfer-summary}): inject `store = { scope: 'group', storeIds: [activeBranchId] }`.
- `.../ReportFilterLine/WarehouseSelectField/WarehouseSelectField.tsx` (new) — tính `branchIds`:
  - đọc `isChain`/`branchId` từ `useBranchStore`, `store` từ report filters.
  - CHAIN: `store?.scope === 'group' && store.storeIds.length ? store.storeIds : undefined`.
  - SINGLE: `branchId ? [branchId] : undefined`.
  - gọi `useReportFilterOptions(WAREHOUSE, undefined, { branchIds })`, render `ReportSelectField` (đã @erp/ui) placeholder "Tất cả kho". Nếu `value` không thuộc options mới (đổi branch) → gọi `onChange("")` (defensive reset).
- `.../ReportFilterLine/ReportFilterLine.tsx` (edit) — case `WAREHOUSE` → `<WarehouseSelectField value=... onChange=... />`.
- `apps/backoffice-web/src/store/page-stores/report/report.store.ts` (edit) — trong `setFilterValue`, `line === STORE` → reset `WAREHOUSE = ""` (giữ logic period↔range).

## Acceptance Criteria

- [ ] CHAIN: scope='group' storeIds=[A] → Kho chỉ kho A; scope='all' → tất cả kho org; đổi Cửa hàng → WAREHOUSE reset "".
- [ ] SINGLE: Kho = kho của `headerBranchId`; search gửi `store={scope:'group', storeIds:[headerBranchId]}` → số liệu chỉ chi nhánh đó (4 báo cáo split).
- [ ] SINGLE + đổi chi nhánh header (không remount): Kho options refetch theo branch mới, giá trị Kho cũ không thuộc options → tự reset "".
- [ ] Báo cáo #7/#8 (không thuộc nhóm split) không bị inject `store` → giữ nguyên hành vi (SOURCE/RECEIVING/STORE_SINGLE).
- [ ] api-client (từ RFF-01) có `branchIds` trên query filter-options.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh; typecheck sạch.
- [ ] Không TODO/FIXME.

## Tech Approach

`buildInventorySearchFilters` là điểm hội tụ scoping — gate inject theo `backendKey` (dùng `getReportBackendKey(reportType)`) để chỉ 4 báo cáo split bị inject. `WarehouseSelectField` đọc `useBranchStore` trực tiếp (mode + branchId) → không cần thread thêm qua props. Reset qua store `setFilterValue` (CHAIN) + defensive reset trong component (SINGLE đổi branch) phủ cả 2 đường.

## Testing Strategy

- Manual (RFF-05): CHAIN đổi cửa hàng → Kho refetch + reset + số liệu đổi; SINGLE → không có dòng Cửa hàng, Kho + số liệu theo header branch; đổi header branch → cập nhật.

## Dependencies

- Depends on: TKT-RFF-01 (api-client branchIds), TKT-RFF-02 (`ReportSelectField` @erp/ui), TKT-RFF-03 (registry mode split).
- Blocks: TKT-RFF-05.
