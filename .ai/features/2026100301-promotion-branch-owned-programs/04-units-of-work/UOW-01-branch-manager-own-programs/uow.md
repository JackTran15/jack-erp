---
id: UOW-01
slug: branch-manager-own-programs
title: Branch manager creates and manages their own branch's programs
demoable: true
duration: 2d
depends_on: []
requirements: [US-01, US-02, US-03]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-14, AC-15]
risk: high
status: todo
rollback: revert T-01-01..T-01-07; `pnpm migration:revert` twice drops the grants and `owner_branch_id` (no data lost — the column only ever held new owners)
---

# UOW-01 — Branch manager runs their own programs

## Demo script
1. Log in to backoffice (:3005, see memory "Backoffice :3000 serves erp2") as a seeded *Quản lý chi nhánh* whose active branch is HCM
2. Khuyến mãi → Chương trình khuyến mãi: the list loads (no 403) and shows only HCM-owned programs plus chain programs that apply to HCM; column "Đơn vị quản lý" reads "Toàn chuỗi" / "Hồ Chí Minh"
3. Thêm mới → Giảm giá hàng hóa: "Cửa hàng áp dụng" shows "Hồ Chí Minh" as fixed text, no radio
4. Save → the new row shows "Đơn vị quản lý: Hồ Chí Minh"; edit it, switch status to Ngừng theo dõi and back, then delete it — all succeed
5. In Swagger with the same token: `PUT /v2/promotions/<chain program id>` → 403; `GET /v2/promotions/<HN-owned id>` → 404
6. Quản lý vai trò → *Quản lý chi nhánh*: Xem/Thêm-sửa/Xóa chương trình khuyến mại ticked, *Quản lý CTKM toàn chuỗi* not ticked; *Quản lý tổng*: all four ticked

## In scope
- `owner_branch_id` column, domain prop + scope invariant, mapper/repository
- `promotion.chain.manage` key, role seeds, two migrations (column, grants)
- `PromotionAccessPolicy` wired into create / update / duplicate / get / status / delete / search (branch-manager side)
- `ownerBranchId` / `ownerBranchName` on summary + detail; api-client regen
- Backoffice: store-scope lock, "Đơn vị quản lý" column (no filter yet)

## Not in scope
- Chain-manager whole-org list and owner filter (UOW-02)
- Read-only form for chain programs (UOW-02) — until then a branch manager opening a chain program sees an editable form whose Save answers 403
- Checkout ordering (UOW-03)

## Risks
| Risk | Mitigation |
| ---- | ---------- |
| A handler skips the policy and leaks or writes across branches | T-01-06 e2e covers every endpoint × every cell of the access table in 03-logical-design.md |
| Grant migration order: granting `promotion.write` to managers before `chain.manage` is granted to `promotion.write` holders would make every branch manager a chain manager | One migration, chain.manage grant first; AC-15 asserts R2 lacks `chain.manage` |
| e2e accounts lack the new keys because RBAC is cached | Follow memory "e2e report permission grant": grant to the seeded role, then invalidate the RBAC cache |

## Definition of done
- [ ] AC-01..AC-03, AC-05..AC-08 green in `promotion-branch-ownership.e2e-spec.ts`
- [x] AC-14 green in `org-role-permissions.spec.ts`; AC-15 green in `promotion-chain-manage-permission.e2e-spec.ts`
  - 4 new AC-14 tests green (the file's one red test, `inventory.transfer.create`, is pre-existing on `main`); AC-15 e2e 5/5
- [ ] AC-04 shown in a screenshot in `07-verification.md`
- [ ] `pnpm openapi:generate` run; snapshot + schema regenerated (committed by the user)
- [x] `pnpm --filter @erp/api build` (or `tsc --noEmit` while dev-api runs) and `pnpm --filter @erp/backoffice-web build` green
  - API `tsc --noEmit` clean (dev-api running on :4000); backoffice build exit 0; full API unit run 6592 pass / 1 fail (pre-existing, above), 2026-10-03
- [ ] Demoed and accepted at gate G4

### Trước merge
- [ ] AC-04 re-shot with a real *Quản lý chi nhánh* account (T-01-07's screenshot is simulated in localStorage)
- [ ] T-01-06 `promotion-branch-ownership.e2e-spec.ts` written and green — deferred, no suite exists yet (Akenzy, 2026-10-03: e2e off)
- [ ] AC-08 proven on a real DB: branch manager search over the five-program fixture returns exactly three rows (T-01-05's box was ticked on the SQL predicate only)
- [ ] Every e2e suite using `setup/promotion-seed.ts` still green — the seed now also grants `promotion.chain.manage` (T-03-02); the sweep was stopped after `checkout-saga-promotion` PASS
