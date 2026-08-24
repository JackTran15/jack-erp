---
id: UOW-01
slug: configurable-session-ttl
title: Access/refresh token TTLs default to 1d/30d and are configurable via env
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03]
risk: low
status: todo
rollback: revert auth.service.ts's two ConfigService.get calls back to the hardcoded
  ACCESS_TOKEN_TTL/REFRESH_TOKEN_TTL constants — a single-file, single-commit revert
---

# UOW-01 — Access/refresh token TTLs default to 1d/30d and are configurable via env

## Demo script
1. Confirm `apps/api/.env` has no `JWT_ACCESS_TTL`/`JWT_REFRESH_TTL` lines (or comment them
   out), restart the API.
2. Log in via POS (or backoffice), capture the returned `accessToken`/`refreshToken`, decode
   both (jwt.io or a one-liner), show `exp - iat` = 86400 for the access token and
   2,592,000 for the refresh token.
3. Set `JWT_ACCESS_TTL=1800` in `apps/api/.env`, restart, log in again — show the access
   token's `exp - iat` = 1800, confirming the override is honored.
4. Call `POST /auth/refresh` with the still-valid refresh token — show the newly issued
   tokens carry the same configured TTLs (not a fresh 86400/2,592,000).

## In scope
- `AuthService`'s TTL source: hardcoded module constants → `ConfigService`-backed instance
  fields, defaulting to 86400/2,592,000.
- Updating `.env.example`'s documented default values to match.
- Updating this checkout's own `apps/api/.env` so local dev/verification actually reflects
  the new defaults (per assumption A-02 — the old explicit values there would otherwise
  silently shadow the new code default).

## Not in scope
- Any frontend change (UOW-02, UOW-03).
- `/auth/refresh`'s rotation logic itself (still rotates + revokes the previous `jti`).
- Retuning any already-provisioned staging/prod environment's `.env` — that's a deployment
  step outside this PR's diff (those files aren't in version control).

## Risks
| Risk | Mitigation |
|---|---|
| Any environment that already sets `JWT_ACCESS_TTL`/`JWT_REFRESH_TTL` explicitly (confirmed true for this checkout's `apps/api/.env`, and plausibly true for staging/prod, seeded from the same `.env.example`) will keep the old 15min/7day values until that environment's `.env` is separately updated — the code default alone does not override an explicit value (A-02) | T-01-01's demo script explicitly starts from a clean `.env` state to prove the *default*, then separately proves the *override*; ticket note calls out that shipping this PR requires a follow-up manual env update on any environment that already sets these vars |
| 16 call sites reference the two module constants across 4 methods — missing one leaves a mixed-TTL bug | T-01-01's done-when requires every occurrence found by `grep -n "ACCESS_TOKEN_TTL\|REFRESH_TOKEN_TTL"` to be accounted for; T-01-02's tests cover all 4 methods (`login`, `refresh`, `switchBranch`, `exchangeHandoffCode`), not just `login` |

## Definition of done
- [ ] AC-01, AC-02, AC-03 all pass
- [ ] `grep -n "15 \* 60\|7 \* 24 \* 60 \* 60"` in `auth.service.ts` returns nothing (no
      leftover hardcoded TTL)
- [ ] Demoed and accepted at gate G4
