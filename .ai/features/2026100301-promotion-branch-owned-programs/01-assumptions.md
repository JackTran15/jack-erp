---
feature: promotion-branch-owned-programs
blocking_open: 0
---

# Assumption register

Rows A-01..A-05 were blocking and were put to Akenzy in the question round of 2026-10-03.
The rest are non-blocking defaults: each says what the plan does if nobody objects, and stays
`pending` until a human confirms it (G5 needs them all closed).

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | A branch-owned program runs only at its owning branch: `promotion_branches` = [owner], the store-scope section is locked for it, and the server overwrites any submitted `branchIds` | high | yes | ADR-04 invariant, T-01-03 scope forcing, T-01-06 form lock | confirmed | Confirmed by Akenzy, 2026-10-03 — "Owning branch only" |
| A-02 | A company stop is plain status, not a lock: the branch manager may turn a program the company stopped back on | high | yes | Would add a lock flag + rule to UOW-01/UOW-02 | confirmed | Confirmed by Akenzy, 2026-10-03 — "Yes, no lock" |
| A-03 | Ownership is fixed at create from the creator and never changes: chain managers always create chain programs (no owner picker); branch managers always create programs owned by their active branch | high | yes | Owner picker on the form + `ownerBranchId` in the create DTO | confirmed | Confirmed by Akenzy, 2026-10-03 — "No" owner picker |
| A-04 | A branch manager with several branches manages only the programs of the **active** branch (header switcher / `actor.branchId`), not all assigned branches | high | yes | Search filter, create owner, policy checks in T-01-03/T-01-04 | confirmed | Confirmed by Akenzy, 2026-10-03 — "Active branch only" |
| A-05 | Every existing program becomes chain-owned (`owner_branch_id` NULL), including programs whose scope is a single branch; nothing is inferred from `branch_id` or scope | high | yes | Migration backfill in T-01-01 | confirmed | Stated in 00-intent.md Success signal ("Existing programs … become chain-owned"); G0 passed by Akenzy 2026-10-03 |
| A-06 | "Company" is whoever holds a new permission key `promotion.chain.manage` — never a role name (authorization is by key only, `hooks/usePermissionCheck.ts:20-23`). The migration grants it to every role that holds `promotion.write` before the migration runs, so no current account loses power | high | no | ADR-02; T-01-02 grant query | pending | — |
| A-07 | The branch manager gets `promotion.read/write/delete` by adding `promotion.` to the `BRANCH_MANAGER_PERMISSION_KEYS` prefix filter (with `promotion.chain.manage` in `ROOT_AND_GENERAL_MANAGER_ONLY_KEYS`), and already-seeded orgs get them via a migration granting to roles that hold `customer.merge` (same manager-level anchor as `1790100800000-CustomerPointsPermissions.ts`) | medium | no | Custom roles without `customer.merge` need manual ticking in Quản lý vai trò | pending | — |
| A-08 | Chain managers see every program in the organization in the list, regardless of their active branch. Today `search-promotions-v2.handler.ts:64` narrows even a Quản lý tổng to programs applicable to the active branch — that narrowing is dropped for chain managers | high | no | T-02-01 search change; GM list grows | pending | — |
| A-09 | For a branch manager, a program they may not see (another branch's, or a chain program not applicable to the active branch) answers **404**; a chain program they can see but not manage answers **403** on write | medium | no | Error taxonomy + e2e expectations only | pending | — |
| A-10 | "Branch wins" is an ordering tier in the resolver, placed after cashier explicit selection (ADR-03 of the engine) and before `priority`, and it applies in all three phases: line-claiming, gift slot, invoice slot | high | no | ADR-05; T-03-01 | pending | — |
| A-11 | Branch managers may edit `priority`; it orders programs only inside the same ownership tier | medium | no | Possible extra field lock on the form | pending | — |
| A-12 | Duplicating any program the actor can read follows the create rule: a branch manager's copy is owned by their active branch with scope [that branch]; a chain manager's copy is chain-owned | medium | no | T-01-03 duplicate handler | pending | — |
| A-13 | Item-discount Excel import/export (`/v2/promotions/item-discount-lines/*`) needs no ownership check — it never writes the DB and reads only catalogue data | high | no | One more policy call if wrong | pending | — |
| A-14 | POS shows nothing new about ownership; only the evaluation order changes | high | no | Extra POS UI ticket | pending | — |
| A-15 | A non-chain actor with no active branch (`actor.branchId` undefined) cannot create, duplicate or list — 403 | high | no | Error taxonomy | pending | — |
| A-16 | Sales / cashier roles keep seeing the "Chương trình khuyến mãi" nav entry (`pos.promotion.read`) and getting 403 on the list — pre-existing, untouched here | high | no | None for this feature | pending | — |
| A-18 | Server-side pricing (checkout saga `evaluate-promotion` step, exchange `evaluateNewLines`) uses the **invoice's** branch, falling back to the caller's active branch when the invoice has none | high | yes | AC-20, T-03-03 | confirmed | Confirmed by Akenzy, 2026-10-03 — "fix theo hóa đơn fallback actor" |
| A-17 | The legacy v1 surface (`promotion.controller.ts`, `PromotionEntity.applicableBranchIds`) is untouched | high | no | None for this feature | pending | — |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
|----|-----------------|-----------------------|-------------|
| — | "Per branch" meant restricting where a program applies | Already built end to end (`promotion_branches`, `StoreScopePromotionSection`, `BRANCH_SCOPE`); the ask is branch **ownership** | Feature re-scoped to ownership before G0 |
