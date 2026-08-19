---
feature: auth-token-auto-refresh
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | "Backend returns 4014003, access-token-expiry should auto-refresh" means: introduce a structured numeric error-code convention for auth failures backend-wide (replacing today's generic `HTTP_401`), so the frontend can react to token-expiry specifically instead of treating every 401 identically. The literal number `4014003` is illustrative of the shape (`<3-digit-http-status><4-digit-reason-code>`), not a code that already exists anywhere in the codebase. | high | yes | Wrong interpretation would misdirect the whole feature — e.g. building a single hardcoded check for the literal value `4014003` instead of a taxonomy, or worse, treating this as a bug in the already-working refresh flow rather than an observability/signal gap | confirmed | Confirmed by Akenzy via AI-DLC discovery Q&A, 2026-08-17 |
| A-02 | Proposed numeric taxonomy for the guard's three distinct failure branches — `4014001` = malformed/invalid signature (`JsonWebTokenError` / `NotBeforeError`), `4014002` = session revoked (Redis `jti` liveness check fails), `4014003` = access token expired (`TokenExpiredError`), `4014004` = refresh token invalid/expired (for symmetry with `/auth/refresh` failures, not strictly required by the guard itself) | medium | no | If renumbered later, any code (BE guard, FE interceptor branch, tests) written against these specific values needs a mechanical find-replace before G4 — contained, not structural, since it's an enum value swap, not a shape change | pending | — |
| A-03 | Unrecognized or legacy 401s (no code attached, or a code the frontend's taxonomy map doesn't recognize) should still fall back to today's behavior of always attempting a refresh, for backward compatibility with any 401 path not yet covered by the new taxonomy | high | no | If decided otherwise (e.g. treat unknown codes as non-refreshable), any 401 the guard doesn't yet code would silently stop retrying on refresh, which is a strictly worse UX regression versus today — low likelihood of being wrong given the stated recommendation, but the decision itself is deferred to G2 | pending | — |
