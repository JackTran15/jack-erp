---
id: UOW-02
slug: company-control-read-only
title: Company sees and controls every program; branch managers see chain programs read-only
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-09, AC-10, AC-11, AC-12, AC-13]
risk: medium
status: todo
rollback: revert T-02-01..T-02-04 (no schema change); chain managers fall back to the active-branch list of UOW-01
---

# UOW-02 — Company control and read-only screens

## Demo script
1. Log in to backoffice as *Quản lý tổng*, active branch HN
2. Khuyến mãi → Chương trình khuyến mãi: HCM-owned programs are listed too; "Đơn vị quản lý" filter → "Toàn chuỗi" shows only chain programs, → "Hồ Chí Minh" only HCM-owned ones
3. Open an HCM-owned program, change its name, save; stop it (Ngừng theo dõi) — both succeed and the row still reads "Hồ Chí Minh"
4. Thêm mới as Quản lý tổng → the store-scope radio is there as before; save with [HN] → row reads "Toàn chuỗi"
5. Log in as HCM *Quản lý chi nhánh*: reactivate the program stopped in step 3 (A-02) — succeeds
6. Same account, select a chain program: Sửa / Xóa / status actions disabled; open it → banner "Chương trình do công ty quản lý — chỉ xem", inputs disabled, no Lưu buttons

## In scope
- Search: whole org + `owner` filter for chain managers
- Backoffice: owner filter on the list, read-only form, disabled list actions
- Company-side e2e

## Not in scope
- Owner picker for the company (A-03)
- Any lock when the company stops a program (A-02)

## Risks
| Risk | Mitigation |
| ---- | ---------- |
| `<fieldset disabled>` misses a custom control that is not a native input/button | Click through all 5 variants read-only in T-02-04; disable stragglers via `PromotionFormModeContext.readOnly` |
| GMs surprised by the larger list (A-08) | Owner filter ships in the same UoW |

## Definition of done
- [ ] AC-10, AC-11, AC-12 green in `promotion-branch-ownership-company.e2e-spec.ts`
- [ ] AC-09 and AC-13 shown in screenshots in `07-verification.md`, for all 5 program types on AC-09
- [x] `pnpm openapi:generate` re-run for the `owner` filter; snapshot + schema regenerated
  - Ran after T-02-01 landed on :4000; schema has `PromotionOwnerFilterDto` and `owner` on the search body (not committed — agent commits are blocked)
- [x] `pnpm --filter @erp/backoffice-web build` green
  - exit 0 after T-02-04, 2026-10-03
- [ ] Demoed and accepted at gate G4

### Trước merge
- [ ] AC-09 read-only checked with a real *Quản lý chi nhánh* account for all 5 types (T-02-04 shot 2 types, simulated)
- [ ] AC-13 branch-manager side re-shot with a real *Quản lý chi nhánh* account (T-02-03's screenshot is simulated in localStorage)
- [ ] T-02-02 `promotion-branch-ownership-company.e2e-spec.ts` written and green — deferred, no suite exists yet (Akenzy, 2026-10-03: e2e off)
- [ ] AC-10 row counts on a real DB (all 5 / CHAIN → 3 / HN → 1) — T-02-01's spec proves predicates only
