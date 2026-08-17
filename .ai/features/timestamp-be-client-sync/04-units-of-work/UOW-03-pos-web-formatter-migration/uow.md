---
id: UOW-03
slug: pos-web-formatter-migration
title: pos-web's central date util delegates to the shared formatter
demoable: true
duration: 1d
depends_on: [UOW-02]
requirements: [US-03, US-04]
verifies: [AC-05, AC-07]
risk: low
status: todo
rollback: revert `dateTime.ts` to its own inline `Intl.DateTimeFormat` construction — its exported signature does not change, so no caller elsewhere in pos-web is affected either way
---

# UOW-03 — pos-web's central date util delegates to the shared formatter

## Demo script

1. Set the OS/browser timezone to something other than Asia/Ho_Chi_Minh (e.g. UTC), open
   pos-web.
2. Complete a checkout and open the receipt / invoice list — the printed/displayed
   date-time is still correct Vietnam wall-clock time.
3. Run `npx vitest run` from `apps/pos-web` — `dateTime.test.ts` passes, including the
   forced-foreign-TZ case.
4. Run a whole-repo search for `new Intl.DateTimeFormat(` under `apps/backoffice-web` and
   `apps/pos-web` — every remaining match either calls into `@erp/ui`'s formatter or
   carries its own explicit `timeZone: "Asia/Ho_Chi_Minh"`.

## In scope

- `apps/pos-web/src/lib/common/dateTime.ts`'s `formatViDateTime` delegates its actual
  formatting to `@erp/ui`'s shared util instead of constructing its own
  `Intl.DateTimeFormat` instances.
- A test for the migrated file, forcing a foreign TZ.
- The final whole-repo sweep confirming no ad-hoc, un-zoned `Intl.DateTimeFormat` remains
  in either frontend app (AC-07) — this is the last slice, so it is the natural place to
  close out that acceptance criterion.

## Not in scope

- `parseViDate` in the same file — it does no `Intl.DateTimeFormat` work (local date-only
  math via `Date` getters/constructor), not touched.
- Anything in `packages/ui` itself (UOW-02 already shipped it).

## Risks

| Risk | Mitigation |
|---|---|
| pos-web's `formatViDateTime(input, { separator, withSeconds })` signature differs from the shared util's `(input, { withSeconds })` — a naive re-export would break every existing caller | T-03-01 keeps `dateTime.ts`'s function as a wrapper with its existing signature, calling into `@erp/ui` internally, not a re-export |
| The `separator: "space"` option (used by at least one existing caller, per `dateTime.ts:29`) has no equivalent in the shared util, which always uses one fixed layout | T-03-01 keeps the separator-substitution logic local to `dateTime.ts` if the shared util's output doesn't already match; only the underlying `Intl.DateTimeFormat` construction moves, not pos-web's own formatting logic beyond that |

## Definition of done

- [x] AC-05, AC-07 pass
- [x] `dateTime.ts` no longer constructs its own `Intl.DateTimeFormat` without going
      through `@erp/ui` — delegates entirely; zero local `Intl.DateTimeFormat` calls remain.
- [x] `npx vitest run` (pos-web) passes — full suite: PASS (86) FAIL (0).
- [x] Whole-repo sweep for orphaned `Intl.DateTimeFormat` calls under `apps/backoffice-web`
      and `apps/pos-web` comes back clean — see T-03-02's DoD note for the full sweep
      result and the out-of-scope `.toLocaleString`/`.toLocaleDateString` sites flagged
      for a possible follow-up feature.
- [ ] Demoed and accepted at gate G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment — local-backoffice, 2/2 steps passing
- [x] Evidence exists for every AC in `verifies` — AC-05/07 exempted per 07-verification.md (this tool has no per-step environment scoping, so a pos-only step can't safely coexist with backoffice-only steps in one file) — proved by dateTime.test.ts
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD — `e6616451`
- [ ] PR draft copied and contact sheets attached to the PR description
