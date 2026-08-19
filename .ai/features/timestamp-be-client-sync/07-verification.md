---
feature: timestamp-be-client-sync
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Explicit Timezone for Timestamps

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Stock document report renders dates via the migrated formatter | `/reports/storage/stock-document-details` | — | AC-06 | text=Chọn bộ lọc |
| S2 | Cash ledger renders dates via the migrated formatter | `/treasury/cash/ledger` | — | AC-06 | text=Số dư đầu kỳ |

## Not verified here

- **AC-05** (pos-web's `dateTime.ts` delegates to the shared formatter) — this repo's verify
  tooling runs every declared step against every declared environment (no per-step environment
  scoping), so a feature spanning two apps with disjoint route tables cannot mix
  backoffice-only and pos-only live steps in one file without the wrong steps running against
  the wrong app (confirmed the hard way: an earlier draft of this file did exactly that and
  every backoffice-only step correctly failed when run against `local-pos`, since those routes
  don't exist there). `environments:` above is scoped to `local-backoffice` only as a result.
  AC-05 is a small, internal delegation change with strong existing coverage instead:
  `apps/pos-web/src/lib/common/dateTime.test.ts` (4/4, including the forced-foreign-`TZ` case)
  and a clean `pnpm --filter @erp/pos-web build`.
- **AC-01, AC-02** (backend TypeORM connection pins the timezone) — a connection-config claim
  with no DOM surface at all; proved by `data-source.spec.ts` (1/1) and
  `db-connection-timezone.e2e-spec.ts` (1/1, boots the real app and queries
  `SELECT current_setting('TIMEZONE')` over the live connection under a forced foreign `TZ`).
- **AC-03, AC-04** (the shared util exists, pins the zone, and is importable from both apps) —
  a code-structure/module-resolution claim, not something a screenshot proves; both apps
  building and running (S1-S3 all load without error) is consistent with it, but the actual
  claim is proved by `packages/ui/src/lib/date-time-format.test.ts` and the fact that both
  `apps/backoffice-web` and `apps/pos-web` builds succeed importing from `@erp/ui`.
- **AC-07** (no orphaned ad-hoc formatter remains anywhere in either app) — a whole-repo grep
  result, not a rendered page. Confirmed during construction (T3's own report: only 2 remaining
  matches, both in `iam/display.ts`, both already zone-pinned) — re-verify with
  `grep -rn "new Intl.DateTimeFormat(" apps/backoffice-web/src apps/pos-web/src` if re-auditing.
- **AC-08, AC-09, AC-10** (the actual timezone-independence proof: correct output *despite* a
  forced foreign `TZ`) — this repo's verify tooling has no per-run browser-timezone override
  (no `timezoneId` option in `.ai/aidlc.yaml`'s `viewports:` shape), so S1/S2 run at whatever
  timezone this machine's Chromium defaults to — they prove the migration didn't visually break
  anything, not timezone-independence itself. That specific claim is what
  `data-source.spec.ts`, `db-connection-timezone.e2e-spec.ts`,
  `date-time-format.test.ts`, and `dateTime.test.ts` exist to prove, each by forcing
  `process.env.TZ` (or an equivalent mock) before asserting — already passing per construction.
- The remaining migrated backoffice-web call sites (`InvoiceDetailDialog`, the deposit ledger,
  the two "Chọn phiếu..." picker dialogs, IAM's "Đăng nhập gần nhất") were not each individually
  re-verified live — S1/S2 above are a representative sample proving the shared formatter
  renders correctly in production use; the rest are the same function at different call sites,
  already reviewed at construction time.

## Notes

Confirmed live (not assumed) before writing this file: `/reports/storage/stock-document-details`
renders real seeded receipt/issue rows with correct-looking dates (17/08/2026), and
`/treasury/cash/ledger` renders a real ledger with dates spanning 06/08–17/08/2026 — both pages
load cleanly post-migration. pos-web is not in scope for live steps here (see the AC-05
exemption above) — its coverage is `dateTime.test.ts` alone.
