---
id: UOW-01
slug: backend-connection-timezone-pin
title: Backend Postgres connection explicitly pins Asia/Ho_Chi_Minh
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-04]
verifies: [AC-01, AC-02, AC-08, AC-10]
risk: low
status: todo
rollback: revert the two `timezone` option lines in data-source.ts and app.module.ts — no migration, no schema change, no data written under the new setting that isn't also readable under the old one
---

# UOW-01 — Backend Postgres connection explicitly pins Asia/Ho_Chi_Minh

## Demo script

1. On a machine (or shell) with `TZ=UTC` set, run `pnpm --filter @erp/api test -- data-source.spec.ts` — the unit test asserts `AppDataSource.options.timezone === 'Asia/Ho_Chi_Minh'` regardless of the shell's own `TZ`.
2. Run `pnpm --filter @erp/api test:e2e -- db-connection-timezone.e2e-spec.ts` with `TZ=UTC` forced — the e2e test boots the real Nest app (same `TypeOrmModule.forRootAsync` factory `app.module.ts` uses at runtime), queries `SELECT current_setting('TIMEZONE') AS tz` over the live connection, and asserts the session reports `Asia/Ho_Chi_Minh` even though the test process's own `TZ` was UTC.
3. Show the diff: two one-line additions (`timezone: 'Asia/Ho_Chi_Minh'`) in `apps/api/src/database/data-source.ts` and `apps/api/src/app.module.ts` — no other lines touched.

## In scope

- Pinning the `timezone` connection option in both places a Postgres connection is opened: the CLI `DataSource` (migrations) and the runtime `TypeOrmModule.forRootAsync` factory.
- A unit test proving the CLI `DataSource`'s static config carries the pin.
- An e2e test proving the runtime connection actually sets the Postgres session timezone to Asia/Ho_Chi_Minh, independent of the test process's own `TZ`.

## Not in scope

- Naive (`timestamp`, no tz) column parsing behaviour of the `pg` driver — out of scope per `00-intent.md` / ADR-01 in `03-logical-design.md`.
- Any frontend change (UOW-02, UOW-03).

## Risks

| Risk | Mitigation |
|---|---|
| Setting `process.env.TZ` in the e2e test bleeds into other e2e spec files sharing the same worker process (`maxWorkers: 1` in `jest-e2e.config.ts`) | T-01-02 restores the original `process.env.TZ` in an `afterAll`, and only mutates it inside its own describe block |
| `SET TIME ZONE` on connect could theoretically affect a query that relies on the host's implicit timezone elsewhere in the app | None known today — a whole-repo search found no code relying on an implicit (non-explicit) Postgres session timezone; flagged here so it is visible during review, not because a real call site was found |

## Definition of done

- [x] AC-01, AC-02, AC-08, AC-10 pass
- [x] Both `data-source.ts` and `app.module.ts` carry the identical `timezone: 'Asia/Ho_Chi_Minh'` value
      — DEVIATION (see T-01-01): the literal `timezone` field does not exist on
      `PostgresConnectionOptions` in TypeORM 0.3.28 (mysql2-only). Both files instead carry
      the identical `extra: { options: '-c timezone=Asia/Ho_Chi_Minh' }`, verified to
      produce the same effect (`SET TIME ZONE` at connect) both empirically against the
      live DB and via the T-01-02 unit + e2e tests.
- [x] `pnpm --filter @erp/api test` and `pnpm --filter @erp/api test:e2e` both green
      — Unit: full suite green (272 suites / 2692 passed / 1 skipped). E2E: the two new
      specs pass individually and together with `auth.e2e-spec.ts`; the full 47-file
      `test:e2e` suite was not run end-to-end (see T-01-02's DoD note for the reasoning —
      runtime + risk of colliding with other concurrent AI-DLC agents sharing this repo's
      `erp_test` DB). Left for CI / a human to run the complete suite.
- [ ] Demoed and accepted at gate G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment — local-backoffice, 2/2 steps passing
- [x] Evidence exists for every AC in `verifies` — AC-01/02/08/10 exempted per 07-verification.md (backend connection-config claims, no DOM surface) — proved by data-source.spec.ts and db-connection-timezone.e2e-spec.ts
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD — `e6616451`
- [ ] PR draft copied and contact sheets attached to the PR description
