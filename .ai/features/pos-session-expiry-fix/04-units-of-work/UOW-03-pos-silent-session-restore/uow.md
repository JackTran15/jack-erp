---
id: UOW-03
slug: pos-silent-session-restore
title: POS silently restores an expired-but-refreshable session instead of hard-redirecting
demoable: true
duration: 1d
depends_on: [UOW-02]
requirements: [US-02]
verifies: [AC-04, AC-05, AC-06]
risk: medium
status: todo
rollback: revert PosSessionHandoff.tsx and PosRequireAuth.tsx to their prior versions —
  two-file revert, no data/schema involved
---

# UOW-03 — POS silently restores an expired-but-refreshable session

## Demo script
1. Log into POS normally; note the localStorage `pos_access_token`/`pos_refresh_token`.
2. Make the access token appear expired while the refresh token stays valid (e.g. shorten
   `JWT_ACCESS_TTL` for this demo, or edit the token's `exp` claim in devtools).
3. Navigate to another POS page (e.g. click Invoices) — show: no redirect to
   `/dang-nhap`; exactly one `POST /auth/refresh` fires proactively; the cashier lands on
   Invoices, still authenticated.
4. **Without reloading the page**, clear only the access token from storage (leaving the
   refresh token valid) and click a nav link to a different route entirely — show the same
   silent-restore behavior on a pure client-side navigation, not just on page load. This is
   the scenario T-03-03 exists to cover (found live during G4 demoing; T-03-01 alone only
   covers app load, not navigation-while-open).
5. Repeat with the refresh token also cleared — show the user correctly falls through to
   `/dang-nhap`, unchanged from today (AC-05 regression guard).
6. Load POS with a `?handoff=<code>` param — show the handoff exchange still completes
   exactly as before, unaffected by the new check (AC-06).

## In scope
- `PosSessionHandoff.tsx` gains a second, plain-function-testable bootstrap step: if no
  `?handoff=` code is present and `authService.isAuthenticated()` is false but a refresh
  token exists in storage, await the shared `refreshOnce()` (from UOW-02) before releasing
  the render gate. Covers the app-load case.
- `PosRequireAuth.tsx` (T-03-03, added after reopening ADR-02 — see `03-logical-design.md`
  ADR-04) gains the same check-then-maybe-refresh behavior, run on every navigation, not
  just at mount. Covers the navigate-while-already-open case — the scenario actually
  described in the original bug report ("cashier idles at checkout, then clicks").
- Doc-comment updates reflecting both components' broader roles.

## Not in scope
- Any change to the `?handoff=` exchange logic itself.
- backoffice-web — no equivalent bug there (bootstrap-refresh already covers this case).

## Risks
| Risk | Mitigation |
|---|---|
| Wiring the new check ahead of / alongside the existing handoff-code check could make a handoff-in-progress load also fire a proactive refresh, or vice versa race | New check runs only when no `?handoff=` code param is present at all — the two paths are mutually exclusive by construction, not by timing (AC-06) |
| `PosRequireAuth` becoming stateful risks a race where it renders `<Navigate>` immediately on the very render where the token first shows expired, before the restore attempt has had a chance to run (React effects run after paint, not before) | T-03-03's design renders neither `<Outlet>` nor `<Navigate>` on that transitional render — only `null` — until the restore attempt has actually resolved; see the ticket's implementation notes for the exact state machine |
| No component-rendering test tooling exists (A-04) — full mount-and-navigate coverage isn't automatable without adding new dependencies | T-03-02 tests the extracted async bootstrap function directly (plain-function test, no DOM); full end-to-end wiring (AC-06, and now the navigation case) is verified via the G4 demo script instead of a unit test — stated explicitly, not silently under-covered. This is exactly how the navigation gap itself was found — the demo script is load-bearing, not decorative. |

## Definition of done
- [x] AC-04, AC-05 pass — confirmed by T-03-02 (3/3 `PosSessionHandoff.test.ts`) for the
      app-load path, and live in the browser (twice each, across two review-driven fix
      cycles) for the navigate-while-open path added by T-03-03: full reload with no tokens
      → clean redirect, not frozen; expired access token + valid refresh token, client-side
      nav with no reload → silent restore, destination page renders, no reload needed
- [x] AC-06 (handoff still takes priority end-to-end) — live-verified: minted a real
      handoff code via `POST /auth/handoff` against this checkout's own API, loaded POS at
      `/pos/?handoff=<code>`, the exchange completed and landed authenticated on the
      checkout page with both tokens present and the `?handoff=` param stripped from the
      URL — unaffected by the new proactive-refresh check
- [x] `git diff --stat` on `PosRequireAuth.tsx` is non-empty (T-03-03 intentionally changes
      it — this replaces the original "zero diff" requirement, retired by ADR-04)
- [x] Demoed and accepted at gate G4 — accepted by Akenzy
