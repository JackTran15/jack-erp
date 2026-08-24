---
feature: pos-session-expiry-fix
slug: pos-session-expiry-fix
owner: Akenzy
created: 2026-08-24
status: draft
---

# Intent — pos-session-expiry-fix

## Problem

Cashier accounts on POS get forced back to the login screen constantly and have to re-login
often, even though both frontends already implement a full 401→refresh→retry flow. Four
distinct, verified root causes:

1. **Access token TTL is a hardcoded 15 minutes.** `ACCESS_TOKEN_TTL = 15 * 60` /
   `REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60` (`apps/api/src/modules/auth/auth.service.ts:31-32`),
   consumed by `signAccessToken`/`signRefreshToken` (lines 428-439) — far too short for a
   checkout terminal that sits idle between customers.
2. **`PosRequireAuth` bypasses the refresh flow entirely.** `authService.isAuthenticated()`
   (`apps/pos-web/src/services/auth.service.ts:82-92`) does nothing but compare the access
   token's decoded `exp` claim to `Date.now()`. `PosRequireAuth`
   (`apps/pos-web/src/components/common/PosRequireAuth/PosRequireAuth.tsx`) calls this
   synchronously on every route render and, the instant the 15-minute token expires,
   hard-redirects to `/dang-nhap` on the next navigation — without ever calling
   `/auth/refresh`, even though a valid 7-day refresh token sits right there in
   `localStorage`. This is the direct, most-frequent cause of the reported symptom: a
   cashier who idles at checkout for >15 minutes gets logged out on their very next click.
3. **pos-web runs two independent HTTP clients with uncoordinated refresh.**
   `apps/pos-web/src/lib/common/http.ts` (fetch-based, used by 14 of ~15 services) and
   `apps/pos-web/src/lib/common/api-axios.ts` (axios-based, used by auth/switch-branch/
   handoff) each implement their own module-level `tryRefreshToken`/`refreshOnce` pair
   (confirmed: `http.ts:13-55`, `api-axios.ts:47-81`, nearly identical, independently
   maintained). Because `POST /auth/refresh` rotates and revokes the previous session `jti`
   on every call (`auth.service.ts:153`), two near-simultaneous 401s — one per client — can
   race: whichever refresh call loses gets `Session expired or revoked` on a refresh token
   that's already been superseded, and both clients treat that as a fatal auth failure
   (clear tokens, redirect to `/dang-nhap`) even though the session itself is still valid.
4. **The TTL env vars that already exist don't do anything.** `apps/api/.env.example:36-37`
   declares `JWT_ACCESS_TTL=900` / `JWT_REFRESH_TTL=604800`, but nothing in `apps/api/src`
   reads them (confirmed by grep) — the real values are the hardcoded constants in (1), which
   only numerically match the env file by coincidence. Retuning session length today requires
   a code change and redeploy, not a config change.

Backoffice-web does not have bugs #2 or #3 — it has one shared axios client (`http.ts` there
is a thin wrapper over the same `apiClient` instance, confirmed) and no client-side `exp`
short-circuit; its `isAuthenticated` state comes from a bootstrap React Query that proactively
refreshes on page load (`apps/backoffice-web/src/hooks/useAuth.tsx:37-60`). It still shares
bug #1 (short TTL) and the same rotate-and-revoke-on-refresh design, so it is not immune to a
multi-tab refresh race, just far less exposed to it than POS.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| POS cashier, idle at checkout between customers | Access token expires after 15 min; the next navigation hard-redirects to `/dang-nhap`, refresh never attempted | Session survives a normal shift's worth of idling; an expired-but-refreshable session is silently restored, no forced re-login |
| POS cashier issuing requests that hit both HTTP clients close together | Two independent refresh attempts can race; the loser gets logged out even though the session is still valid | Exactly one refresh is in flight at a time app-wide; both clients share its result |
| Ops engineer retuning session length | Must edit `auth.service.ts` and redeploy the API to change TTLs; `.env.example`'s documented vars are silently ignored | Can retune access/refresh TTL per environment via env var, no code change |
| Backoffice-web user | Already tolerant of the short access-token TTL via bootstrap-refresh, but still on a 15-min token | Longer-lived access token (1 day) means far fewer refresh round-trips and races day-to-day |

## Success signal

A POS cashier working a normal shift is not forced to re-login due to token expiry alone, as
long as their refresh token (30 days) is still valid. Verified by:
- Backend unit tests proving a freshly issued (and freshly rotated) access token's
  `exp - iat` equals the configured `JWT_ACCESS_TTL` (default 86400s / 1 day) and refresh
  token's equals `JWT_REFRESH_TTL` (default 2,592,000s / 30 days), and that an env override
  is honored.
- A frontend test proving that, given an expired access token and a still-valid refresh
  token, the POS app performs exactly one silent refresh before rendering the route tree —
  no redirect to `/dang-nhap` — while the existing no-valid-refresh-token case still falls
  through to today's login redirect unchanged.
- A frontend test proving that two concurrent 401s across `http.ts` and `api-axios.ts`
  produce exactly one `POST /auth/refresh` call, with both original requests retried
  successfully off its result.

## Out of scope

- Changing `/auth/refresh`'s rotation semantics — it still rotates and revokes the previous
  `jti` on every call; that mechanism already works and isn't the bug.
- The 401 error-code taxonomy (expired vs malformed vs revoked-session) — owned by the
  separate, already-in-flight `.ai/features/auth-token-auto-refresh/`; not duplicated here.
  `api-axios.ts`'s existing `AuthErrorCode.TOKEN_EXPIRED` branch and its "AC-05 regression
  guard" comment are preserved as-is.
- Fixing pos-web's localStorage-for-both-tokens vs backoffice-web's memory-for-access-token
  divergence — pre-existing, already called out as out-of-scope by
  `auth-token-auto-refresh/00-intent.md`; changing token storage location is a bigger,
  security-relevant change this feature doesn't attempt.
- Migrating pos-web's 14 `http.ts`-backed services onto the axios client, or any other
  transport-layer consolidation — only the duplicated *refresh coordination* is unified, not
  the two transports themselves.
- Cross-tab coordination for backoffice-web (e.g. `BroadcastChannel` so two open tabs share
  one refresh) — a real, pre-existing race, but lower-frequency at a 1-day access-token TTL
  and not requested.
- A server-side idle/absolute session timeout policy independent of token TTL — not
  requested; this feature only changes TTL values and fixes the two refresh-bypass bugs.

## Constraints

| Kind | Detail |
|---|---|
| Security | Access-token lifetime bounds the exposure window if a token is exfiltrated (XSS, etc.) — more consequential for pos-web, which stores the access token in `localStorage` rather than memory. Raising it 15min→1day is the user's explicit ask; recorded as a deliberate trade-off (ADR), not a silent change. |
| Compatibility | Existing interceptor behavior (single-flight coalescing, `__isRetry`/`_retry` loop guards, terminal clear-session-and-redirect, the `AuthErrorCode.TOKEN_EXPIRED` branch and its regression-guard comment in `api-axios.ts`) must not regress. |
| Compatibility | `POST /auth/refresh`, `/auth/login`, `/auth/switch-branch` request/response shapes are unchanged — only the TTL values and where the frontend calls refresh from change. |
| Compatibility | `PosSessionHandoff`'s existing `?handoff=` code-exchange behavior (used by the "Bán hàng" handoff button from the ERP) must keep working unchanged. |
| Convention | New env-driven config follows the existing `ConfigService.get` pattern already used for `JWT_SECRET`/`JWT_REFRESH_SECRET` (`auth.service.ts:58-62`). |
| Test infra | No React component-rendering test tooling (`@testing-library/react`, jsdom environment) exists anywhere in pos-web today — all existing frontend tests (`api-axios.test.ts`, `dateTime.test.ts`) are plain-function/module tests run under vitest's default node environment. New tests for this feature follow that same style rather than introducing new test infrastructure. |

## Existing surface touched

- Backend: `apps/api/src/modules/auth/auth.service.ts` (TTL constants → `ConfigService`-backed,
  used by `signAccessToken`, `signRefreshToken`, `refresh()`, `switchBranch()`,
  `exchangeHandoffCode()`, and the `SessionStore.createSession` `ttlSeconds` argument),
  `apps/api/src/modules/auth/auth.service.spec.ts` (existing test file, extended),
  `apps/api/.env.example` (default values updated to match).
- Frontend (pos-web): `apps/pos-web/src/lib/common/http.ts`,
  `apps/pos-web/src/lib/common/api-axios.ts` (both lose their local
  `tryRefreshToken`/`refreshOnce`, gain a shared one),
  `apps/pos-web/src/components/common/PosSessionHandoff/PosSessionHandoff.tsx` (gains a
  proactive silent-refresh check alongside its existing handoff-code check).
- Not touched: `apps/pos-web/src/components/common/PosRequireAuth/PosRequireAuth.tsx` stays
  synchronous and unchanged (see ADR-02 in `03-logical-design.md`); backoffice-web is not
  touched (no equivalent bug there beyond the shared TTL bump, which is backend-only).
- Adjacent/reused: `POST /auth/refresh` endpoint (consumed, not modified),
  `apps/pos-web/src/constants/common.constant.ts` (token storage keys, unchanged).
