---
feature: timestamp-be-client-sync
adr_count: 2
---

# Logical design — timestamp-be-client-sync

## Approach

Two independent, additive changes, tied together by one literal constant
(`'Asia/Ho_Chi_Minh'`) and one verification pattern (force a foreign `TZ`, assert the
correct VN wall-clock value still comes out).

**1. Backend connection.** Pin `timezone: 'Asia/Ho_Chi_Minh'` explicitly in the TypeORM
postgres connection options in both places a connection is opened:
- `apps/api/src/database/data-source.ts:21-36` — the CLI `DataSource` used by
  `migration:generate` / `migration:run` / `migration:show`. Add the option inside the
  `new DataSource({ ... })` object, alongside the existing `type: 'postgres'` /
  `host` / `port` fields.
- `apps/api/src/app.module.ts:64-76` — the runtime `TypeOrmModule.forRootAsync` factory.
  Add the same option inside the returned config object, alongside `type: 'postgres'`.

Neither currently sets a `timezone` option (confirmed by reading both files in full —
`data-source.ts` has 6 connection fields, `app.module.ts`'s factory has 7; none is
`timezone`). The `pg` driver, on receiving TypeORM's `timezone` option, issues
`SET TIME ZONE 'Asia/Ho_Chi_Minh'` on every new connection. This makes session-level text
I/O and `AT TIME ZONE`-style operations deterministic regardless of the deploy host's own
`/etc/timezone`. Per the Constraints row already recorded in `00-intent.md` and assumption
A-03, this does **not** by itself guarantee correct parsing of naive (`timestamp`, no tz)
columns into JS `Date` objects — that is a `pg` type-parser concern, and depends on the
out-of-scope column-type split. This design closes the connection-config gap only; it does
not claim to close the naive-timestamp gap. See ADR-01.

**2. Frontend shared formatter.** Add one function, `formatViDateTime`, to `packages/ui`
(per confirmed A-02), built on
`new Intl.DateTimeFormat('vi-VN', { ..., timeZone: 'Asia/Ho_Chi_Minh' })`, and migrate
every known ad-hoc call site (listed in `00-intent.md` Problem, and in Contracts below) to
either import it directly or construct their own formatter with the same explicit
`timeZone` option. See ADR-02.

`packages/ui/src/lib/` already exists and holds exactly this kind of pure formatting
helper — `packages/ui/src/lib/money-format.ts` (re-exported from
`packages/ui/src/index.ts` as `formatMoneyInteger` / `formatVnd`) is the direct precedent.
The new file follows the same shape: `packages/ui/src/lib/date-time-format.ts`, re-exported
from `packages/ui/src/index.ts` next to the money-format exports.

`apps/pos-web/src/lib/common/dateTime.ts` (`viDateTimeFormatter`,
`viDateTimeWithSecondsFormatter`, `formatViDateTime`, plus `parseViDate` which is
out of scope — it has no `Intl.DateTimeFormat` call and does no timezone-sensitive
work) keeps its file and its exported names, but its internal formatter
construction is replaced with calls into the shared `@erp/ui` util instead of its own
un-zoned `Intl.DateTimeFormat` instances. This avoids a call-site-touching rename across
pos-web (its `formatViDateTime` has a different signature — `(input, options)` with a
`separator`/`withSeconds` shape — from the new shared util's, so it stays a thin wrapper,
not a re-export of an identically-named function). See ADR-02 Consequences for why this is
a wrapper, not a straight delete-and-replace.

## Alternatives rejected

| Option | Why not |
|---|---|
| Deployment runbook: document "set `TZ=Asia/Ho_Chi_Minh`" for every host/CI runner instead of pinning it in code | Fragile — a new host, a new CI runner image, or a forgotten env var silently reintroduces the exact bug class already shipped once (see `00-intent.md` Problem, the four cited regressions). Config-as-code is verifiable by the test in US-04; a runbook is not. |
| Per-call-site `timeZone: 'Asia/Ho_Chi_Minh'` option added to each existing `Intl.DateTimeFormat` in place, with no shared util | Fixes the immediate ~7 call sites but does not fix the actual root cause — nothing stops the next new call site from being written without the option. This is exactly the failure mode `00-intent.md` documents: "Each fix so far has been a one-off, local patch." A shared util is the only option that makes the correct behaviour the path of least resistance. |
| New standalone shared package (e.g. `packages/shared-datetime`) instead of `packages/ui` | Rejected at A-02 (confirmed) — one function does not justify a new package's build/publish wiring when `packages/ui` is already a dependency of both apps and already holds a directly analogous formatter (`money-format.ts`). |

## Domain model

N/A — no new entities. This feature touches connection configuration and a stateless
formatting utility only.

## Contracts

No new HTTP endpoints. The "contract" for this feature is the new shared FE function's
signature.

### `formatViDateTime` — `packages/ui/src/lib/date-time-format.ts`

```ts
export interface FormatViDateTimeOptions {
  dateStyle?: "short" | "medium";   // default: "short" → dd/MM/yyyy
  withSeconds?: boolean;            // default: false
}

export function formatViDateTime(
  input: Date | string,
  options?: FormatViDateTimeOptions,
): string;
```

- **Input:** a `Date`, or an ISO-8601 string parseable by `new Date(...)`. Invalid/`NaN`
  input returns `""` (matches the existing fallback behaviour in
  `InvoiceDetailDialog/_lib/format.ts:formatDateTime` and `iam/display.ts:formatIamDateTime`,
  both of which already return `""` for null/invalid input — the shared util keeps that
  contract rather than throwing).
- **Output:** `dd/MM/yyyy HH:mm` (or `dd/MM/yyyy HH:mm:ss` when `withSeconds: true`),
  Vietnamese locale digit/separator conventions, always in Asia/Ho_Chi_Minh wall-clock
  time.
- **Always** passes `timeZone: 'Asia/Ho_Chi_Minh'` to the underlying
  `Intl.DateTimeFormat('vi-VN', ...)` — this is not configurable by the caller. A caller
  needing a different zone is out of scope; nothing in this codebase currently needs one.
- A second export, `formatViDate` (date-only, no time-of-day), covers the several call
  sites that only ever format a date (`SelectTransferReceiptDialog.tsx`,
  `SelectTransferOrderDialog.tsx`, `ledger-cash.constants.ts`,
  `LedgerDepositPage.tsx`, `StockDocumentDetailsReportPage.tsx`, `iam/display.ts`'s
  `formatIamDate`) without forcing every call site onto the datetime formatter and
  discarding the time portion downstream.

## Error taxonomy

N/A / trivial. This is an infra-config and pure-formatting-utility feature: there is no
new user-facing operation that can fail in a new way. The only "error" surface is invalid
date input to the FE formatter, which is already handled (empty-string fallback, matching
existing call-site behaviour — see Contracts above). No new Failure subtypes, no new HTTP
error responses, nothing added to `common/filters/`.

## Cache & offline

N/A — no data fetching, caching, or offline behaviour is introduced or changed by this
feature.

## State ownership

N/A — no new client or server state. The backend change is connection configuration
(process-lifetime, not request-scoped state); the frontend change is a stateless pure
function.

## Observability

N/A — no new events, metrics, or logging. Existing test coverage (US-04) is the
verification mechanism, not runtime observability.

## ADRs

### ADR-01 — Backend TypeORM connection explicitly pins Asia/Ho_Chi_Minh rather than inheriting host default

**Context:** Neither `apps/api/src/database/data-source.ts` (CLI DataSource, used for
migrations) nor `apps/api/src/app.module.ts` (`TypeOrmModule.forRootAsync`, used at
runtime) sets a `timezone` option today. Both silently inherit whatever timezone the
Postgres client session ends up with — which follows the deploy host's own default unless
something else sets it. This bug class has already shipped once, patched locally each
time (see `00-intent.md` Problem, four cited files).

**Decision:** Add `timezone: 'Asia/Ho_Chi_Minh'` to the connection options object in both
`data-source.ts` and `app.module.ts`, so the literal value lives in version-controlled
code rather than deploy-host or CI-runner configuration.

**Rejected alternative:** a deployment runbook instructing every host/CI runner to set
`TZ=Asia/Ho_Chi_Minh` in its environment. Rejected because it is unenforceable and
unverifiable by the test suite — a new host or CI image that misses the step fails
silently, exactly reproducing the bug class this feature exists to close.

**Consequences:** `SET TIME ZONE 'Asia/Ho_Chi_Minh'` now runs on every new Postgres
connection, making session-level text I/O and `AT TIME ZONE` operations deterministic
independent of host config. This does **not** guarantee correct behaviour for naive
`timestamp` (no tz) columns — how the `pg` driver parses those into JS `Date` values is a
separate, driver-level concern (see `00-intent.md` Constraints, assumption A-03), and
remains open until the out-of-scope DB column-type reconciliation (noted in Out of scope)
is done as a follow-up feature.

**Status:** accepted

### ADR-02 — One shared FE date-formatting util lives in packages/ui, all known ad-hoc call sites migrate to it

**Context:** At least 6-7 independently declared `Intl.DateTimeFormat` instances exist
across `backoffice-web` and `pos-web`, none setting `timeZone` (see `00-intent.md`
Problem for the full list with line numbers). `packages/ui` is already a dependency of
both apps (CLAUDE.md: "Always import primitives from `@erp/ui`") and already contains a
directly analogous precedent — `packages/ui/src/lib/money-format.ts`, a pure formatting
helper re-exported from `packages/ui/src/index.ts`.

**Decision:** Add `packages/ui/src/lib/date-time-format.ts` (`formatViDateTime`,
`formatViDate`), re-export both from `packages/ui/src/index.ts`, and migrate every call
site enumerated in `00-intent.md` / `02-requirements.md` AC-05/AC-06 to either import from
it or, where the existing exported function name/signature must be preserved for its own
callers (pos-web's `dateTime.ts`), wrap it internally.

**Rejected alternative:** per-app duplication — giving each of `backoffice-web` and
`pos-web` its own copy of the same formatter. Rejected because it reintroduces exactly the
drift risk this feature exists to close: two copies of "the" Vietnamese date formatter
that can silently diverge (already happened once — pos-web's `formatViDateTime` and
backoffice-web's several formatters already have inconsistent behaviour, e.g. different
default separators and no shared invalid-input handling).

**Consequences:** Every current and future date/time display in both apps can route
through one reviewed, zone-correct implementation. Honest limitation: this closes the
*display* gap for FE-rendered dates only. It does **not** fully close the timezone
correctness gap end-to-end — naive (`timestamp`, no tz) DB columns still carry no offset
information at the source, so a value that entered the system ambiguously stays ambiguous
regardless of how correctly the frontend formats it. Full closure requires the
out-of-scope column-type reconciliation noted in `00-intent.md` Out of scope and flagged
again in ADR-01. This ADR closes the "every FE call site pins the zone" gap, not the
"every stored value is unambiguous" gap.

**Status:** accepted
