---
id: UOW-02
slug: shared-fe-formatter-backoffice-migration
title: Shared Vietnamese date/time formatter in packages/ui, backoffice-web migrated
demoable: true
duration: 1d
depends_on: []
requirements: [US-02, US-03, US-04]
verifies: [AC-03, AC-04, AC-06, AC-09, AC-10]
risk: medium
status: todo
rollback: revert the call-site edits (each is a one-function-body swap back to its own inline `Intl.DateTimeFormat`/`toLocaleDateString` call) and drop the two new exports from `packages/ui/src/index.ts`; the new file itself can be deleted or left unused
---

# UOW-02 — Shared Vietnamese date/time formatter in packages/ui, backoffice-web migrated

## Demo script

1. Set the OS/browser timezone to something other than Asia/Ho_Chi_Minh (e.g. UTC), open
   backoffice-web.
2. Open an invoice detail dialog under Chain Store reports — the posted date/time shown
   still reads correct Vietnam wall-clock time.
3. Open Kho > Báo cáo > Chi tiết chứng từ kho (`StockDocumentDetailsReportPage`) — document
   dates are still correct.
4. Open Treasury > Sổ quỹ tiền mặt and Sổ quỹ tiền gửi — ledger row dates are still
   correct.
5. Open Purchase Orders > "Chọn phiếu nhập chuyển kho" and Goods Issue >
   "Chọn phiếu chuyển kho" dialogs — dates in the picker list are still correct.
6. Open Quản lý người dùng (IAM) — "Đăng nhập gần nhất" is still correct.
7. Run `pnpm --filter @erp/ui test -- date-time-format.test.ts` (or `npx vitest run` from
   `packages/ui`) with the test forcing a non-Vietnam TZ — still passes.

## In scope

- New `formatViDateTime` / `formatViDate` exports in `packages/ui`.
- Migrating every backoffice-web ad-hoc `Intl.DateTimeFormat` / `toLocaleDateString(...)`
  call site enumerated in `00-intent.md` and `02-requirements.md` AC-06.
- A unit test for the new shared util proving it is TZ-independent.

## Not in scope

- `apps/pos-web/src/lib/common/dateTime.ts` (UOW-03 — depends on this UoW's T-02-01).
- The final whole-repo "no orphaned formatter remains" sweep (AC-07) — that check spans
  both apps and is done once pos-web is migrated too, at the end of UOW-03.

## Risks

| Risk | Mitigation |
|---|---|
| `LEDGER_CASH_VI_DATE_TIME` (`ledger-cash.constants.ts:7-13`) has no current callers — migrating it "correctly" risks inventing an untested code path | T-02-03 keeps it as a plain options object with `timeZone` added, same as its sibling `LEDGER_CASH_VI_DATE`, rather than routing it through the function-based shared util; noted as pre-existing dead code, not removed (not asked for) |
| Two call sites (`ledger-cash`'s `useLedgerCashTableColumns.tsx`, `LedgerDepositPage.tsx`) consume `Intl.DateTimeFormatOptions` via `Date.prototype.toLocaleDateString`, not a constructed `Intl.DateTimeFormat` instance — a mechanically identical migration to the other call sites would miss them | T-02-03 explicitly targets the consumer call sites, not just the constant declarations |
| Signature drift: some call sites want date-only, some want date+time — forcing everything onto one function would either lose information or bloat the signature | Two functions (`formatViDate`, `formatViDateTime`) per the Contracts section in `03-logical-design.md`, not one over-parameterised function |

## Definition of done

- [x] AC-03, AC-04, AC-06, AC-09, AC-10 pass
- [x] All 7 backoffice-web call sites listed in `00-intent.md` import from `@erp/ui` or
      otherwise pass an explicit `timeZone: 'Asia/Ho_Chi_Minh'`
      — all 7 covered: 2 via direct `formatViDate` delegation (T-02-02), 2 via the shared
      `LEDGER_CASH_VI_DATE*` constants + 1 local `VI_DATE` constant now carrying
      `timeZone` (T-02-03 — also transitively fixed ~8 more consumers of the same shared
      constants beyond the 2 the ticket named), 1 via `formatViDateTime` delegation
      (InvoiceDetailDialog), 2 via explicit `timeZone` added to existing options (IAM
      `formatIamDate`/`formatIamDateTime` — kept local construction rather than delegating,
      since their `dateStyle`/`timeStyle` options produce different visible output than the
      shared util's fixed format), 1 via `formatViDate` delegation (stock document report).
- [x] `pnpm --filter @erp/backoffice-web build` succeeds — verified after every ticket.
- [x] The profile's definition-of-done checklist passes (none defined beyond the above —
      `profile: none` in `.ai/aidlc.yaml`)
- [ ] Demoed and accepted at gate G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment — local-backoffice, 2/2 steps passing
- [x] Evidence exists for every AC in `verifies` — AC-06 via S1/S2's live evidence; AC-03/04/09/10 exempted per 07-verification.md (module-structure / timezone-forcing claims, not DOM-observable) — proved by date-time-format.test.ts
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD — `e6616451`
- [ ] PR draft copied and contact sheets attached to the PR description
