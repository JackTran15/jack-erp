---
id: UOW-03
slug: branch-wins-at-pos
title: A branch's own program wins over chain programs at its own POS
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-04]
verifies: [AC-16, AC-17, AC-18, AC-19, AC-20]
risk: medium
status: todo
rollback: revert T-03-01 (one comparator tier); no data or schema involved
---

# UOW-03 — Branch wins at checkout

## Demo script
1. As Quản lý tổng, ensure chain program A "Giảm giá hàng hóa" 10% on DD850, priority 1, auto-apply, Đang theo dõi
2. As HCM *Quản lý chi nhánh*, create program B "Giảm giá hàng hóa" 20% on DD850, priority 100, auto-apply, Đang theo dõi
3. POS (:3001, branch HCM per `LOCAL_POS_BRANCH_ID`): add DD850 → line shows B's 20%; A is not applied
4. In the promotion picker choose A explicitly → A's 10% applies (cashier selection wins)
5. Switch POS to HN: add DD850 → A's 10%; B is never offered

## In scope
- Resolver ownership tier (all three phases) + unit specs
- Evaluate e2e at two branches

## Not in scope
- Any POS UI change (A-14)

## Risks
| Risk | Mitigation |
| ---- | ---------- |
| Existing resolver specs depend on today's order | Fixture default `ownerBranchId: undefined` (T-01-01) keeps every chain-only scenario identical |
| Exchange / return flows re-evaluate with a different branch | `eligible-returns-promotions` and `exchange-promotion` e2e suites must stay green |

## Definition of done
- [x] AC-20 green in `evaluate-promotion.step.spec.ts` and `checkout-return.service.spec.ts`
  - 2 + 2 new cases green, 2026-10-03
- [x] AC-16..AC-19 green in `promotion-resolver.spec.ts` and `promotion-branch-wins.e2e-spec.ts`
  - resolver: 5 new cases green; e2e 5/5, 2026-10-03
- [ ] `promotion-evaluate*.e2e-spec.ts`, `checkout-saga-promotion`, `exchange-promotion`, `eligible-returns-promotions` still green
- [ ] Demo steps 3–5 captured in `07-verification.md`
- [ ] Demoed and accepted at gate G4

### Trước merge
- [ ] `promotion-evaluate.e2e-spec.ts`, `exchange-promotion`, `eligible-returns-promotions` run on this branch; only the known-red AC-03 of `promotion-evaluate` may fail (T-03-02's box was ticked with only `checkout-saga-promotion` run)
