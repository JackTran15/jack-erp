---
feature: pos-session-expiry-fix
adr_count: 4
---

# Logical design — pos-session-expiry-fix

## Approach

Three independent, additive changes, each addressing one of the root causes found during
discovery:

1. **Backend TTL config.** Move `ACCESS_TOKEN_TTL`/`REFRESH_TOKEN_TTL` from module-level
   constants (`auth.service.ts:31-32`) to instance fields read once in the constructor via
   `this.config.get<number>('JWT_ACCESS_TTL', 86400)` /
   `this.config.get<number>('JWT_REFRESH_TTL', 2592000)`, mirroring the existing
   `jwtSecret`/`jwtRefreshSecret` pattern (`auth.service.ts:58-62`) exactly. Every one of the
   16 existing usages (`login`, `refresh`, `switchBranch`, `exchangeHandoffCode`,
   `signAccessToken`, `signRefreshToken`) switches from the module constant to the instance
   field — a mechanical rename, no control-flow change.
2. **Shared refresh coordination (pos-web).** Extract the near-duplicate
   `tryRefreshToken`/`refreshOnce` pair out of `http.ts` (`:13-55`) and `api-axios.ts`
   (`:47-81`) into one new module, imported by both, so there is exactly one in-flight
   refresh promise app-wide instead of two independent ones.
3. **Silent session restore (pos-web).** Extend `PosSessionHandoff` — the existing
   pre-`<Routes>` gate that already blocks render until an async auth-bootstrap step
   resolves (today: the `?handoff=` code exchange) — to also proactively call the shared
   `refreshOnce()` from (2) when `authService.isAuthenticated()` is false but a refresh
   token is present in storage, before `<Routes>` (and therefore `PosRequireAuth`) renders.

## Alternatives rejected

| Option | Why not |
|---|---|
| Make `PosRequireAuth` itself async (loader/suspense-based) | `PosSessionHandoff`'s own doc comment says it exists specifically because `PosRequireAuth` is synchronous, and the handoff flow depends on that synchronicity to work at all. Reworking the guard risks the handoff mechanism for no added benefit over extending the existing gate. |
| Migrate all 14 `http.ts`-backed services onto the axios client (`api-axios.ts`), collapsing to one HTTP client like backoffice-web | Fixes the same race by eliminating the duplication at the transport level, but is a much larger, riskier refactor across 14 service files. The actual bug is duplicated *refresh coordination*, not the choice of transport — fixing the smaller thing fixes the bug. |
| Add a client-side idle/absolute session timeout independent of token TTL | Not requested. Conflates "enforce a security policy" with "stop incorrectly logging out a still-valid session" — a different problem than the one reported. |
| Read TTLs from env with no code-side default (fail if unset) | A missing/misconfigured env var would silently produce an unsigned or `NaN`-TTL token. An explicit default matching the new 1d/30d values keeps every environment safe even before its `.env` is updated, matching the existing `jwtSecret` fallback pattern. |

## Domain model

No new entities. `JwtPayload` and the Redis-backed `SessionPayload` (`session.store.ts:4-11`)
are unchanged in shape — only the `ttlSeconds` value passed to `SessionStore.createSession`
changes source, from a module constant to the configured instance field.

## Contracts

No API contract changes. `POST /auth/login`, `POST /auth/refresh`, `POST /auth/switch-branch`
keep their existing request/response shapes — only the numeric `expiresIn` in the response
body and the `exp` claim inside the signed tokens change value.

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| In-flight refresh promise (pos-web) | new shared refresh-coordination module, replacing the two separate copies in `http.ts`/`api-axios.ts` | Module-level singleton, same lifetime as today's two copies |
| "has this app load already attempted a proactive silent refresh" | `PosSessionHandoff` local state, alongside its existing `code`-handoff `pending` state | Component lifetime (mount → resolved) |
| Access/refresh token TTL (backend) | `AuthService` instance fields, read once from `ConfigService` in the constructor | Process lifetime — a TTL change requires a restart, same as `jwtSecret` today |

## Error taxonomy

No new error branch. Every refresh failure (network error, revoked session, invalid/expired
refresh token) is treated identically to today — clear both tokens, redirect to
`/dang-nhap`. `api-axios.ts`'s existing `AuthErrorCode.TOKEN_EXPIRED` branch (owned by the
separate `auth-token-auto-refresh` feature) is preserved verbatim; this feature does not add
to or consume the `AuthErrorCode` enum.

## ADRs

### ADR-01 — TTLs become `ConfigService`-backed with explicit defaults, not env-only or hardcoded-only
**Context:** `.env.example` already declares `JWT_ACCESS_TTL`/`JWT_REFRESH_TTL`, but nothing
in `apps/api/src` reads them (confirmed by grep) — the real values are two hardcoded
constants that only numerically match the env file by coincidence.
**Decision:** Read both via `this.config.get<number>('JWT_ACCESS_TTL', 86400)` /
`this.config.get<number>('JWT_REFRESH_TTL', 2592000)` once in the constructor, exactly
mirroring the codebase's own established pattern for `jwtSecret`.
**Consequences:** Ops can retune per environment without a redeploy. If the var is absent,
the new 1d/30d default still applies safely. The tradeoff, confirmed during discovery
(assumption A-02): any environment that already sets these vars explicitly — this checkout's
own `apps/api/.env` does — will keep using its explicit (old, 15min/7day) value until that
environment's `.env` is itself updated; the code default alone does not retroactively change
an explicitly-set value. `.env.example`'s documented defaults are updated to the new values
so the file stops describing behavior the code doesn't have.
**Status:** accepted

### ADR-02 — The proactive silent-refresh gate lives in `PosSessionHandoff`, not a new component or an async `PosRequireAuth`
**Context:** `PosRequireAuth`'s synchronous `exp` check is the direct cause of most forced
logouts. It is deliberately synchronous today so `PosSessionHandoff` can block `<Routes>`
render during the async `?handoff=` code exchange (`PosSessionHandoff.tsx` doc comment:
"`PosRequireAuth` chạy đồng bộ nên nếu không chặn render thì nó đá thẳng sang
`/dang-nhap`").
**Decision:** Reuse `PosSessionHandoff`'s existing "block render until an async bootstrap
step resolves" gate for a second bootstrap step — proactive silent refresh — instead of
introducing a second gate component or making `PosRequireAuth` itself async.
**Consequences:** One render-blocking mechanism instead of two; `PosRequireAuth.tsx` is not
touched by this feature at all. The tradeoff is `PosSessionHandoff` now carries two
responsibilities (handoff exchange, proactive refresh) instead of one, so its doc comment
needs updating to describe the broader "session bootstrap" role, and its rendering order
matters: the proactive-refresh check must not run (or must no-op) while a `?handoff=` code
exchange is in progress, since a handoff always supersedes whatever tokens are already in
storage (AC-06).
**Status:** superseded by ADR-04 — see below. `PosSessionHandoff` mounts once for the whole
app lifetime; it does not re-run on a client-side route change. Live G4 demoing (clear the
access token, click a nav link without reloading — the exact "idle cashier clicks" scenario
from `00-intent.md`) proved this ADR's scope was incomplete: it fixes "the POS app loads"
but not "the user navigates," and AC-04 requires both. The reasoning that motivated leaving
`PosRequireAuth` untouched (protecting the handoff mechanism's synchronicity) still holds —
that mechanism only needs the *first* render gated, which `PosSessionHandoff` still does —
but the conclusion drawn from it (never touch `PosRequireAuth`) was too broad.

### ADR-04 — `PosRequireAuth` also attempts a silent refresh, on every navigation
**Context:** Per ADR-02's supersession note above: `PosSessionHandoff`'s gate is mount-only,
so an access token that expires while the SPA tab stays open (the normal case for an
always-on POS terminal) is invisible to it. `PosRequireAuth` re-evaluates
`authService.isAuthenticated()` on every navigation via `useLocation()` and, until now, acted
on it immediately with no chance to refresh first.
**Decision:** `PosRequireAuth` gains the same check-then-maybe-refresh behavior
`PosSessionHandoff` already has — reusing the same shared `refreshOnce()` (UOW-02) and the
same no-op conditions (`restoreSessionIfNeeded`, or an equivalent) — gated by a brief pending
state, before deciding to render `<Outlet />` or redirect to `/dang-nhap`.
**Consequences:** `PosRequireAuth.tsx` is no longer untouched by this feature — the "zero
diff" requirement from UOW-03's original definition-of-done is retired. The handoff mechanism
is unaffected: it only ever depended on the *first* render being gated by
`PosSessionHandoff`, not on `PosRequireAuth` staying synchronous forever. A brief pending UI
now appears on every navigation where the access token has actually expired (not on every
navigation — the common case, a still-valid token, adds no extra render or async work).
**Status:** accepted

### ADR-03 — Unify refresh *coordination* across pos-web's two HTTP clients, not the two transports themselves
**Context:** `http.ts` (fetch) and `api-axios.ts` (axios) each independently implement the
same rotate-and-revoke-aware refresh flow (`http.ts:13-55`, `api-axios.ts:47-81`, nearly
identical). Because `/auth/refresh` revokes the previous `jti` on every call
(`auth.service.ts:153`), that duplication — not the choice of transport — is what causes the
race described in US-03.
**Decision:** Extract only the shared `tryRefreshToken`/`refreshOnce` singleton into one new
module both clients import; leave the two transports (fetch vs axios) as they are.
**Consequences:** Fixes the actual race with a small, contained change confined to the
refresh path. The two-transport inconsistency itself remains (pre-existing, out of scope —
see `00-intent.md`), but it was never the source of the reported bug, so leaving it alone is
not a compromise on this feature's goal.
**Status:** accepted
