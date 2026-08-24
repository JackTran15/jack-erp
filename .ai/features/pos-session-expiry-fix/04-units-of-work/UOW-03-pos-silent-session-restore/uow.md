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
rollback: revert PosSessionHandoff.tsx to its prior version — single-file revert, no
  data/schema involved; PosRequireAuth.tsx is never touched so nothing else to unwind
---

# UOW-03 — POS silently restores an expired-but-refreshable session

## Demo script
1. Log into POS normally; note the localStorage `pos_access_token`/`pos_refresh_token`.
2. Make the access token appear expired while the refresh token stays valid (e.g. shorten
   `JWT_ACCESS_TTL` for this demo, or edit the token's `exp` claim in devtools).
3. Navigate to another POS page (e.g. click Invoices) — show: no redirect to
   `/dang-nhap`; exactly one `POST /auth/refresh` fires proactively; the cashier lands on
   Invoices, still authenticated.
4. Repeat with the refresh token also cleared — show the user correctly falls through to
   `/dang-nhap`, unchanged from today (AC-05 regression guard).
5. Load POS with a `?handoff=<code>` param — show the handoff exchange still completes
   exactly as before, unaffected by the new check (AC-06).

## In scope
- `PosSessionHandoff.tsx` gains a second, plain-function-testable bootstrap step: if no
  `?handoff=` code is present and `authService.isAuthenticated()` is false but a refresh
  token exists in storage, await the shared `refreshOnce()` (from UOW-02) before releasing
  the render gate.
- Doc-comment update reflecting `PosSessionHandoff`'s now-broader "session bootstrap" role
  (ADR-02).

## Not in scope
- `PosRequireAuth.tsx` — stays untouched and synchronous (ADR-02).
- Any change to the `?handoff=` exchange logic itself.
- backoffice-web — no equivalent bug there (bootstrap-refresh already covers this case).

## Risks
| Risk | Mitigation |
|---|---|
| Wiring the new check ahead of / alongside the existing handoff-code check could make a handoff-in-progress load also fire a proactive refresh, or vice versa race | New check runs only when no `?handoff=` code param is present at all — the two paths are mutually exclusive by construction, not by timing (AC-06) |
| No component-rendering test tooling exists (A-04) — full mount-and-navigate coverage isn't automatable without adding new dependencies | T-03-02 tests the extracted async bootstrap function directly (plain-function test, no DOM); full end-to-end wiring (AC-06 in particular) is verified via the G4 demo script instead of a unit test — stated explicitly, not silently under-covered |

## Definition of done
- [ ] AC-04, AC-05, AC-06 all pass
- [ ] `PosRequireAuth.tsx` has zero diff
- [ ] Demoed and accepted at gate G4
