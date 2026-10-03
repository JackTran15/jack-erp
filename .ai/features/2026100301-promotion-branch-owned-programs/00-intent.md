---
feature: promotion-branch-owned-programs
slug: 2026100301-promotion-branch-owned-programs
owner: Akenzy
created: 2026-10-03
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Branch-owned promotion programs (CTKM theo chi nhánh)

Let a branch manager (Quản lý chi nhánh) create and run their own promotion programs for
their own branch, without going through the company, while the company keeps full control
over every program in the chain.

## Problem

Promotion programs (CTKM) are managed centrally today, and only centrally:

- **Nobody below company level can author a program.** `BRANCH_MANAGER_PERMISSION_KEYS`
  (`apps/api/src/database/seeds/org-role-permissions.ts:118`) is a prefix filter that does
  not include `promotion.`, so the branch manager holds none of `promotion.read`,
  `promotion.write`, `promotion.delete`. Only User Root and General Manager (derived from
  `ALL_PERMISSION_KEYS`) reach `/v2/promotions` create/edit/status/delete
  (`promotion-v2.controller.ts`). A store that wants a local promotion has to ask head office
  to set it up.
- **A program has no owner, only a scope.** Applicability already exists: `promotion_branches`
  (empty = whole chain, BR-005), the `StoreScopePromotionSection` on all 5 forms, and the
  engine's `BRANCH_SCOPE` check (`domain/engine/strategies/eligibility.ts:37`). But scope says
  *where a program runs*, not *who manages it*. `promotion_programs.branch_id` is the
  inherited BaseEntity column for the creator's branch and is deliberately left unset by the
  mapper (`application/mappers/promotion.mapper.ts:186` — "CTKM are managed centrally"), so
  nothing can tell a branch's program from a chain program.
- **There is no rule for a local program competing with a chain program.** The resolver
  (`domain/engine/promotion-resolver.ts:68`) orders contested lines / gift slot / invoice slot
  by cashier selection → `priority` → `createdAt` → id. A store's own program has no way to
  take precedence at its own counter.

## Decisions taken in the intent round (2026-10-03, Akenzy)

1. **Who creates:** the Quản lý chi nhánh role gets promotion read/write/delete, limited to
   programs owned by a branch they belong to. Company admins (User Root, Quản lý tổng) keep
   creating chain programs.
2. **No approval step:** a branch manager activates their own program directly; no new
   pending/approved states.
3. **Visibility:** company sees, edits, stops and deletes every program including
   branch-owned ones. A branch manager sees chain programs that apply to their branch,
   read-only, and cannot touch another branch's programs.
4. **Stacking — branch wins:** at the owning branch's POS, when a branch-owned program and a
   chain program contest the same resource, the branch-owned program takes it. Cashier
   explicit selection still outranks this (ADR-03 is unchanged).

## Success signal

- Logged in as a seeded Quản lý chi nhánh on backoffice, the user opens Khuyến mại, creates
  any of the 5 program types, activates it, and it appears in the list marked as owned by
  their branch — without any company account touching it.
- At that branch's POS, a cart matching both that program and a chain program on the same
  line/slot shows the branch program applied and the chain program skipped; the same cart
  at another branch never sees the branch program.
- The same branch manager can open a chain program that applies to their branch but every
  edit/status/delete action is unavailable, and the API answers 403 if called directly; they
  cannot see or reach another branch's programs at all (404/403 by id).
- A Quản lý tổng account sees all programs, can filter by owner (chain vs a given branch),
  and can edit or stop a branch-owned program.
- Existing programs keep behaving exactly as before (they become chain-owned).

## Out of scope

- Approval / review workflow for branch programs.
- Per-branch values or per-branch budgets/quotas inside one shared program.
- Branch-owned discount codes (`discount-code`) and vouchers (`voucher`) — programs only.
- Changing how chain programs stack with each other (ADR-03 / ADR-07 ordering stays).
- Reporting changes beyond what already exists per program (no new "branch promotion" report).
- Legacy v1 `promotion.controller.ts` / `PromotionEntity` (`applicableBranchIds`) surface.

## Constraints

- Multi-tenant scoping is load-bearing: every query still filters by `actor.organizationId`;
  branch ownership checks use the actor's `branchIds` from the JWT, not the `X-Branch-Id`
  header alone.
- Schema changes only via TypeORM migration (`synchronize: false`); existing rows must
  migrate to chain-owned with no behaviour change.
- Role permissions are rebuilt from `org-role-permissions.ts` by the sync seed — the grant to
  Quản lý chi nhánh goes there (plus a migration for already-seeded orgs, matching how prior
  grants were rolled out).
- The promotion engine stays pure (no I/O, no clock); ownership must reach it as data on
  `PromotionProgram`.
- API changes regenerate `packages/api-client` via `pnpm openapi:generate`; UI strings are
  Vietnamese.
