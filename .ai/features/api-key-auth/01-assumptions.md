---
feature: api-key-auth
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | API is deployed behind a reverse proxy/load balancer in production; the real client IP arrives in `X-Forwarded-For`, not the raw socket address | high | yes | IP whitelist enforcement is either always-wrong (compares against the proxy's IP) or trivially spoofable — the entire feature is broken or insecure in prod | confirmed | Confirmed by Akenzy, 2026-08-19 — API sits behind a proxy/LB in prod. Guard reads client IP from `X-Forwarded-For` (leftmost trusted hop); `main.ts` needs `app.set('trust proxy', N)` with `N` matched to the real hop count at deploy time (env-configurable, default 1) |
| A-02 | Each API key carries its own `roles: string[]` (same vocabulary as user JWT roles), chosen by the admin at creation; the guard populates `request.user.roles` from the key identically to how JWT populates it today, so `PermissionGuard` needs no change | medium | no | `api_keys` entity schema + admin CRUD form shape; contained to the guard + admin UoWs, nothing built yet to rework | pending | — |
| A-03 | The raw API key value is shown once at creation and never stored in plaintext; the DB stores a hash (verification re-hashes the presented key and compares) plus a short non-secret prefix for identifying the key in the admin list | high | no | Storage/verification code shape in the guard + key-creation ticket | pending | — |
| A-04 | IP whitelist entries accept both single IPv4 addresses and CIDR ranges (e.g. `203.0.113.5`, `203.0.113.0/28`); IPv6 is out of scope for this feature | medium | no | Validation + matching logic in the guard and the create/edit DTO | pending | — |
| A-05 | Keys do not expire automatically and are not auto-rotated in this feature; a key is valid until an admin explicitly revokes it (soft-delete) | high | no | Scope only — no expiry/rotation UoW planned | pending | — |
| A-06 | The API key credential travels in a new header, `X-Api-Key`, alongside the existing `X-Branch-Id` / `X-Request-Id` / `X-Idempotency-Key` convention | high | no | Header name is a one-line change if wrong; low cost either way | pending | — |
| A-07 | Key + IP validation results are cached in Redis with a short TTL (proposed 60s) via the existing `CacheService.getOrSet` pattern; revoking a key also calls `CacheService.invalidate` so revocation is not stuck behind the TTL | medium | no | Perceived revocation latency if TTL is too long; contained to the guard's caching ticket | pending | — |
| A-08 | An API-key-authenticated request still supplies `X-Branch-Id` like a JWT request does; each key optionally scopes to a subset of the org's branches (null = all branches), and the guard validates `X-Branch-Id` against that list the same way it validates JWT `branchIds` today | medium | no | Behaviour of `@RequireBranchScope` endpoints for third-party calls; `api_keys` schema (branch-scope column) | pending | — |

## Rejected assumptions

None yet — nothing proposed in Phase 0/1 has been rejected by a human so far.
