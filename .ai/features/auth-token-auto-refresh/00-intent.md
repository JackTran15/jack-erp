---
feature: auth-token-auto-refresh
slug: auth-token-auto-refresh
owner: Akenzy
created: 2026-08-17
status: draft
---

# Intent — auth-token-auto-refresh

## Problem

Every 401 the API returns today looks the same to a client: `{ code: "HTTP_401", message: "..." }`,
synthesized generically by `HttpExceptionFilter` (`apps/api/src/common/filters/http-exception.filter.ts:12-70`,
`code` built as `` `HTTP_${status}` `` at line 32). But `AuthGuard`
(`apps/api/src/common/guards/auth.guard.ts:28-62`) internally already distinguishes three
different failure modes and just throws them away into one indistinguishable message:

- `jwt.verify()` throwing `TokenExpiredError` — the access token is simply stale; a refresh
  fixes it instantly.
- `jwt.verify()` throwing `JsonWebTokenError` / `NotBeforeError` — the token is malformed or
  its signature doesn't check out; refreshing cannot fix this.
- The Redis session-liveness check failing on `jti` (lines 53-57) — the session itself was
  revoked (logout elsewhere, admin action, expiry); refreshing is pointless because the
  refresh token's session is gone too.

All three collapse to the same `UnauthorizedException('Invalid or expired token')` (line 50,
for the first two) or a differently-worded but equally uncoded `UnauthorizedException('Session
revoked or expired')` (lines 53-57) — neither carries a machine-readable distinction. Both
frontends already have a complete, production 401→refresh→retry interceptor
(`apps/backoffice-web/src/lib/api-axios.ts:65-120`, `apps/pos-web/src/lib/common/api-axios.ts:44-114`),
but because they cannot tell "access token merely expired" from "session was revoked, don't
bother", they can only treat every 401 identically: attempt a refresh, and if that also fails,
log the user out. For a revoked session, that means a wasted refresh round-trip on every
request until the retry-guard kicks in — using refresh failure as a proxy for a distinction the
backend already knows and is throwing away.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| Backoffice-web / POS-web user with a merely-expired access token | Interceptor already refreshes silently today (works by accident, not by signal) | Interceptor refreshes silently because the response explicitly says "access token expired" |
| Backoffice-web / POS-web user whose session was revoked (logged out elsewhere, admin action) | Interceptor still attempts a refresh first (wasted round-trip) before falling through to logout | Backend response is distinguishable at the shape level for this case (frontend branching on it is explicitly out of scope for this pass — see below) |
| Backend/frontend integrator reading a 401 in the network tab | Sees `HTTP_401` for every auth failure, no way to tell which one without also inspecting the message string | Sees a distinct machine-readable auth error code per failure subtype |

## Success signal

A codified auth error taxonomy exists — `AuthGuard` emits a distinct code for each of its three
failure branches (expired / malformed-invalid / revoked-session) instead of one generic 401 —
both frontends' interceptors key their silent-refresh trigger off the access-token-expired code
specifically, and a regression test proves that a 401 carrying no code or an unrecognized code
still falls back to today's always-attempt-refresh behavior (no client is worse off than before
this change). This is verified by: unit tests on the guard asserting each of the three thrown
exceptions carries its own code; and frontend tests/assertions that the interceptor's
refresh-triggering branch is driven by the new code, with an explicit case proving the
fallback path is unchanged for uncoded/unrecognized 401s.

## Out of scope

- Fixing pos-web's localStorage-for-both-tokens vs backoffice-web's memory-for-access-token
  divergence from CLAUDE.md's documented convention — pre-existing, unrelated to this feature.
- Changing `/auth/refresh`'s rotation logic (`AuthService.refresh`, `auth.service.ts:125-191`) —
  it already works; this feature only changes what a *failed* auth attempt reports.
- Adding error codes for non-auth domains (validation errors, business-rule errors,
  `INTERNAL_ERROR`) — this pass touches the auth failure paths in `AuthGuard` only. The
  generic `HTTP_${status}` fallback in `HttpExceptionFilter` stays as-is for everything else.
- Making the frontend actually skip the refresh attempt for a revoked session (the "wasted
  round-trip" behavior described above) — this pass only makes the revoked-session case
  distinguishable in the response shape; whether/how the frontend acts on it is deferred (see
  `01-assumptions.md` and US-03 in `02-requirements.md`).
- Locking the exact numeric code values — the shape/convention is decided here; the final
  numbering is a G2 logical-design/ADR decision (see assumption register).

## Constraints

| Kind | Detail |
|---|---|
| Compatibility | Existing interceptor behavior (coalescing concurrent 401s, `__isRetry`/`_retry` loop guards, terminal clear-session-and-redirect) must not regress for any 401 the new taxonomy doesn't cover |
| Compatibility | `/auth/refresh`'s request/response contract and rotation semantics are unchanged |
| Convention | New error-code type must be importable from both `apps/api` and the two frontend apps, so it belongs in `packages/shared-interfaces/src/` |
| Scope | Auth-domain error codes only; no general-purpose `ErrorCode` catalog for the rest of the API in this pass |

## Existing surface touched

- Backend: `apps/api/src/common/guards/auth.guard.ts` (distinguish the three throw sites),
  `apps/api/src/common/filters/http-exception.filter.ts` (currently synthesizes `code` — needs
  to preserve an explicit code when one is attached to the exception instead of overwriting it).
- Shared types: `packages/shared-interfaces/src/auth/index.ts` — existing home for
  `JwtPayload`, `LoginResponse`, `RefreshResponse`, etc.; the natural place for a new
  auth error code enum. `packages/shared-interfaces/src/common/index.ts` — existing `ApiError`
  interface (`code: string`) that responses already conform to; not proposing to change its
  shape, just to make `code` a known enum value in the auth case.
- Frontend: `apps/backoffice-web/src/lib/api-axios.ts:65-120` (401→refresh→retry interceptor),
  `apps/backoffice-web/src/lib/user-facing-api-error.ts:103-126` (generic 401 message mapping),
  `apps/pos-web/src/lib/common/api-axios.ts:44-114` (its own separate 401→refresh→retry
  interceptor; no equivalent user-facing-error-message layer exists here today).
- Adjacent/reused: `/auth/refresh` endpoint (`auth.controller.ts:44-49`, `auth.service.ts:125-191`)
  — consumed, not modified.
