---
feature: promotion-scope-points-toggle
adr_count: 3
---

# Logical design — Promotion Scope Lock & Per-Program Points Toggle

## Approach

Two independent halves, touching the same invoice-discount promotion form and the same
checkout saga, but with no shared code path between them.

**Half 1 — Scope lock (US-01).** `ApplyScopePromotionSection.tsx` currently renders an
editable `RadioGroup` bound to `form.applyScope` (`ApplyScope.NON_PROMO_ONLY` /
`ApplyScope.ALL_ITEMS`, from `APPLY_SCOPE_OPTIONS` in `program-form.constants.ts:62-65`).
It becomes a locked, non-interactive display that always reads "Tất cả hàng hóa trong hóa
đơn" (the `ALL_ITEMS` label) — no `RadioGroup`, nothing bound to `form.applyScope` for
editing. Three FE-only changes:
1. `ApplyScopePromotionSection.tsx` — replace the `RadioGroup` with a static label.
2. `program-form.constants.ts:209` — `buildInitialFormState()`'s `applyScope` default
   changes from `ApplyScope.NON_PROMO_ONLY` to `ApplyScope.ALL_ITEMS`.
3. `promotion.mapper.ts` — `invoiceDiscountToDto()` (line 520-530) sends
   `invoiceScope: PromotionInvoiceScope.ALL_ITEMS` unconditionally (not derived from
   `form.applyScope`), so AC-02 holds even if a loaded form still carries a stale
   `NON_PROMO_ONLY` value in memory. `invoiceDiscountFromDetail()` (line 532-544) is left
   as-is — it still hydrates `form.applyScope` from `detail.invoiceScope` for round-trip
   fidelity, it just has no UI left that lets the value change.

No backend change: `PromotionInvoiceScope.ALL_ITEMS` and the engine branch that honors it
(`invoice-discount.strategy.ts:37-38`) already exist and already work. Only the form stops
offering the other choice. No migration, no entity change, no DTO change for this half.

**Half 2 — Points checkbox (US-02..US-06).** A new `accrue_points boolean not null default
false` column on `promotion_programs`, threaded through the full clean-arch chain that
already carries `invoiceScope`/`discountMode` end to end:

```
promotion_programs.accrue_points (DB)
  ↕ promotion.mapper.ts: toDomain() / toPersistence()
PromotionProgram.accruePoints (domain aggregate, promotion-program.ts)
  ↕ promotion-dto.mapper.ts (DTO → props) / promotion-program.response.dto.ts (toDetail)
create-promotion.dto.ts / PromotionProgramDetail (application layer, wire contract)
  ↕ apps/backoffice-web promotion.mapper.ts: invoiceDiscountToDto() / invoiceDiscountFromDetail()
ProgramFormState.accruePoints (FE form state)
  ↕ new checkbox component in PromotionInvoiceDiscount.tsx
```

Every hop mirrors an existing field on the same path (`invoiceScope` for the entity/domain/
DTO hops, `AutoApplyCheckbox` for the FE checkbox shape) — no new pattern is introduced.

At checkout, the value has to reach `AppliedProgram` (the shape `evaluate-promotion.step.ts`
already copies wholesale into `ctx.promotion.appliedPrograms`) before `compute-totals.step.ts`
can see it per-applied-program. `promotion-resolver.ts`'s `toAppliedProgram()` (line 179-198)
already has a conditional spread that adds `discountMode`/`discountValue` **only when
`type === INVOICE_DISCOUNT`** — `accruePoints` is added to that same conditional spread, for
the same reason (A-05): the other four program types never populate it, so it stays
`undefined` for them rather than picking up the column's `false` default. This is the
mechanism that keeps A-05's scoping guarantee true at the checkout layer, not just the form
layer — see "Error taxonomy" below, this is the one subtle correctness point in the whole
design.

`compute-totals.step.ts` derives `pointsBlocked = appliedPrograms.some(p => p.accruePoints
=== false)` (never checks `type` explicitly — it doesn't need to, because `accruePoints` is
`undefined`, not `false`, on every non-invoice-discount program per the paragraph above) and
stores it on `ctx.totals.pointsBlocked` (a new field on `CheckoutTotals`,
`checkout-step.ts:113-132`) — computed once, read twice, never re-derived:
- `persist-invoice.step.ts:71` — `invoice.pointsEarned = invoice.customerId &&
  !totals.pointsBlocked ? totals.pointsEarned : 0;` (extends the existing customerId guard,
  same line).
- `enqueue-outbox.step.ts:143-167` — the `if (invoice.customerId)` guard around the
  `LOYALTY_POINTS_AWARD` enqueue gains `&& !totals.pointsBlocked`. When blocked, the outbox
  row is never written, so `loyalty-points.consumer.ts` → `MembershipCardService.
  awardPointsForInvoice` (the only caller site of `awardPointsForInvoice` in the codebase —
  verified) is never invoked for that invoice. There is no second decision to drift from the
  first.

## Alternatives rejected

| Option | Why not |
|---|---|
| Retroactively migrate existing saved invoice-discount programs' `invoiceScope` from `NON_PROMO_ONLY` to `ALL_ITEMS` | Out of scope per A-03 (non-blocking, deferred); AC-03 explicitly requires untouched programs to keep behaving as before |
| New `invoice.pointsBlocked` (or similar) column, re-derived independently by `membership-card.service.ts` / `loyalty-points.consumer.ts` by re-querying which promotion programs applied | Two independent implementations of the same rule is exactly the drift risk `00-intent.md` calls out as the central question (A-04). The outbox-skip design achieves the identical observable guarantee (AC-07/AC-09: "no drift") with strictly less new state — zero new invoice columns, zero new consumer-side branching — because there is structurally only one decision point left, not two that must agree |
| Expand the "Tích điểm cho khách hàng" checkbox to all 5 promotion-type variants (`PromotionProductDiscount`, `PromotionTieredDiscount`, `PromotionBuyGet`, `PromotionGift`) now | A-05: the human's request was scoped to the invoice-discount form's "Phạm vi áp dụng" context; the other 4 variants currently have no UI path to set the column at all, and giving them one is a separate, larger FE surface (4 more form components) than what was asked. Flagged explicitly as a follow-up feature, not silently folded in |
| Populate `accruePoints` unconditionally on every `AppliedProgram` (i.e. drop the `type === INVOICE_DISCOUNT` guard on the conditional spread) | Would silently make `pointsBlocked` true for every checkout that applies a product-discount/tiered/buy-get/gift program, because those programs' `accrue_points` column defaults to `false` and no admin UI will ever set it otherwise (A-05's own flagged risk). The conditional spread is what keeps those 4 types inert for this feature, matching the existing `discountMode`/`discountValue` pattern exactly |

## Domain model

| Entity | Fields | Notes |
|---|---|---|
| `PromotionProgramEntity` (`promotion-program.entity.ts`) | `+ accruePoints: boolean` (column `accrue_points`, `not null default false`) | Placed next to `invoiceScope` per the ticket's target neighborhood. Unlike `invoiceScope`, not nullable — every program row has a concrete true/false, matching the "default OFF" business rule literally |
| `PromotionProgram` (domain aggregate, `promotion-program.ts`) | `+ readonly accruePoints: boolean` in `PromotionProgramProps`, class field, constructor assignment, and the `toProps()`-style reconstruction (~line 352) | No new validation rule — it is an unconstrained boolean, unlike `discountValue`'s conditional validation |
| `AppliedProgram` (both the domain-internal `evaluation.ts:20-37` shape and the wire-facing `@erp/shared-interfaces` shape, `promotion/index.ts:237-254`) | `+ accruePoints?: boolean` — set **only** when `type === INVOICE_DISCOUNT`, mirroring the existing `discountMode`/`discountValue` conditional | This is the field that lets `compute-totals.step.ts` treat "not an invoice-discount program" and "invoice-discount program with the box checked" identically (both leave `pointsBlocked` unaffected) |
| `CheckoutTotals` (`checkout-step.ts:113-132`) | `+ pointsBlocked: boolean` | Computed once by `compute-totals.step.ts`; read by `persist-invoice.step.ts` and `enqueue-outbox.step.ts`. Not stored on the invoice row — it is a saga-run-scoped derived value, not persisted state |

## Contracts

### Migration (new file, hand-written per `CLAUDE.md`)

`apps/api/src/database/migrations/<ts>-AddPromotionProgramAccruePoints.ts`, timestamp greater
than the latest existing migration (`1788800000000-AddSupplierDebtOverpaidStatus.ts`) —
suggest `1788900000000`. Shape mirrors `1788700000000-AddWarehouseVoucherRevision.ts`:

```sql
ALTER TABLE "promotion_programs"
ADD COLUMN IF NOT EXISTS "accrue_points" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "promotion_programs"."accrue_points" IS
  'Whether this promotion program allows the invoice it applies to to earn loyalty points. Default false ("Tích điểm cho khách hàng" unchecked). Only meaningful for INVOICE_DISCOUNT-type programs today (see ADR-03).';
```

`down()`: `ALTER TABLE "promotion_programs" DROP COLUMN IF EXISTS "accrue_points"`.

### DTO field

`create-promotion.dto.ts`, in the neighborhood of `invoiceScope` (line 250-253):

```ts
@ApiPropertyOptional({ default: false, description: 'INVOICE_DISCOUNT only' })
@IsOptional()
@IsBoolean()
accruePoints?: boolean;
```

Same DTO serves create and update (existing pattern for this form — verified against
`invoiceScope`'s single declaration site). `promotion-program.response.dto.ts`'s `toDetail()`
(line 100-140) gains `accruePoints: program.accruePoints` alongside `invoiceScope:
program.invoiceScope`.

No new REST endpoints. `openapi:generate` must be re-run once the API DTO/response shape
changes, per `CLAUDE.md`'s "After changing API endpoints" rule — flagged as a ticket
done-when item in UOW-02, not something this design decides.

## Error taxonomy

No new user-facing error class — this feature adds a boolean, not a new validated business
rule with rejectable input. Two things worth stating explicitly instead of leaving implicit:

**Migration impact on existing programs — resolved.** Every invoice-discount promotion
program that exists today would have gotten `accrue_points = false` by column default the
moment this migration ran — including programs an admin never touched and had no reason to
expect changed — flipping every live checkout from "earns points" (today's behavior) to
"earns zero points" on deploy, before any admin re-saved the program with the new checkbox.

Confirmed by Akenzy via AI-DLC discovery Q&A, 2026-08-17: this was **not** intended. The
migration backfills existing rows to `accrue_points = true` in the same migration that adds
the column, preserving today's points behavior for every already-live program; only programs
created *after* this ships default to `false`, per "Default là không tích điểm" read as
applying to new programs going forward. See `T-02-01` for the exact `ALTER TABLE` + backfill
`UPDATE` sequence.

**`accruePoints` on non-invoice-discount programs.** The column exists on every program row
regardless of `type` (single table, no per-type schema), defaults to `false`, and has no form
UI to ever become `true` for the other 4 types (A-05). This is intentional and inert per
ADR-03 + the conditional spread in `toAppliedProgram()` — documented here so a future reader
does not "fix" the column default thinking it is a bug.

## ADRs

### ADR-01 — Scope lock is a form-layer-only change
**Context:** "Phạm vi áp dụng" currently offers two values; the business wants only one
going forward, but existing data must keep working.
**Decision:** Remove the radio picker from `ApplyScopePromotionSection.tsx` and force the
save path to always send `ALL_ITEMS`. No backend change: `PromotionInvoiceScope.ALL_ITEMS`
and its engine branch already exist. No retroactive migration of already-saved
`NON_PROMO_ONLY` programs (A-03).
**Consequences:** Zero backend risk, zero migration, one-file-effectively FE change. The
tradeoff is permanent: `invoice-discount.strategy.ts`'s `NON_PROMO_ONLY` branch becomes dead
code for every program created after this ships, but must stay in the codebase indefinitely
to serve programs saved before it (until/unless a future backfill removes it).
**Status:** accepted

### ADR-02 — Points-blocking is enforced once, at checkout time, via an outbox skip
**Context:** "Does this invoice earn points" must be decided consistently across a
synchronous path (`compute-totals.step.ts` → `persist-invoice.step.ts`, sets
`invoice.pointsEarned`) and an asynchronous path (`enqueue-outbox.step.ts` →
`loyalty-points.consumer.ts` → `MembershipCardService.awardPointsForInvoice`). Two
independent implementations of the same rule is a drift risk (A-04).
**Decision:** Compute `pointsBlocked` exactly once, inside the checkout transaction
(`compute-totals.step.ts`), store it on `ctx.totals` (not on the `invoices` row), and use it
to (a) zero `invoice.pointsEarned` and (b) skip enqueueing the `LOYALTY_POINTS_AWARD` outbox
event entirely when true. `awardPointsForInvoice` has exactly one caller in the codebase
(`loyalty-points.consumer.ts`, verified), so skipping its trigger event is equivalent to
skipping the award — there is no second code path left that could independently decide
differently, because there is no second decision being made.
**Consequences:** No new `invoices` column, no new consumer-side re-derivation logic, no
possible drift by construction (not by careful duplication). The cost: `pointsBlocked` is
saga-run-scoped, not persisted — if a later feature needs to know after the fact why a given
invoice earned zero points, it is not recoverable from the invoice row alone (though it is
still reconstructable from the `invoice_checkout_promotions` snapshot rows'
`programId`/`type`, which do persist).
**Status:** accepted

### ADR-03 — Points checkbox is scoped to the invoice-discount promotion variant only
**Context:** The human requested the checkbox in the context of "Khuyến mại" broadly,
without explicitly restricting it to one variant. Whether it should appear on all 5
promotion-type variant forms is a genuine open question (A-05).
**Decision:** Ship the checkbox on `PromotionInvoiceDiscount.tsx` only, matching where the
scope-lock section (ADR-01) already lives and matching the literal context of the human's
request. `PromotionProductDiscount`, `PromotionTieredDiscount`, `PromotionBuyGet`,
`PromotionGift` get no checkbox; their programs' `accrue_points` column value is never
populated onto `AppliedProgram` (the conditional spread in `toAppliedProgram()` guards on
`type === INVOICE_DISCOUNT`), so it cannot gate points regardless of the column's default.
**Consequences:** Smaller diff, matches what was actually asked. Expanding to the other 4
variants is an explicit, separate follow-up feature — it needs its own FE work (4 more form
components) and, per the "Migration impact" note above, its own decision about defaults for
programs of those types that predate the expansion.
**Status:** accepted
