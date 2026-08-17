---
feature: auth-token-auto-refresh
adr_count: 2
---

# Logical design — auth-token-auto-refresh

## Approach

Introduce a shared `AuthErrorCode` enum in `packages/shared-interfaces/src/auth/index.ts`
(the existing home for `JwtPayload`, `LoginRequest`, `RefreshRequest`, `LoginResponse`,
`RefreshResponse`, `SwitchBranchRequest/Response`, `CreateHandoffRequest/Response`,
`ExchangeHandoffRequest/Response`, `SessionInfo` — confirmed by reading the file). Values
follow the `<3-digit-http-status><4-digit-reason>` shape named in A-01/A-02:

```ts
export enum AuthErrorCode {
  TOKEN_MALFORMED = '4014001',       // JsonWebTokenError / NotBeforeError (invalid signature/malformed)
  SESSION_REVOKED = '4014002',       // Redis session lookup fails / jti revoked
  TOKEN_EXPIRED = '4014003',         // TokenExpiredError specifically
  REFRESH_TOKEN_INVALID = '4014004', // /auth/refresh's own verify failure, for symmetry
}
```

This resolves A-02 (proposed numbering confirmed as final for this pass, per the brief).

**Backend.** `AuthGuard.canActivate` (`apps/api/src/common/guards/auth.guard.ts:28-62`)
currently has one `try/catch` around `jwt.verify()` (lines 46-51) that throws a single
generic `UnauthorizedException('Invalid or expired token')` regardless of failure subtype,
and one Redis liveness check (lines 53-57) that throws `UnauthorizedException('Session
revoked or expired')`. Neither exception carries a machine-readable code — both fall through
`HttpExceptionFilter.catch` (`apps/api/src/common/filters/http-exception.filter.ts:16-70`),
which unconditionally synthesizes `code: \`HTTP_${status}\`` at line 32, discarding any
distinction the guard might have made.

The fix has two parts:

1. **A code-carrying exception.** A new `AuthException` class (`extends UnauthorizedException`,
   new file `apps/api/src/common/exceptions/auth.exception.ts`) that accepts an `AuthErrorCode`
   and stores it on a public `code` field, plus a `message`. This repo has no prior
   `HttpException` subclass to match (confirmed by search — `auth.exception.ts` is a new
   pattern), so the shape is deliberately minimal: the smallest thing that lets the filter read
   an exception-carried code without changing `HttpException`'s constructor contract.
2. **`AuthGuard` branches on failure subtype.** The `catch` block at
   `auth.guard.ts:48-51` inspects `err.name` (or `err instanceof`, matching how `jsonwebtoken`
   distinguishes its own errors: `TokenExpiredError`, `JsonWebTokenError`, `NotBeforeError`)
   and throws `AuthException` with `AuthErrorCode.TOKEN_EXPIRED` for `TokenExpiredError`, or
   `AuthErrorCode.TOKEN_MALFORMED` for anything else jwt.verify can throw (`JsonWebTokenError`,
   `NotBeforeError`). The Redis check at lines 53-57 throws `AuthException` with
   `AuthErrorCode.SESSION_REVOKED`. `AuthErrorCode.REFRESH_TOKEN_INVALID` is reserved for
   `/auth/refresh`'s own verify failure (`AuthService.refresh`, `auth.service.ts:125-191`) for
   taxonomy symmetry; wiring it into that path is not required by any AC in
   `02-requirements.md` (US-01..03 scope `AuthGuard` only) and is therefore not scheduled in
   any UoW ticket below — the enum member exists so the value is reserved and doesn't collide
   with a future addition, not because this pass wires it up.

3. **`HttpExceptionFilter` prefers an exception-carried code.** At
   `http-exception.filter.ts:27-41`, before falling back to `` `HTTP_${status}` ``, check
   whether `exception` is an `AuthException` (or, more generally, carries a `code: string`
   property) and use that value verbatim. Every other exception path in the codebase is
   untouched — the fallback stays exactly as it is today for anything that doesn't opt in.

**Frontend.** Both interceptors — `apps/backoffice-web/src/lib/api-axios.ts:65-120` and
`apps/pos-web/src/lib/common/api-axios.ts:44-114` — already run the same
refresh-and-retry logic for any 401. The only change is an explicit read of
`error.response?.data?.code` before that logic runs, purely to make *why* the refresh fires
observable (network tab, logs); the branch that actually triggers refresh-and-retry is
untouched, and any code value other than `TOKEN_EXPIRED` — including `undefined`, an unknown
string, or `SESSION_REVOKED`/`TOKEN_MALFORMED`/`REFRESH_TOKEN_INVALID` — falls through to the
exact same refresh attempt that runs today (AC-05, AC-08 regression guard).

## Alternatives rejected

| Option | Why not |
|---|---|
| Frontend fast-fails to logout on `SESSION_REVOKED` instead of attempting refresh | Out of scope per US-03 and `00-intent.md`'s Out-of-scope list — explicitly deferred as a follow-up UX optimization; refresh already legitimately fails for a revoked session today, so skipping it is not correctness-bearing, only a saved round-trip. Doing it now would also mean this UoW's frontend ticket carries a real behavior change instead of a pure signal change, contradicting AC-08 |
| A generic per-domain error-code mapping table inside `HttpExceptionFilter` (e.g. a big switch on exception class name) | Couples the filter to every domain's taxonomy and doesn't scale past auth; an exception-carried `code` property is simpler, keeps the taxonomy owned by the domain that throws it, and requires no filter change when a new domain adds its own codes later |

## Domain model

No new persisted entity. `AuthErrorCode` is a stateless string enum; `AuthException` is a
transient, per-request `HttpException` subtype — nothing here crosses a transaction boundary
or is stored.

## Contracts

### `AuthErrorCode` (packages/shared-interfaces/src/auth/index.ts)
```ts
export enum AuthErrorCode {
  TOKEN_MALFORMED = '4014001',
  SESSION_REVOKED = '4014002',
  TOKEN_EXPIRED = '4014003',
  REFRESH_TOKEN_INVALID = '4014004',
}
```
Imported by `apps/api` (guard + exception), `apps/backoffice-web`, and `apps/pos-web`
(interceptor comparisons) — the reason this lives in `shared-interfaces` rather than
`apps/api` per the existing convention (`JwtPayload` et al. already cross this same
boundary).

### `AuthException` (apps/api/src/common/exceptions/auth.exception.ts, new)
```ts
export class AuthException extends UnauthorizedException {
  public readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
```

### `AuthGuard.canActivate` — response shape by failure subtype
All three throw sites keep returning HTTP 401 (`UnauthorizedException`'s status is
unchanged); only the body's `code` field becomes distinguishable:
```json
{ "code": "4014003", "message": "...", "details": { "requestId": "..." } }
```

### `HttpExceptionFilter.catch` — code resolution order
1. If `exception` carries a truthy `code` property (string) — e.g. `AuthException` — use it
   verbatim.
2. Else, existing behavior: `` `HTTP_${status}` `` for any `HttpException`, `INTERNAL_ERROR`
   for anything else.

This is additive to the `if (exception instanceof HttpException)` branch at
`http-exception.filter.ts:27` — no change to the `else` branch (line 42-49) or to the
logging/response-shipping code below it (lines 51-70).

Failure modes unchanged: this feature adds no new HTTP status codes, only a `code` field
inside the existing 401 body shape (`ApiError`, `packages/shared-interfaces/src/common/index.ts:45-49`
— `{ code: string; message: string; details?: Record<string, unknown> }`, already generic
enough to hold an `AuthErrorCode` value with no shape change).

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| `AuthErrorCode` enum values | `packages/shared-interfaces` (compiled into all 3 consumers) | Build-time constant, no runtime state |
| Which code a given 401 carries | Set once by `AuthGuard`/`AuthException` per request, read once by each interceptor | Single request/response cycle |
| Refresh-in-flight coalescing (`isRefreshing`/`failedQueue` in backoffice-web, `refreshPromise` in pos-web) | Existing interceptor closures, unchanged by this feature | Module-scoped, unchanged |

## Error taxonomy

| `AuthErrorCode` | HTTP status | Thrown from | FE behavior |
|---|---|---|---|
| `TOKEN_EXPIRED` (`4014003`) | 401 | `AuthGuard.canActivate` catch block, `err instanceof TokenExpiredError` | Refresh-and-retry attempted (explicitly, matched on this code) |
| `TOKEN_MALFORMED` (`4014001`) | 401 | `AuthGuard.canActivate` catch block, `err instanceof JsonWebTokenError \| NotBeforeError` | Refresh-and-retry attempted (fallback path — code recognized but not the expiry case, same as unrecognized) |
| `SESSION_REVOKED` (`4014002`) | 401 | `AuthGuard.canActivate`, Redis `sessionStore.isSessionActive` returns false | Refresh-and-retry attempted (fallback path); refresh itself is expected to fail since the session is gone, then existing clear-session-and-redirect fires (AC-08, unchanged) |
| `REFRESH_TOKEN_INVALID` (`4014004`) | 401 | Reserved for `/auth/refresh`'s own verify failure — not wired in this pass (`AuthService.refresh` untouched, per Out-of-scope) | N/A this pass |

All rows except the reserved one resolve to "refresh-and-retry attempted" — this is the
AC-05/AC-08 regression guarantee: only `TOKEN_EXPIRED` is matched explicitly, but every other
outcome (recognized-but-different code, absent code, or unrecognized code) falls through the
same `if not TOKEN_EXPIRED -> still refresh` branch, so no 401 is worse off than before this
change.

## Cache & offline

Not applicable — no client-side caching or offline behavior is introduced or touched by this
feature.

## Observability

`AuthGuard` already logs at `debug` level on both failure paths (`auth.guard.ts:49,55`); those
log lines gain the same distinction the thrown exception now carries (the `err.name` used to
pick the code is already in the log message, so no new log statement is required — this is
noted here, not scheduled as a separate ticket). `HttpExceptionFilter` already logs a
one-line `warn` for every non-5xx exception (`http-exception.filter.ts:64-67`); no change
there — the exception's `code` is not currently interpolated into that log line and adding it
is not required by any AC.

## ADRs

### ADR-01 — Auth error codes live in a shared numeric enum in `packages/shared-interfaces`
**Context:** All three consumers (API, backoffice-web, pos-web) need to agree on the same
set of auth failure codes. `packages/shared-interfaces/src/auth/index.ts` is the existing,
already-shared home for auth-domain types crossing this exact boundary (`JwtPayload`,
`LoginResponse`, `RefreshResponse`, etc.).
**Decision:** Add `AuthErrorCode` as a TS `enum` with string values shaped
`<3-digit-http-status><4-digit-reason>`, exported from `packages/shared-interfaces/src/auth/index.ts`.
**Rejected alternative:** Keep string messages only and have each frontend parse/match on
message text — rejected, string-matching for control flow is brittle (breaks silently on any
copy change) and gives no compile-time safety across three separately-deployed apps.
**Consequences:** Any new auth failure subtype added later must get a new enum member here,
not a new ad-hoc string; both frontends and the backend take a compile-time dependency on
`@erp/shared-interfaces`, which they already have.
**Status:** accepted

### ADR-02 — `HttpExceptionFilter` reads an explicit code from the exception when present, else falls back to `HTTP_<status>`
**Context:** `HttpExceptionFilter` is the single chokepoint all thrown exceptions pass
through before becoming a JSON response; today it always overwrites `code` with
`` `HTTP_${status}` ``, which is why `AuthGuard`'s internal distinction never reached the
client.
**Decision:** In the `exception instanceof HttpException` branch, check for a truthy `code`
property on the exception instance first; use it verbatim if present, otherwise keep the
existing `` `HTTP_${status}` `` synthesis. No change to the non-`HttpException` (`INTERNAL_ERROR`)
branch.
**Rejected alternative:** A generic per-domain error-code mapping table inside the filter
(see Alternatives rejected above) — rejected for the same reason: it couples the filter to
every domain's taxonomy instead of letting the throwing exception own its own code.
**Consequences:** Every future domain that wants a machine-readable code follows the same
pattern — a small exception subclass carrying `code` — without touching the filter again;
existing exceptions that don't set `code` are byte-for-byte unaffected.
**Status:** accepted
