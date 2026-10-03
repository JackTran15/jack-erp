---
feature: promotion-branch-owned-programs
stories: 4
acceptance_criteria: 20
---

# Requirements — Branch-owned promotion programs

Personas: **QLCN** = an account with the seeded *Quản lý chi nhánh* role (no
`promotion.chain.manage`), active branch HCM. **QLT** = an account with *Quản lý tổng*
(holds `promotion.chain.manage`). HN is a second branch of the same organization.

## US-01 — Branch manager runs their own branch's programs

As a branch manager, I want to create and manage promotion programs for my branch myself,
so that my store can run local promotions without asking head office.

**Priority:** must
**Depends on:** US-03

**AC-01** — Create is owned by the active branch
```gherkin
Given QLCN with active branch HCM
When they create a program of any of the 5 types, submitting branchIds [] or [HN]
Then the program is saved with ownerBranchId = HCM and branchIds = [HCM]
And GET /v2/promotions/:id returns ownerBranchId = HCM
```

**AC-02** — Manage own program
```gherkin
Given a program owned by HCM
When QLCN (active HCM) updates it, changes its status, or deletes it
Then each call succeeds
And after update ownerBranchId is still HCM and branchIds is still [HCM]
```

**AC-03** — No active branch
```gherkin
Given a QLCN request without an active branch
When they create or duplicate a program
Then the API answers 403
```

**AC-04** — Store scope locked on the form
```gherkin
Given QLCN opens "Thêm mới" or edits an HCM-owned program on backoffice
When the form renders "Cửa hàng áp dụng"
Then it shows the HCM branch name as fixed text with no radio and no store picker
```

**AC-05** — Duplicate becomes a branch copy
```gherkin
Given a chain program applicable to HCM
When QLCN (active HCM) duplicates it
Then the copy has ownerBranchId = HCM and branchIds = [HCM]
```

## US-02 — Visibility boundaries between company and branch

As the company, I want full control over every program, and as a branch manager I want to
see chain programs that apply to my store without being able to change them.

**Priority:** must
**Depends on:** US-01

**AC-06** — Chain program is read-only for a branch manager
```gherkin
Given a chain program whose scope is the whole chain or includes HCM
When QLCN (active HCM) GETs it
Then it returns 200 with ownerBranchId = null
When QLCN PUTs it, PATCHes its status or DELETEs it
Then each answers 403 and the program is unchanged
```

**AC-07** — Invisible programs are not found
```gherkin
Given a program owned by HN, and a chain program scoped only to HN
When QLCN (active HCM) GETs, PUTs, PATCHes status, DELETEs or duplicates either
Then each answers 404
```

**AC-08** — Branch manager's list
```gherkin
Given programs owned by HCM, owned by HN, chain-wide, chain scoped to [HCM], chain scoped to [HN]
When QLCN (active HCM) calls POST /v2/promotions/search
Then the result contains exactly the HCM-owned, chain-wide and chain-[HCM] programs
```

**AC-09** — Read-only screen for a branch manager
```gherkin
Given QLCN on the "Chương trình khuyến mãi" list
When the selection contains a program they cannot manage
Then "Sửa", "Xóa" and the status actions are disabled
When they open that program
Then the form shows the banner "Chương trình do công ty quản lý — chỉ xem", every input is disabled and the Lưu / Lưu và thêm mới buttons are not rendered
```

**AC-10** — Company sees everything
```gherkin
Given the same five programs as AC-08 and QLT with any active branch
When QLT searches with no owner filter
Then all five are returned, each with ownerBranchId and ownerBranchName (null for chain)
When QLT searches with owner = CHAIN
Then only the three chain programs are returned
When QLT searches with owner = HN
Then only the HN-owned program is returned
```

**AC-11** — Company manages branch programs
```gherkin
Given a program owned by HCM
When QLT updates it, stops it, and the HCM QLCN then reactivates it
Then every call succeeds, ownerBranchId stays HCM and branchIds stays [HCM]
When QLT deletes it
Then it is soft-deleted
```

**AC-12** — Company creates chain programs
```gherkin
Given QLT with active branch HCM
When they create a program with store scope "Chọn cửa hàng" = [HN]
Then it is saved with ownerBranchId = null and branchIds = [HN], exactly as before this feature
```

**AC-13** — Ownership on the list
```gherkin
Given QLT on the "Chương trình khuyến mãi" list
Then a column "Đơn vị quản lý" shows "Toàn chuỗi" for chain programs and the branch name for branch-owned ones
And its column filter offers "Toàn chuỗi" and each branch, sending the owner filter of AC-10
Given QLCN on the same list
Then the column shows but has no filter
```

## US-03 — Permissions roll out without anyone losing access

As an administrator, I want the new split to apply to existing organizations automatically,
so that no current user loses access and branch managers gain theirs.

**Priority:** must
**Depends on:** —

**AC-14** — Seeded roles
```gherkin
Given the role seeds in org-role-permissions.ts
Then BRANCH_MANAGER_PERMISSION_KEYS contains promotion.read, promotion.write, promotion.delete and not promotion.chain.manage
And SYSTEM_ADMIN and GENERAL_MANAGER keys contain promotion.chain.manage
And SALES, CASHIER and WAREHOUSE keys contain none of the four
```

**AC-15** — Migration on an existing database
```gherkin
Given role R1 holding promotion.write, role R2 holding customer.merge but no promotion.*, role R3 holding neither, and existing promotion programs
When the migrations run
Then R1 also holds promotion.chain.manage
And R2 holds promotion.read, promotion.write, promotion.delete and not promotion.chain.manage
And R3 is unchanged
And every pre-existing program has owner_branch_id NULL
And migration:revert removes the grants and the column
```

## US-04 — A branch's own program wins at its own counter

As a branch manager, I want my store's program to take precedence over a chain program at
my store, so that the local promotion I set up is the one customers get.

**Priority:** must
**Depends on:** US-01

**AC-16** — Branch beats chain on a contested line
```gherkin
Given chain ITEM_DISCOUNT program A, priority 1, and HCM-owned ITEM_DISCOUNT program B, priority 100, both auto-apply on item X
When a cart with item X is evaluated at HCM
Then B is applied to the X line and A is skipped for it
```

**AC-17** — Other branch unaffected
```gherkin
Given the programs of AC-16
When the same cart is evaluated at HN
Then B is skipped with reason BRANCH_SCOPE and A is applied
```

**AC-18** — Cashier selection still outranks ownership
```gherkin
Given the programs of AC-16
When the cart at HCM is evaluated with selectedProgramIds = [A]
Then A is applied to the X line
```

**AC-19** — Invoice slot
```gherkin
Given a chain INVOICE_DISCOUNT program C, priority 1, and an HCM-owned INVOICE_DISCOUNT program D, priority 100, both eligible
When a cart is evaluated at HCM
Then D takes the invoice slot and C is skipped
```

**AC-20** — Checkout and exchange price by the invoice's branch
```gherkin
Given a draft invoice created at HN, and an HCM-owned program on its item
When it is checked out (or an exchange's new lines are priced) by a session whose active branch is HCM
Then promotions are evaluated for HN: the HCM program is skipped with BRANCH_SCOPE
And an invoice with no branch falls back to the caller's active branch
```

## Non-functional

| Kind | Requirement | Verified by |
| ---- | ----------- | ----------- |
| Tenancy | Every ownership query also filters `organizationId`; a branch id from another org never matches | T-01-06 |
| Purity | The resolver stays pure — ownership arrives as `PromotionProgram.ownerBranchId`, no I/O | T-03-01 |
| Contract | `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` regenerated, not hand-edited | T-01-07 |
