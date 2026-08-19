---
id: UOW-02
slug: frontend-refresh-signal
title: Both frontends key silent refresh off the access-token-expired code
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02, US-03]
verifies: [AC-04, AC-05, AC-06, AC-07, AC-08]
risk: low
status: todo
rollback: revert the `authErrorCode === AuthErrorCode.TOKEN_EXPIRED` branch in both interceptors — both its branches already call the same refresh-and-retry logic, so removing the branch (and the import) restores byte-identical behavior to today
---

# UOW-02 — Both frontends key silent refresh off the access-token-expired code

## Demo script
1. Log in to backoffice-web (`make dev-backoffice`) with the API running (UOW-01 live).
2. Let the access token expire (or shorten `JWT_SECRET`/expiry locally for the demo), then
   trigger any authenticated request.
3. Open the browser network tab: the failing request's 401 body shows `code: "4014003"`.
4. Watch the silent refresh fire and the original request succeed on retry — same visible
   behavior as before this feature, now attributable to a named branch in the interceptor.
5. Repeat steps 1-4 in pos-web (`make dev-pos`), same observation.
6. Force a 401 with no `code` (e.g. hit an endpoint guarded by older middleware, or stub the
   response in devtools) — refresh still fires, proving the AC-05 fallback.

## In scope
- `apps/backoffice-web/src/lib/api-axios.ts` — explicit `AuthErrorCode.TOKEN_EXPIRED` check
  ahead of the existing refresh-and-retry logic.
- `apps/pos-web/src/lib/common/api-axios.ts` — the same, in its own interceptor.
- Regression tests proving the fallback (no code / unrecognized code / `SESSION_REVOKED`)
  still refreshes exactly as today, and that a second 401 on an already-retried request still
  forces logout without a second refresh attempt.

## Not in scope
- Skipping the refresh attempt for `SESSION_REVOKED` (deferred per `00-intent.md` Out of
  scope and A-03) — this UoW only makes the trigger's reason observable, it does not change
  which branch runs.
- `apps/backoffice-web/src/lib/user-facing-api-error.ts` message text — AC-07 requires the
  `code` to survive unaltered, not a new display string.

## Risks
| Risk | Mitigation |
|---|---|
| Both interceptors already have subtle concurrency-coalescing logic (`isRefreshing`/`failedQueue` in backoffice-web, `refreshPromise` in pos-web); a careless edit could change control flow instead of just adding a named branch | T-02-01/T-02-02 add the check without touching the coalescing code, and T-02-03 asserts the existing single-flight behavior is unchanged |
| pos-web and backoffice-web have independent interceptor implementations with different guard variable names (`__isRetry` vs `_retry`) — a fix mirrored carelessly from one to the other could silently target the wrong variable | Each ticket touches only its own app's file; T-02-03 tests both apps separately |

## Definition of done
- [x] AC-04, AC-05, AC-06, AC-07, AC-08 all pass (see T-02-03 Done-when for the pos-web
      second-401 nuance found in pre-existing code: the "no second refresh call" half of
      AC-06 holds and is tested for both apps; the "clears session and redirects" half is
      only backoffice-web's actual current behavior — pos-web's equivalent branch was
      already a silent no-op on a second 401 before this feature)
- [x] Both interceptors' refresh-and-retry branch is unchanged for every 401 outside
      `TOKEN_EXPIRED`
- [ ] Demoed and accepted at gate G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment — local-backoffice + local-pos, 2/2 steps passing
- [x] Evidence exists for every AC in `verifies` — AC-04/05/06 via S1's live evidence; AC-07/08 exempted per `07-verification.md`'s "Not verified here" (data-shape/mid-session-revocation claims not DOM-observable; proved instead by `api-axios.test.ts` in both apps)
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD — `e6616451`
- [ ] PR draft copied and contact sheets attached to the PR description
