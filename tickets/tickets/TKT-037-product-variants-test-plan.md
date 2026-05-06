# TKT-037 Product variants test plan & DoD gate

## Epic

[EPIC-006 Product variants & catalog](../epics/EPIC-006-product-variants-catalog.md)

## Summary

Test suite tổng hợp: unit / integration / e2e cho **product, attribute, variant, tồn, POS**. Gate cuối để merge epic vào main.

## Deliverables

- Unit tests: service logic (TKT-028–034).
- Integration tests (NestJS e2e): API CRUD product → attribute → generate variants → stock display → POS checkout.
- UI e2e (Playwright): backoffice create product → matrix view; POS select variant → checkout.
- Coverage target: backend ≥80%, frontend key flows pass.

## Acceptance Criteria

- [ ] TKT-028: `ProductCrudService` unit + e2e CRUD pass.
- [ ] TKT-029: `AttributeService` create/update/delete options pass.
- [ ] TKT-030: `VariantGenerationService` full Cartesian 3×2 → 6 items pass; idempotent test.
- [ ] TKT-031: `ItemCrudService` join product test; legacy null productId pass.
- [ ] TKT-032: storage location rule validate pass; multi-storage test.
- [ ] TKT-033: stock balance list trả productName + variantLabel pass.
- [ ] TKT-034: POS checkout variant pass; validate itemId có junction pass.
- [ ] TKT-035: UI e2e tạo product + matrix view render pass.
- [ ] TKT-036: migration script staging OK; rollback OK.
- [ ] Smoke test full flow: product → sinh variant → nhập kho → POS bán → ledger ghi đúng.

## Definition of Done

- [ ] Tất cả tests trong PR TKT-027–036 pass CI.
- [ ] Staging e2e manual: tạo product "Giày Gelli" → Size(39,40,43) × Màu(Nâu,Đen) → 6 biến thể → nhập 10 chiếc size 39 Nâu → POS bán → ledger `-1` item đúng → stock balance update.
- [ ] No CRITICAL / HIGH bug open; MEDIUM bug có workaround hoặc defer.
- [ ] DoD: mọi ticket TKT-027–036 merged; README module product updated; epic AC (EPIC-006) pass.

## Tech Approach

### Test categories

1. **Unit**: mock repo, test service logic đơn lẻ (jest).
2. **Integration (API e2e)**: `apps/api/test/*.e2e-spec.ts` → request HTTP → check DB.
3. **UI e2e**: `apps/backoffice-web/e2e/product-variants.spec.ts` (Playwright).
4. **Manual smoke**: staging deploy → QA checklist.

### Coverage thresholds

- Backend service: 80% lines (jest --coverage).
- Frontend: key flows pass (không yêu cầu % nếu thiếu tooling).

### CI pipeline

- PR → run `npm run test` (unit) + `npm run test:e2e` (integration).
- UI e2e: optional separate job (nếu Playwright CI setup).

## Testing Strategy

- **Unit**: mỗi service 1 test file; mock dependencies.
- **Integration**: test file `product-variants.e2e-spec.ts`:
  - Setup: insert org, branch, storage, location.
  - Test: POST product → POST attributes → POST generate → GET items → assert count.
  - Teardown: cleanup test data.
- **UI e2e**: Playwright script:
  - Login backoffice → navigate `/products` → click "Tạo mới" → fill form → submit → assert table row.
  - Click row → "Thuộc tính" tab → add Size/Màu → "Sinh biến thể" → matrix hiển thị.
- **Smoke**: manual QA theo checklist epic AC.

## Dependencies

- Depends on: TKT-027–036 (mọi ticket khác).
- Blocks: merge epic EPIC-006 vào main / production deploy.

