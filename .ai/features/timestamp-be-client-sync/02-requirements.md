---
feature: timestamp-be-client-sync
stories: 4
acceptance_criteria: 10
---

# Requirements — Explicit Timezone for Timestamps

## US-01 — Backend connection pins the business timezone

As a backend/infra operator, I want the Postgres connection to explicitly pin
Asia/Ho_Chi_Minh so that the API's behaviour does not depend on the deploy host's own
timezone setting.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Explicit timezone configured
```gherkin
Given the API's TypeORM connection configuration (CLI DataSource and app runtime module)
When the connection is established
Then the configuration explicitly pins the timezone to Asia/Ho_Chi_Minh
And this does not rely on the deploy host's own default timezone
```

**AC-02** — Same config in migrations and runtime
```gherkin
Given both apps/api/src/database/data-source.ts (used for migrations) and
  apps/api/src/app.module.ts (used at runtime)
When either is inspected
Then both pin the same explicit timezone, not just one of the two
```

## US-02 — A single shared FE date/time formatter exists

As a frontend developer, I want one shared date/time formatting utility used by both
backoffice-web and pos-web so that timezone correctness is enforced in one place instead
of independently in every call site.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-03** — Shared util exists and pins the zone
```gherkin
Given the shared date/time formatting utility
When it formats any JS Date or ISO timestamp
Then it explicitly passes timeZone: 'Asia/Ho_Chi_Minh' to Intl.DateTimeFormat
```

**AC-04** — Usable from both apps
```gherkin
Given the shared utility's chosen home (resolved at G2, see A-02 in 01-assumptions.md)
When backoffice-web or pos-web imports it
Then both apps can import and use the same formatting function without duplicating it
```

## US-03 — Every ad-hoc formatter is migrated

As a frontend developer, I want every existing ad-hoc `Intl.DateTimeFormat` call site
migrated to the shared formatter (or given an explicit `timeZone`) so that no display
path is left silently dependent on the browser's local timezone.

**Priority:** must
**Depends on:** US-02

### Acceptance criteria

**AC-05** — pos-web central util migrated
```gherkin
Given apps/pos-web/src/lib/common/dateTime.ts (viDateTimeFormatter,
  viDateTimeWithSecondsFormatter, formatViDateTime)
When the file is inspected after this feature
Then it either delegates to the shared formatter or explicitly passes
  timeZone: 'Asia/Ho_Chi_Minh'
```

**AC-06** — backoffice-web call sites migrated
```gherkin
Given the backoffice-web ad-hoc formatters:
  apps/backoffice-web/src/pages/chain-store/reports/InvoiceDetailDialog/_lib/format.ts (formatDateTime),
  apps/backoffice-web/src/lib/iam/display.ts (formatIamDateTime),
  apps/backoffice-web/src/pages/purchase-orders/SelectTransferReceiptDialog.tsx (dateFmt/formatDate),
  apps/backoffice-web/src/pages/goods-issue/SelectTransferOrderDialog.tsx (dateFmt/formatDate),
  apps/backoffice-web/src/pages/treasury/ledger-cash/ledger-cash.constants.ts (LEDGER_CASH_VI_DATE),
  apps/backoffice-web/src/pages/treasury/deposit/LedgerDepositPage.tsx (VI_DATE),
  apps/backoffice-web/src/pages/reports/storage/StockDocumentDetailsReportPage.tsx (DATE_FMT)
When each file is inspected after this feature
Then each either delegates to the shared formatter or explicitly passes
  timeZone: 'Asia/Ho_Chi_Minh'
```

**AC-07** — No orphaned ad-hoc formatter remains
```gherkin
Given a whole-repo search for Intl.DateTimeFormat under apps/backoffice-web, apps/pos-web
When run after this feature ships
Then every remaining match either constructs the shared formatter itself or passes an
  explicit timeZone option — none rely on the implicit default
```

## US-04 — Timezone-independence is proven by test

As a developer maintaining this code, I want an automated test that forces a non-Vietnam
`TZ` and asserts the output is still correct, so that a future regression is caught in CI
rather than discovered in production the next time a deploy host's timezone changes.

**Priority:** must
**Depends on:** US-01, US-02

### Acceptance criteria

**AC-08** — Backend test under a foreign TZ
```gherkin
Given a Jest test that sets process.env.TZ to a non-Vietnam value (e.g. 'UTC' or
  'America/New_York') before the assertion
When a fixed UTC instant is read/formatted through the backend's timezone-aware path
Then the result matches the expected Asia/Ho_Chi_Minh wall-clock value, not the value
  that TZ would imply
```

**AC-09** — Frontend test under a foreign TZ
```gherkin
Given a test harness that forces a non-Vietnam TZ (e.g. via process.env.TZ or a mocked
  Intl.DateTimeFormat resolvedOptions) before the assertion
When the shared FE formatter renders a fixed instant
Then the rendered string matches the expected Asia/Ho_Chi_Minh wall-clock value,
  regardless of the forced TZ
```

**AC-10** — Regression coverage for the known bug class
```gherkin
Given the existing regression tests that document the prior UTC-parsing bugs
  (apps/api/src/modules/promotion/application/date-format.util.spec.ts,
  apps/api/src/modules/promotion/domain/model/value-objects/date-window.spec.ts)
When the test suite runs after this feature ships
Then those existing tests still pass, and the new US-04 tests provide the same class of
  protection for the connection-config and shared-formatter code introduced here
```

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Boundary | This feature does not modify DB column types (`timestamp` vs `timestamptz`), does not add server-side plausibility validation on client-submitted dates, and does not unify the two divergent form-serialization helpers (`GoodsReceiptFormDialog` vs `GoodsIssueFormDialog`) — all three are out of scope per `00-intent.md` | Reviewed at code review against the Out of scope section |
| Consistency | The explicit timezone used everywhere (backend connection, shared FE formatter) is the same literal value, Asia/Ho_Chi_Minh | AC-01, AC-03 |
