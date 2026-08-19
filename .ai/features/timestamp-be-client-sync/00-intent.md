---
feature: timestamp-be-client-sync
slug: timestamp-be-client-sync
owner: Akenzy
created: 2026-08-17
status: draft
---

# Intent — Explicit Timezone for Timestamps (Backend Connection + Client Display)

## Problem

Timestamp display, and — to the extent the backend connection config matters — storage
and formatting, all rely on the implicit local timezone of whatever machine happens to be
running the code. Neither the Postgres connection nor any of the frontends' date
formatters pins one explicitly:

- The backend TypeORM connection sets no `timezone` option: `apps/api/src/database/data-source.ts:21-23`
  (CLI DataSource used for migrations) and `apps/api/src/app.module.ts:64-76`
  (`TypeOrmModule.forRootAsync`).
- There is no single shared date/time formatter on the frontend. At least 6-7 independently
  declared `Intl.DateTimeFormat` instances exist across the two apps, none of which set a
  `timeZone` option:
  - `apps/pos-web/src/lib/common/dateTime.ts:1-46` — pos-web's one central util
    (`viDateTimeFormatter` / `viDateTimeWithSecondsFormatter`, `formatViDateTime()` at 33-46)
  - `apps/backoffice-web/src/pages/chain-store/reports/InvoiceDetailDialog/_lib/format.ts:14-25`
    (`formatDateTime()`)
  - `apps/backoffice-web/src/lib/iam/display.ts:30,38-41` (`formatIamDateTime()`)
  - `apps/backoffice-web/src/pages/purchase-orders/SelectTransferReceiptDialog.tsx:52-58`
    and `apps/backoffice-web/src/pages/goods-issue/SelectTransferOrderDialog.tsx:63-69`
    (near-identical re-declared `dateFmt` / `formatDate()`)
  - `apps/backoffice-web/src/pages/treasury/ledger-cash/ledger-cash.constants.ts:1-13`
    and `apps/backoffice-web/src/pages/treasury/deposit/LedgerDepositPage.tsx:56-60`
    (`LEDGER_CASH_VI_DATE` / `VI_DATE`)
  - `apps/backoffice-web/src/pages/reports/storage/StockDocumentDetailsReportPage.tsx:29-33`
    (`DATE_FMT`)
  - `packages/ui/src/components/date-time-field.tsx` is a plain input wrapper with no
    formatting/timezone logic — confirms no shared design-system-level formatter exists
    to build on either.
  - A whole-repo search for `timeZone` across `apps/backoffice-web`, `apps/pos-web`,
    `apps/api`, and `packages` returned zero matches.

If a deploy host or a user's browser is set to a timezone other than the business's actual
zone (Asia/Ho_Chi_Minh), displayed dates/times can silently shift by hours, or — near
midnight — by a whole day. This is not theoretical: this exact bug class has already
shipped once and been fixed:

- `apps/api/src/modules/promotion/application/date-format.util.spec.ts:16` — test name:
  "formats a local-midnight Date via local getters, not UTC (regression: previously off by
  one day in UTC+ timezones)".
- `apps/api/src/modules/promotion/domain/model/value-objects/date-window.spec.ts:3-5` —
  comment about avoiding "the UTC-parsing pitfall of ISO date strings".
- `apps/api/src/common/utils/document-date.util.ts:1-14` (`toLongVietnameseDate`) —
  explicit comment: reading in the process timezone rather than UTC, because "a voucher
  issued at 22:16 local time is dated that day on the paper... shifting it to UTC would
  print the next day's date on roughly a quarter of the vouchers."
- `apps/api/src/modules/promotion/application/date-format.util.ts:1-23` (`toIsoDate`) —
  comment about `.toISOString().slice(0,10)` shifting the calendar day by one in
  positive-UTC-offset timezones (e.g. Asia/Saigon, UTC+7).

Each fix so far has been a one-off, local patch. There is no shared mechanism that
prevents the next call site from reintroducing the same bug.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| Backoffice/POS user reading any date/time on screen | Sees a value formatted using the browser's local OS timezone — correct only by coincidence if the browser is set to Asia/Ho_Chi_Minh | Always sees the correct Asia/Ho_Chi_Minh wall-clock value, regardless of the browser's own timezone setting |
| Backend/infra operator deploying the API | The Postgres connection silently inherits whatever timezone the deploy host happens to have set | The connection explicitly pins Asia/Ho_Chi_Minh, independent of host config |

## Success signal

Concrete and testable:
- A Jest test asserts that a fixed UTC instant renders as the same Asia/Ho_Chi_Minh
  wall-clock time regardless of the test runner's `TZ` env var (i.e. still correct when
  `TZ=UTC` or `TZ=America/New_York`).
- The backend Postgres connection explicitly pins Asia/Ho_Chi_Minh rather than inheriting
  the host's default.
- Every remaining ad-hoc `Intl.DateTimeFormat` call site listed above either goes through
  one shared formatter or explicitly passes `timeZone: 'Asia/Ho_Chi_Minh'`.

## Out of scope

- **DB column-type reconciliation** — the naive `timestamp` vs `timestamptz` split across
  old vs new tables is not addressed here; noted as a known follow-up, not this feature's
  job.
- **Server-side plausibility validation on client-submitted business dates** —
  goods-receipt `receivedAt`, goods-issue `occurredAt`, membership-card `issuedAt`, etc.
  are all currently trusted verbatim from the client with no server-side sanity check;
  noted as a known follow-up.
- **Unifying divergent form-serialization helpers** — `GoodsReceiptFormDialog` and
  `GoodsIssueFormDialog` currently serialize local dates two different ways (offset-ISO vs
  UTC-Z); reconciling that divergence is a known follow-up, not this pass.

This scope was set explicitly by the human (Akenzy) after AI-DLC discovery surfaced all
three problems: of (1) DB column-type inconsistency, (2) no explicit timezone anywhere,
and (3) zero server-side plausibility validation on client timestamps, only (2) was
selected as this feature's priority. See `01-assumptions.md` A-01.

## Constraints

| Kind | Detail |
|---|---|
| Priority | Scope is fixed to "explicit timezone everywhere" only, per the human's explicit discovery-stage decision (2026-08-17); the other two known problems are deliberately deferred, not solved incidentally |
| Technical nuance | Postgres `timestamptz` columns are always stored internally as UTC; the session `TimeZone` setting only affects text I/O conversion, and the `pg` driver typically parses `timestamptz` into a correct absolute-instant JS `Date` regardless of session timezone. Naive `timestamp` (no tz) columns carry no offset info at all, and how the `pg` driver parses them into a JS `Date` is a separate, driver-level concern from "setting a connection timezone." Pinning a connection-level `timezone` option in TypeORM primarily affects `SET TIME ZONE` on connect (relevant to text formatting / `AT TIME ZONE` operations) — it does **not** by itself guarantee naive-timestamp columns parse consistently across differently-configured deploy hosts. This needs a real G2 design decision (see `01-assumptions.md` A-03), not an assumed "just add a timezone config option and it's fully solved." |

## Existing surface touched

- Backend connection config: `apps/api/src/database/data-source.ts` (CLI DataSource,
  lines 21-23), `apps/api/src/app.module.ts` (`TypeOrmModule.forRootAsync`, lines 64-76).
- Frontend ad-hoc formatters (all ~6-7 call sites listed in Problem above), each migrated
  to a shared formatter or given an explicit `timeZone`.
- NEW: a shared FE date-formatting util. Candidate homes — `packages/ui` (both apps
  already import UI primitives from `@erp/ui`), a new small shared package, or per-app
  duplication — are not decided here; see `01-assumptions.md` A-02, to be resolved as a
  G2 ADR.
- `packages/ui/src/components/date-time-field.tsx` — read as evidence only (no existing
  formatting logic to reuse); not itself in scope unless the shared util lands there.
- Reused as evidence this bug class already shipped once (not touched by this feature,
  cited for context): `apps/api/src/modules/promotion/application/date-format.util.spec.ts`,
  `apps/api/src/modules/promotion/domain/model/value-objects/date-window.spec.ts`,
  `apps/api/src/common/utils/document-date.util.ts`,
  `apps/api/src/modules/promotion/application/date-format.util.ts`.
