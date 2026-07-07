# TKT-RFF-01 BE: branch-scope options theo branchIds + clamp scope theo quyền chi nhánh (actor.branchIds) + openapi

## Epic

[EPIC-06072026 Report filter theo mode + kho phụ thuộc cửa hàng](../epics/EPIC-06072026-report-filter-store-warehouse.md)

## Summary

Hai việc backend gắn liền: (1) cho `filter-options?type=warehouse` nhận `branchIds` để dropdown Kho phụ thuộc cửa hàng; (2) **siết scope theo quyền Quản lý chi nhánh** — mọi scope (store options, warehouse options, report search) chỉ nằm trong `actor.branchIds` (tập chi nhánh user được phép), để dù request bị chế cũng không xem được chi nhánh ngoài quyền.

## Deliverables

- `apps/api/src/common/decorators/actor-context.decorator.ts` (edit) — expose `branchIds: string[]` trên `ActorContext` (decorator đã tính `allowed = user.branchIds`, chỉ cần trả ra):
  ```ts
  export interface ActorContext { ...; branchId?: string; branchIds: string[]; ... }
  return { ...; branchId: ..., branchIds: allowed, ... };
  ```
  Additive — không phá consumer hiện có.
- `apps/api/src/modules/inventory-reports/report/report-scope.util.ts` (edit) — thêm helper + clamp trong `resolveInventoryBranchIds` (KHÔNG đổi chữ ký → 8 report definition không phải sửa):
  - `permittedBranchIds(actor)`: `new Set(actor.branchIds)` — **luôn giới hạn**; `branchIds` rỗng ⇒ set rỗng ⇒ no-access (không phải org-wide; xem quyết định #3).
  - `scope='all'`/absent → `[...permitted]` (rỗng nếu user chưa gán chi nhánh → data rỗng).
  - `scope='group'` → ids; validate `∈ org` (như cũ) **và** `∈ permitted` (id ngoài quyền → `ForbiddenException`).
- `apps/api/src/modules/inventory-reports/queries/get-inventory-filter-options.handler.ts` (edit):
  - `stores()`: `where.id = In([...permitted])` khi có `permitted` (chỉ chi nhánh user quản lý).
  - `warehouses()`: thêm `branchIds` (RFF chính) → `In(branchIds ∩ permitted)`; nếu không truyền branchIds nhưng có permitted → `In([...permitted])`; luôn `organizationId = org`.
- `apps/api/src/modules/inventory-reports/dto/inventory-filter-options-query.dto.ts` (edit) — thêm `branchIds?: string[]` (optional, comma-split Transform + array), mirror `InventoryReportQueryDto.branchIds`.
- `apps/api/test/e2e/setup/test-app.ts` (edit nếu cần) — đảm bảo seed admin có `user_branch_assignments` (branchIds non-empty) để e2e chạy đúng nhánh clamp.
- `packages/api-client/openapi.snapshot.json` + `schema.ts` — regenerate (`branchIds` trên query filter-options).

## Acceptance Criteria

- [ ] `type=warehouse&branchIds=A,B` → storages `branch_id ∈ ({A,B} ∩ permitted)`, org-scoped; không truyền branchIds → `permitted` (hoặc tất cả kho org nếu unrestricted).
- [ ] `type=store` → chỉ chi nhánh `∈ permitted` (user quản lý); unrestricted admin → tất cả chi nhánh org.
- [ ] search `scope='group'` với storeId ngoài `permitted` → `403 Forbidden`; `scope='all'` → chỉ `permitted` (không phải toàn org) với user bị giới hạn.
- [ ] `actor.branchIds` rỗng → **no-access (data rỗng / options rỗng)**, KHÔNG org-wide (quyết định #3, đã verify không phá admin vì admin luôn có assignment).
- [ ] Không rò cross-org (org filter luôn hiện diện); không đổi báo cáo bán hàng (invoice dùng `resolveBranchIds` riêng).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + lint xanh; spec: `resolveInventoryBranchIds` clamp (all→permitted, group⊆permitted, foreign→403, unrestricted→org-wide) + filter-options stores/warehouses clamp.
- [ ] E2E: user 2 branch, request branch thứ 3 (cùng org, ngoài quyền) → 403; `type=store` chỉ trả 2 branch.
- [ ] `openapi:generate` chạy, snapshot + `schema.ts` committed.
- [ ] Docs: ghi caveat vận hành — sau khi gán chi nhánh mới phải re-login/refresh token (JWT `branchIds` baked lúc login); admin không phải người tạo branch cần `assignUser` thủ công.
- [ ] Không Vietnamese trong backend source; không TODO/FIXME.

## Tech Approach

Clamp đặt trong `resolveInventoryBranchIds` (điểm hội tụ mọi report search) + filter-options handler (điểm hội tụ dropdown) → không phải sửa từng report definition. Mirror tinh thần `resolveBranchIds` (invoice) nhưng dùng **tập `actor.branchIds`** thay vì `CONSOLIDATED_PERMISSION` binary — theo quyết định "clamp theo actor.branchIds". `branchIds` = `user_branch_assignments` lúc login; rỗng ⇒ no-access (đã verify admin luôn được gán khi tạo/seed nên không phá).

## Testing Strategy

- Unit: `report-scope.util.spec.ts` (clamp matrix) + `get-inventory-filter-options.handler.spec.ts` (stores/warehouses ∩ permitted).
- E2E: `inventory-report-v2.e2e-spec.ts` bổ sung case foreign-branch → 403 + store options = permitted.

## Dependencies

- Depends on: EPIC-06072026 inventory-report-v2.
- Blocks: TKT-RFF-04 (FE cascade cần `branchIds` trong api-client).
