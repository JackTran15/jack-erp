# TKT-CPP-01 Backend: finalize /v2/counterparties/search + OpenAPI regen + permission check

## Epic

[EPIC-21062026 Counterparty picker redesign](../epics/EPIC-21062026-counterparty-picker-redesign.md)

## Summary

The CQRS endpoint `POST /v2/counterparties/search` already exists (`CounterpartyController` + `SearchCounterpartiesHandler`) and returns `{ kind, id, code, name, phone, address }` filtered by `type` (supplier/customer/employee/all). This ticket verifies it is fully wired and consumable by the FE: module registered in `app.module.ts`, response fields complete, the `@RequirePermission` is held by all three FE consumer roles, then regenerate the typed `@erp/api-client` so the new picker can call it via `erpApi.POST`.

**No new backend logic.** The only possible code change is the permission guard if a gap is found (see Acceptance Criteria).

## Deliverables

- Verify `CounterpartyModule` is imported in `apps/api/src/app.module.ts` (git shows it modified — confirm).
- Confirm `apps/api/src/modules/counterparty/dto/search-counterparties.dto.ts`:
  - `SearchCounterpartiesDto`: `type` (`CounterpartyKind`, default `all`), `search?`, `page`, `pageSize` — declares every accepted field (global `whitelist:true`).
  - `CounterpartyOptionDto`: `kind`, `id`, `code`, `name`, `phone`, `address` — all `@ApiProperty`.
  - `SearchCounterpartiesResponseDto`: `{ data, total, page, pageSize }`.
- `apps/api/src/modules/counterparty/counterparty.controller.ts` — confirm `@RequirePermission(...)`; resolve the permission decision below.
- Run the API, then `pnpm openapi:generate`; commit `apps/api/openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` (do **not** hand-edit the generated file).

## Acceptance Criteria

- [ ] `POST /v2/counterparties/search` returns 200 with `{ data:[{kind,id,code,name,phone,address}], total, page, pageSize }` for `type` ∈ {supplier, customer, employee, all}.
- [ ] All queries filter by `actor.organizationId` (employee path joins `users`+`employee_profiles`; no cross-tenant leakage).
- [ ] **Permission:** the endpoint's required permission is held by the roles that use Nhập kho, Xuất kho, **and** treasury vouchers. If treasury roles lack `inventory.read`, switch the guard to a permission all three share (or add a dedicated `counterparty.read` and grant it) — pick the lowest-friction option and note it in the PR. No silent 403 for an existing voucher user.
- [ ] The `/v2/counterparties/search` operation appears in the regenerated `@erp/api-client` schema with the correct request/response shapes.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` passes (existing `search-counterparties.handler.spec.ts` green; extend it only if the permission change touches behavior).
- [ ] `openapi.snapshot.json` + generated `schema.ts` committed.
- [ ] No Vietnamese in backend source (errors/comments/Swagger/logs).
- [ ] `synchronize` stays false; no migration in this epic.

## Tech Approach

The handler already does per-type queries + a k-way merge for `type=all`. Do not rewrite it. If a permission change is needed:

```ts
// counterparty.controller.ts
@RequirePermission("counterparty.read") // or an existing shared perm verified across all 3 consumer roles
@Version("2")
@Post("counterparties/search")
search(@Actor() actor: ActorContext, @Body() dto: SearchCounterpartiesDto) {
  return this.queryBus.execute(new SearchCounterpartiesQuery(actor, dto));
}
```

## Testing Strategy

- Unit: existing `search-counterparties.handler.spec.ts` covers per-type + merge + org scoping.
- Manual: hit each `type` with curl/REST against a seeded org; confirm phone/address populate (suppliers/customers from their tables, employees from `employee_profiles`).

## Dependencies

- Depends on: existing `counterparty` module (in working tree).
- Blocks: TKT-CPP-02 (FE hook needs the regenerated client types).
