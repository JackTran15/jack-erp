---
id: UOW-02
slug: pos-shared-refresh-coordination
title: pos-web's two HTTP clients share one in-flight refresh instead of racing
demoable: true
duration: 1d
depends_on: []
requirements: [US-03]
verifies: [AC-07, AC-08]
risk: medium
status: todo
rollback: revert http.ts and api-axios.ts to their own local tryRefreshToken/refreshOnce
  copies, delete token-refresh.ts — a 3-file revert, no data/schema involved
---

# UOW-02 — pos-web's two HTTP clients share one in-flight refresh instead of racing

## Demo script
1. Log into POS, open devtools Network tab.
2. Force the access token to appear expired to the backend (e.g. corrupt/expire it
   server-side, or simply wait past its TTL) while the refresh token is still valid.
3. Trigger a `http.ts`-backed request (e.g. open Invoices, which fetches via
   `inventory`/`invoice` services) and an `api-axios.ts`-backed request (e.g.
   switch branch) close together.
4. Show exactly one `POST /auth/refresh` fires in the Network tab, and both original
   requests succeed after retry.
5. Repeat with the refresh token cleared beforehand — show both callers fall through to
   the existing clear-tokens-and-redirect behavior exactly once (no duplicate redirect,
   no console error from an unhandled rejection).

## In scope
- New shared module holding the single `tryRefreshToken`/`refreshOnce` pair.
- `http.ts` and `api-axios.ts` both import and use it, deleting their own local copies.
- `api-axios.ts`'s existing `AuthErrorCode.TOKEN_EXPIRED` branch and its "AC-05 regression
  guard" comment (from `auth-token-auto-refresh`) carry over unchanged.

## Not in scope
- `PosSessionHandoff`'s proactive-refresh gate (UOW-03) — that's a *consumer* of this UoW's
  shared module, not part of it.
- Any change to `http.ts`'s or `api-axios.ts`'s request/response handling beyond swapping
  which `refreshOnce` they call.
- Merging the two transports (fetch vs axios) into one — ADR-03.

## Risks
| Risk | Mitigation |
|---|---|
| The two originals differ slightly on failure (`api-axios.ts`'s catch clears tokens; `http.ts`'s catch does not, only its `!res.ok` branch does) | T-02-01 picks one consistent behavior (clear on any failure) and documents the change explicitly, rather than silently picking one implementation's quirk |
| `api-axios.ts`'s `AuthErrorCode.TOKEN_EXPIRED` branch must survive the swap verbatim — it's a non-negotiable regression guard from a separate, already-shipped feature | T-02-03's done-when requires the existing `api-axios.test.ts` suite to still pass unmodified in addition to any new tests |

## Definition of done
- [ ] AC-07, AC-08 both pass
- [ ] `grep -n "refreshPromise"` returns exactly one declaration app-wide (in the new shared
      module), not one per client
- [ ] Demoed and accepted at gate G4
