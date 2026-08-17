---
id: UOW-01
slug: scope-locked-all-items
title: "Phạm vi áp dụng" is locked to ALL_ITEMS on the invoice-discount form
demoable: true
duration: 0.5d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03]
risk: low
status: todo
rollback: revert the 3 FE files (ApplyScopePromotionSection.tsx, program-form.constants.ts, promotion.mapper.ts) — no backend, no migration, no persisted-data change to unwind
---

# UOW-01 — "Phạm vi áp dụng" is locked to ALL_ITEMS

## Demo script

1. Open the backoffice, go to Khuyến mại → Thêm chương trình → chọn loại "Giảm giá hóa
   đơn" (invoice-discount).
2. In the "Phạm vi áp dụng" section: confirm no radio buttons are shown — only a fixed
   label reading "Tất cả hàng hóa trong hóa đơn", not editable.
3. Fill in the required fields and save. Reopen the created program in edit mode: confirm
   the section still shows the fixed label (AC-01).
4. In the DB (or via GET the program), open an existing invoice-discount program that was
   saved before this change with `invoice_scope = NON_PROMO_ONLY`. Open it in the edit
   form (still shows the fixed label, no way to pick), save it, and confirm the persisted
   `invoiceScope` is now `ALL_ITEMS` (AC-02).
5. Confirm a *different* existing `NON_PROMO_ONLY` program that is never opened through the
   form keeps its stored value, and a checkout evaluated against it still restricts the
   discount to unclaimed lines exactly as before (AC-03 — regression, proven by the
   untouched `invoice-discount.strategy.spec.ts` suite still passing).

## In scope

- `ApplyScopePromotionSection.tsx` becomes a locked, read-only display.
- New-program default and the save path both resolve to `ALL_ITEMS` unconditionally.
- No backend, no migration, no DTO change — `PromotionInvoiceScope.ALL_ITEMS` and the engine
  branch that honors it already exist and are not touched.

## Not in scope

- Retroactively migrating already-saved `NON_PROMO_ONLY` programs that are never re-opened
  (A-03, explicitly deferred).
- Any of the other 4 promotion-type variant forms — none of them render this section today
  and this UoW does not change that.
- The points checkbox (UOW-02/UOW-03).

## Risks

| Risk | Mitigation |
|---|---|
| FE `promotion.mapper.ts` write overlaps with UOW-02's FE checkbox write to the same file (`invoiceDiscountToDto`/`invoiceDiscountFromDetail`) | Both UoWs are independently small; `uow_graph.py --parallel` will flag the shared-file hazard — do not run T-01-02 and T-02-05 on parallel agents, sequence them by hand even though there is no logical dependency |

## Definition of done

- [x] AC-01, AC-02, AC-03 all pass
- [x] `invoice-discount.strategy.spec.ts` (existing, untouched) still passes — proves AC-03
      without needing a new test
- [x] No other promotion-variant form (`PromotionProductDiscount`, `PromotionTieredDiscount`,
      `PromotionBuyGet`, `PromotionGift`) starts rendering the section (non-functional
      "Isolation" requirement in `02-requirements.md`)
- [ ] Demoed and accepted at gate G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment — local-backoffice, 1/1 step passing
- [x] Evidence exists for every AC in `verifies` — AC-01 via S1's live evidence (locked scope, no radio); AC-02/03 exempted per 07-verification.md (save/reload round-trip, checkout-branch regression not scriptable here) — proved by construction's live E2E + invoice-discount.strategy.spec.ts
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD — `e6616451`
- [ ] PR draft copied and contact sheets attached to the PR description
