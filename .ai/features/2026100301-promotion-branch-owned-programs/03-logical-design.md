---
feature: promotion-branch-owned-programs
adr_count: 7
---

# Logical design — Branch-owned promotion programs

## Approach

Add an explicit owner to every promotion program: `promotion_programs.owner_branch_id`
(NULL = chain-owned). It is set once at create time from the creator — the active branch
for a branch manager, NULL for a holder of the new key `promotion.chain.manage` — and never
changes afterwards. A branch-owned program's applicable scope is pinned to its owner by a
domain invariant, so the existing `BRANCH_SCOPE` eligibility check keeps doing the "runs
only at its own store" work unchanged.

Who may do what is decided by one application-layer class, `PromotionAccessPolicy`, called
from every v2 handler that reads or writes a program by id, and by the search handler for
list filtering. Guards cannot do it: the answer depends on the loaded row's owner (same
reason `sales-order.service.ts:1025` checks `read-all` in the service).

At checkout the resolver gains one sort tier — "owned by the cart's branch" — between the
cashier's explicit selection and `priority`. Nothing else in the engine changes.

The backoffice reads `ownerBranchId` from the API, compares it with
`getActiveBranch()` and the `promotion.chain.manage` key to decide whether a program is
manageable, and renders the form read-only or the store scope locked accordingly.

## Alternatives rejected

| Option | Why not |
| ------ | ------- |
| Reuse the inherited `branch_id` column as the owner | Documented in three places as "the creator's branch, not scope" and deliberately left unset by the mapper (`promotion.mapper.ts:186`); flipping its meaning silently changes every reader of `BaseEntity.branchId`. A named column is unambiguous. |
| Infer ownership from scope (single-branch scope = branch-owned) | Company already creates single-branch programs; they would suddenly become editable by that branch (contradicts A-05). |
| Decide "company" by role name (Quản lý tổng / Quản trị hệ thống) | Roles carry only an editable name; this codebase authorizes by permission key only (`usePermissionCheck.ts:20`). |
| Enforce ownership in a Nest guard | Guards read static metadata; the decision needs the loaded program's owner and the actor's active branch. |
| A separate `branch_promotion_programs` table / module | Duplicates the 5 program types, the engine wiring and the forms for what is one nullable column. |
| "Branch wins" by bumping branch programs' `priority` automatically | Mutates user data, collides with the chain's own priorities, and breaks the moment someone edits priority. |

## Domain model

| Element | Change | Notes |
| ------- | ------ | ----- |
| `PromotionProgramEntity` | + `ownerBranchId?: string \| null` → `owner_branch_id uuid NULL`, FK `branches(id)`, index `(organization_id, owner_branch_id)` | Migration backfills nothing: existing rows stay NULL (A-05) |
| `PromotionProgramProps` / `PromotionProgram` | + `ownerBranchId?: string` (undefined = chain) | Carried through `toProps()` |
| Invariant `OWNER_SCOPE_MISMATCH` | `ownerBranchId` set ⇒ `branchIds` deep-equals `[ownerBranchId]` | Domain validation issue, surfaces as 400 via `rethrowDomainError` |
| `PromotionAccessPolicy` (new, application) | `forActor(actor)` → `{ isChainManager, activeBranchId }`; `canRead(program)`, `assertReadable`, `assertManageable`, `ownerForNew()`, `searchScope()` | Uses `RbacService.hasPermission(userId, orgId, 'promotion.chain.manage')` once per request |
| `PromotionResolver` sort | selected → **owned by `cart.branchId`** → priority → createdAt → id | ADR-05 |

Access rules (`chain` = holds `promotion.chain.manage`; `B` = `actor.branchId`):

| Program | chain | branch manager, active B |
| ------- | ----- | ------------------------ |
| owner = B | read + manage | read + manage |
| owner = other branch | read + manage | 404 |
| owner NULL, scope empty or ∋ B | read + manage | read; write 403 |
| owner NULL, scope ∌ B | read + manage | 404 |
| create / duplicate | owner NULL, scope as submitted | owner = B, scope [B]; no B → 403 |

## Contracts

### `PromotionProgramSummary` / `PromotionProgramDetail` (`@erp/shared-interfaces`)
+ `ownerBranchId: string | null`, + `ownerBranchName: string | null` (summary: via LEFT JOIN `branches`; detail: same lookup in `GetPromotionHandler`).

### POST /v2/promotions/search
Request adds `owner?: { value: 'CHAIN' | <branchUuid> }` — honoured only for chain managers;
ignored (not an error) for branch managers, whose scope is fixed by the policy.
Branch-manager result: `owner = B OR (owner IS NULL AND (no promotion_branches OR one = B))`.
Chain-manager result: whole organization (A-08), then the owner filter.

### POST /v2/promotions, PUT /v2/promotions/:id, POST /v2/promotions/:id/duplicate
Request unchanged; no `ownerBranchId` field (A-03). For a branch-owned program the server
overwrites `branchIds` with `[owner]` before building the aggregate.
Failure modes: 403 `NO_ACTIVE_BRANCH`, 403 `PROGRAM_NOT_MANAGEABLE`, 404 not visible.

### GET /v2/promotions/:id, PATCH /v2/promotions/:id/status, DELETE /v2/promotions/:id
Unchanged shape; policy-gated per the table above.

### Permissions
New key `promotion.chain.manage` — label *Quản lý CTKM toàn chuỗi*, module `promotion`.

## State ownership

| State | Owner | Lifetime |
| ----- | ----- | -------- |
| Program owner | `promotion_programs.owner_branch_id` | Immutable after create |
| Active branch | JWT/`X-Branch-Id` → `actor.branchId`; FE `getActiveBranch()` | Session; branch switch reloads the page |
| "Can manage" on FE | derived per render from `ownerBranchId`, active branch, `usePermissionCheck(['promotion.chain.manage'])` | Never stored |

## Error taxonomy

| Condition | HTTP | Message / code | UI |
| --------- | ---- | -------------- | -- |
| Branch manager without active branch creates/duplicates/searches | 403 | `NO_ACTIVE_BRANCH` — "Chưa chọn chi nhánh" | Error toast |
| Visible chain program written by branch manager | 403 | `PROGRAM_NOT_MANAGEABLE` — "Chương trình do công ty quản lý" | Not reachable from UI (read-only form); toast if called |
| Program not visible to actor | 404 | `Promotion program "<id>" not found` (same text as missing) | Existing not-found handling |
| Branch-owned aggregate with scope ≠ [owner] | 400 | domain issue `OWNER_SCOPE_MISMATCH` on `branchIds` | Never reachable via API (server overwrites); guards against future callers |
| Missing `promotion.read/write/delete` | 403 | existing `PermissionGuard` message | unchanged |

## Observability

No new events. The search and policy denials log through the existing `PermissionGuard`
style `logger.warn` with userId, programId and reason, so a 403/404 dispute can be traced.

## ADRs

### ADR-01 — Ownership is a new nullable column, NULL = chain
**Context:** `branch_id` already exists but means "creator's branch" and is unset by design.
**Decision:** Add `owner_branch_id uuid NULL` with FK to `branches`; existing rows stay NULL.
**Consequences:** One migration, no data guessing; queries must use the new column, never `branch_id`.
**Status:** accepted

### ADR-02 — Company authority is the permission key `promotion.chain.manage`
**Context:** Authorization in this codebase is by key, never by role name.
**Decision:** New key, seeded to Root/GM only (`ROOT_AND_GENERAL_MANAGER_ONLY_KEYS`); migration grants it to every role holding `promotion.write` before the change; branch manager gets `promotion.read/write/delete` via the prefix filter.
**Consequences:** Custom roles keep today's power; an org can later make any role a chain manager by ticking one box.
**Status:** accepted

### ADR-03 — One `PromotionAccessPolicy`, called from handlers
**Context:** The decision depends on the loaded program and the active branch.
**Decision:** A single injectable policy owns every read/manage/create-owner/search-scope rule; handlers call it right after `findById`.
**Consequences:** The rules live in one unit-testable file; a new handler that forgets to call it is the main risk — mitigated by the e2e matrix in T-01-05.
**Status:** accepted

### ADR-04 — Branch-owned scope is pinned to the owner, in the domain
**Context:** A-01 — a branch program runs only at its own branch.
**Decision:** Domain invariant `ownerBranchId ⇒ branchIds = [ownerBranchId]`; handlers overwrite submitted `branchIds` before building the aggregate.
**Consequences:** The engine's existing `BRANCH_SCOPE` check does the runtime work; no engine change for scope.
**Status:** accepted

### ADR-05 — "Branch wins" is a resolver sort tier
**Context:** Intent decision 4; the resolver already allocates contested resources by sort order.
**Decision:** Sort = cashier-selected → `ownerBranchId === cart.branchId` → priority → createdAt → id, applied to all three phases.
**Consequences:** Pure, deterministic, one comparator line; ADR-03/ADR-07 of the engine unchanged.
**Status:** accepted

### ADR-07 — Server-side pricing uses the invoice's branch
**Context:** `load-draft` scopes the draft by organization only, and `EvaluateCartQuery` takes the branch from the actor. With branch-owned programs, a draft from HN checked out under an HCM session would receive HCM's programs.
**Decision:** The checkout step and the exchange path pass `{ ...actor, branchId: invoice.branchId ?? actor.branchId }` to `EvaluateCartQuery`. The live POS preview (`/v2/promotions/evaluate`) is unchanged — it has no invoice.
**Consequences:** The invoice records the promotions of the branch it belongs to; preview and checkout can differ only when the session's branch is not the invoice's, which is exactly the case being corrected.
**Status:** accepted

### ADR-06 — Invisible is 404, visible-but-locked is 403
**Context:** A-09; a branch manager should not learn other branches' program ids exist.
**Decision:** Policy throws `NotFoundException` (same text as a missing row) when the actor cannot read, `ForbiddenException` when they can read but not manage.
**Consequences:** e2e assertions are precise per cell of the access table.
**Status:** accepted
