---
id: UOW-01
slug: backend-error-taxonomy
title: Backend emits a distinct auth error code per failure subtype
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03]
risk: low
status: todo
rollback: revert the AuthGuard/AuthException/HttpExceptionFilter changes — every throw site falls back to a plain UnauthorizedException with no `code`, which is a strict subset of today's response shape (ApiError.code stays a string, just synthesized as HTTP_401 again); no data migrated, no client depends on the new field yet since UOW-02 has not shipped
---

# UOW-01 — Backend emits a distinct auth error code per failure subtype

## Demo script
1. Start the API (`make dev-api`).
2. `curl` a protected endpoint with an access token whose `exp` has passed → response body
   `code` is `4014003`.
3. `curl` the same endpoint with a malformed/garbage bearer token → response body `code` is
   `4014001`.
4. `curl` the same endpoint with a structurally valid, unexpired token whose session was
   revoked (e.g. log out via `/auth/logout` first, then reuse the old access token) →
   response body `code` is `4014002`.
5. `curl` any other existing 401 or 4xx path untouched by this feature (e.g. missing
   `Authorization` header) → response body `code` is still `HTTP_401`, unchanged.

## In scope
- `AuthErrorCode` enum in `packages/shared-interfaces/src/auth/index.ts`.
- `AuthGuard.canActivate` throwing a code-carrying `AuthException` for each of its three
  failure branches (expired / malformed-invalid / revoked-session).
- `HttpExceptionFilter` preferring an exception-carried `code` over its `HTTP_${status}`
  synthesis.
- Unit + e2e tests proving the three codes reach the HTTP response body distinctly.

## Not in scope
- Any frontend change (UOW-02).
- Wiring `AuthErrorCode.REFRESH_TOKEN_INVALID` into `/auth/refresh`'s own verify failure —
  the enum value is reserved for symmetry but not used by any ticket here (see
  `03-logical-design.md` Approach, point 2).
- Any exception outside `AuthGuard` gaining a `code` — `HttpExceptionFilter`'s fallback for
  everything else is untouched.

## Risks
| Risk | Mitigation |
|---|---|
| `jsonwebtoken`'s error classes (`TokenExpiredError`, `JsonWebTokenError`, `NotBeforeError`) are checked via `instanceof`, which requires importing them correctly from the `jsonwebtoken` package — a wrong check would silently mis-bucket errors | T-01-04's unit tests exercise all three thrown types explicitly, not just the expired case |
| `HttpExceptionFilter` is the single chokepoint for every exception in the API — a bug here risks every endpoint, not just auth | T-01-03's done-when explicitly requires the pre-existing `HTTP_${status}` fallback still fires for exceptions with no `code`, and T-01-04's e2e coverage exercises a real HTTP round-trip, not a mocked filter call |

## Definition of done
- [x] AC-01, AC-02, AC-03 all pass
- [x] Three distinct `AuthErrorCode` values reach the JSON response body for the three
      `AuthGuard` failure branches
- [x] Every other exception path's `code` is still `HTTP_${status}` or `INTERNAL_ERROR`,
      unchanged
- [ ] Demoed and accepted at gate G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment — local-backoffice + local-pos, 2/2 steps passing
- [x] Evidence exists for every AC in `verifies` — AC-01/02/03 exempted per `07-verification.md`'s "Not verified here" (JSON response-body values, not DOM-observable; proved instead by `auth.guard.spec.ts` 4/4 and `auth.e2e-spec.ts` 20/20)
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD — `e6616451`
- [ ] PR draft copied and contact sheets attached to the PR description
