---
id: UOW-02
slug: points-checkbox-persists
title: "Tích điểm cho khách hàng" checkbox exists on the invoice-discount form and persists
demoable: true
duration: 1.5d
depends_on: []
requirements: [US-02]
verifies: [AC-04, AC-05]
risk: medium
status: todo
rollback: revert the migration (`down()` drops `accrue_points`) plus the entity/domain/DTO/FE changes — no data was migrated or backfilled by this UoW, so rollback is a clean drop
---

# UOW-02 — "Tích điểm cho khách hàng" checkbox exists and persists

## Demo script

1. Open the backoffice, go to Khuyến mại → Thêm chương trình → loại "Giảm giá hóa đơn".
2. Confirm a new checkbox "Tích điểm cho khách hàng" is visible near "Phạm vi áp dụng",
   unchecked by default (AC-04).
3. Check it, fill the remaining required fields, save.
4. Reopen the created program in edit mode: confirm the checkbox still shows checked
   (AC-05).
5. Confirm via `GET /v2/promotions/:id` (or the DB) that `accrue_points = true` was
   actually persisted, not just held in FE state.
6. Create a second program leaving the checkbox unchecked, save, reopen: confirm it shows
   unchecked and `accrue_points = false` in the DB.

## In scope

- New `accrue_points` column on `promotion_programs` (hand-written migration).
- The full existing clean-arch chain this program already has for `invoiceScope` gets one
  more field threaded through it: entity → domain aggregate → application DTO/mappers →
  FE form state → FE checkbox, on the invoice-discount variant only (ADR-03).

## Not in scope

- Wiring the flag into checkout (UOW-03 — this UoW only makes the value creatable and
  readable, it does not change what any checkout does).
- Any of the other 4 promotion-type variant forms (ADR-03 / A-05) — their `accrue_points`
  column value stays whatever the default is and has no UI path to change.
- The "migration impact on existing programs" question flagged in `03-logical-design.md`'s
  Error taxonomy — this UoW ships the column with its stated default (`false`); a backfill,
  if one turns out to be needed, is a separate follow-up migration, not part of this UoW.

## Risks

| Risk | Mitigation |
|---|---|
| 4 sequential mapping hops (entity → domain → DTO → FE) is more surface than a typical single-field addition | Each hop mirrors an existing field (`invoiceScope`) at the exact same site, so each ticket is a small, low-novelty diff rather than new design |
| FE `promotion.mapper.ts` write overlaps with UOW-01's FE mapper write to the same file | See UOW-01's own risk row — same file, same mitigation (do not run T-01-02 and T-02-05 in parallel) |
| `openapi:generate` must be re-run after the API DTO/response shape changes (`CLAUDE.md` convention) | Called out explicitly in T-02-04's done-when; the generated `packages/api-client` files are not listed in any ticket's `touches` because they are build output, not hand-written |

## Definition of done

- [x] AC-04, AC-05 pass
- [x] Migration applies cleanly on a fresh DB and its `down()` reverses cleanly
- [x] `accruePoints` round-trips through the full chain: DB → entity → domain aggregate →
      response DTO → FE form → FE checkbox → save DTO → DB, with no field lost at any hop
- [x] `openapi:generate` re-run and the regenerated `packages/api-client` snapshot committed
- [ ] Demoed and accepted at gate G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment — local-backoffice, 1/1 step passing
- [x] Evidence exists for every AC in `verifies` — AC-04 via S1's live evidence (checkbox present, unchecked default); AC-05 exempted per 07-verification.md (save/reload round-trip not scriptable here) — proved by construction's live E2E (POST+GET against the running API)
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD — `e6616451`
- [ ] PR draft copied and contact sheets attached to the PR description
