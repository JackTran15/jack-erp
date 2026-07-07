# TKT-IVR-10 Tests + E2E + DoD gate

## Epic

[EPIC-06072026 Báo cáo kho hàng theo structure báo cáo bán hàng](../epics/EPIC-06072026-inventory-report-v2.md)

## Summary

Gate cuối epic: e2e suite cho contract mới, regression legacy, smoke FE 8 báo cáo, chốt Definition of Done toàn epic.

## Deliverables

- `apps/api/test/e2e/` — suite mới `inventory-report-v2.e2e-spec.ts` (chạy trên `erp_test`, serial):
  - `GET columns` cho 1 report StockPeriod (#1) + pivot (#5, assert cột động theo branch seed).
  - `POST search` #1: seed ledger entries 2 kỳ + 2 branch → assert opening/in/out/ending đúng, **totals = tổng toàn bộ rows** (limit nhỏ, 2 trang, totals không đổi giữa trang), columnFilter number + text.
  - `POST search` #7: thiếu sourceStoreId + actor không branch → 400.
  - Cross-tenant: org B không thấy data org A (search + filter-options + templates).
  - Templates: create → get → update (đổi visible/order) → delete round-trip với reportType kho; create với col lạ → 400.
  - `GET filter-options?type=warehouse` → chỉ storages org actor.
  - Legacy regression: gọi 2 endpoint legacy (`GET /reports/inventory/stock-summary`, `transfer-summary`) — response shape + số liệu không đổi so với trước epic.
- Migration check ghi nhận trong PR: `pnpm migration:run` → suite invoice template e2e cũ xanh → `pnpm migration:revert` clean.
- FE smoke checklist (PR description): 8/8 báo cáo — cột backend, dropdown thật, lọc cột, totals đúng khi phân trang, save/reload "Hiển thị cột".

## Acceptance Criteria

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api test:e2e` xanh toàn bộ (đọc output thật, không tin exit message — kafkajs handle leak đã biết).
- [ ] Tất cả AC của TKT-IVR-01..09 đã tick.
- [ ] Số liệu #6 thay đổi do bug-fix được ghi chú trong PR/release note.

## Definition of Done

- [ ] OpenAPI snapshot + api-client đã commit (TKT-IVR-07) khớp code cuối.
- [ ] Docs: cập nhật `docs/22-inventory-reports-views.md` — thêm section contract v2 (endpoints + registry + template) và đánh dấu surface legacy là "giữ nguyên, sẽ dọn sau".
- [ ] Không TODO/FIXME ngoài plan.

## Testing Strategy

Theo `apps/api/test/e2e/setup/global-setup.ts` (auto tạo `erp_test` + migrations — migration rename tự áp). Seed helper dùng lại pattern các suite inventory sẵn có.

## Dependencies

- Depends on: TKT-IVR-04, TKT-IVR-05, TKT-IVR-08, TKT-IVR-09
- Blocks: — (gate)
