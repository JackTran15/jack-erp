# TKT-IIF-09 E2E + test plan + DoD gate

## Epic

[EPIC-31052026 Inventory Item Form Refactor](../epics/EPIC-31052026-inventory-item-form-refactor.md)

## Summary

Cổng chất lượng cuối epic: e2e cho luồng BE (brand CRUD, category mở rộng, item create/update nested), kế hoạch test FE theo từng ảnh, và checklist DoD tổng.

## Deliverables

- `apps/api/test/e2e/inventory-item-form.e2e-spec.ts` (new) — chạy trên `erp_test`:
  - Brand: create → list → item create với `brandId` → assert `item.brandId` + `item.brand`.
  - Category: create có `parentGroupId` + `commissions[]` → assert lưu đủ; update reconcile commission.
  - Item update: PATCH `providers[]` mới (2 dòng, 1 primary) → assert reconcile; PATCH không kèm `providers` → giữ nguyên; PATCH `units[]` → reconcile default flags.
  - Org-scope: actor org A không thấy brand/category/item org B.
- Bảng đối chiếu UI ↔ ảnh (#2 layout, #3/#6 brand, #4/#5 category, #7 unit, #8 multi-provider, #9 đơn vị chuyển đổi) — screenshot before/after.

## Acceptance Criteria

- [ ] `pnpm --filter @erp/api test:e2e -- inventory-item-form` xanh (đọc output thật, không chỉ exit message — teardown Kafka có thể treo).
- [ ] `pnpm --filter @erp/api test` + `lint` xanh.
- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Mỗi ảnh tham chiếu có screenshot tương ứng + ghi chú diff (nếu có).
- [ ] `pnpm openapi:generate` đã chạy; `openapi.snapshot.json` + `schema.ts` commit (nếu diff).

## Definition of Done

- [ ] Toàn bộ Acceptance Criteria của TKT-IIF-01..08 đã đạt.
- [ ] Không còn hardcode `BRAND_SUGGESTIONS`/`GROUP_SUGGESTIONS`; không còn `ProvidersPlaceholderTable`.
- [ ] No Vietnamese trong backend source; FE string tiếng Việt.
- [ ] Không TODO/FIXME ngoài kế hoạch; `synchronize` vẫn false; mọi schema change trong migration tay.
- [ ] Migration verify: dữ liệu item/category cũ vẫn hợp lệ sau migrate (brandId/parentGroupId/description NULL).

## Tech Approach

- E2E theo pattern `apps/api/test/e2e` hiện có (global-setup tạo `erp_test`, `maxWorkers: 1`, `forceExit: true`).
- FE verify bằng screenshot thủ công (codebase chưa có visual test harness).

## Testing Strategy

- E2E BE (ở trên) + manual FE checklist theo ảnh.

## Dependencies

- Depends on: TKT-IIF-01..08.
- Blocks: (none — gate cuối).
