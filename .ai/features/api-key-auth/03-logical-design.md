---
feature: api-key-auth
adr_count: 4
---

# Logical design — api-key-auth

## Approach

Extend the single existing global guard, `AuthGuard` (`common/guards/auth.guard.ts`,
registered once as `APP_GUARD` in `common.module.ts`), to accept **either** a valid JWT
Bearer token **or** a valid `X-Api-Key` header, in that precedence order. If a request
carries `Authorization: Bearer ...`, the existing JWT path runs unchanged. Otherwise, if it
carries `X-Api-Key`, a new `ApiKeyAuthService.validate(rawKey, clientIp)` (new module
`modules/api-key/`) resolves it to an actor; if neither is present, the guard rejects with
401 exactly as it does today. `@Public()` endpoints are untouched — the guard still returns
`true` immediately for them, before either credential path runs.

A new org-scoped `ApiKeyEntity` (`api_keys` table) holds one row per named key: a hash of
the secret (never the plaintext), a non-secret prefix for display, the org roles it was
created with, an optional branch subset, its IP whitelist (individual IPv4s and/or CIDR
ranges) — and, corrected post-G2-reopen (see ADR-04), a `userId` pointing at a real,
never-loginable **shadow user** row. It is registered with the generic CRUD platform
(`EntityRegistryService`, `ScopingPolicy.ORGANIZATION`, `deletionPolicy: SOFT`) so
create/list/revoke get a backoffice screen for free, the same way
`ProviderEntity`/`SupplierGroupEntity` do — with one override: `create()` returns the raw
secret value alongside the saved entity, exactly once, since it is never persisted or
retrievable again afterward. Creating a key also creates its shadow user + `user_roles`
rows (transactionally); revoking a key deactivates the shadow user too.

**Why a shadow user (ADR-04):** `RbacService`/`PermissionGuard` resolve permissions with a
DB lookup keyed on `userId` — they never read `roles` off `request.user`. The only way for
an API-key request to pass any `@RequirePermission`-gated endpoint, `PermissionGuard`
included, unmodified, is for `request.user.userId` to be a real row in `user_roles`. The
key's own `roles` column now means "which org roles to assign the shadow user with," not
"what request.user.roles gets set to" — that field is no longer load-bearing for
authorization, only useful for display/audit.

`ApiKeyAuthService.validate()` caches the **key record itself** (hash → `{id,
organizationId, roles, branchIds, ipWhitelist}`) in Redis via the existing
`CacheService.getOrSet` pattern, TTL default 60s, so a burst of calls from the same
integration costs one DB row fetch, not one per request. IP-whitelist and branch checks run
in-process against that cached record on every call — they are never themselves cached — so
whitelist edits and revocations become visible within one TTL window through a single
invalidation path (any create/update/delete of an `ApiKeyEntity` row invalidates its cache
entry).

Client IP resolution depends on production sitting behind a reverse proxy/load balancer
(confirmed, A-01): `main.ts` gains `app.set('trust proxy', N)` (`N` from env
`TRUST_PROXY_HOPS`, default `1`), and the guard reads Express's `request.ip` — which Express
itself derives from `X-Forwarded-For` once trust proxy is configured — rather than parsing
the header by hand.

## Alternatives rejected

| Option | Why not |
|---|---|
| A dedicated `ApiKeyGuard` applied per-controller via a decorator (`@RequireApiKey()`) | Reintroduces exactly the "forgot to apply the guard → silent bypass" failure mode this feature exists to close (G0 Problem). A single always-on global guard means no controller can opt out by omission. |
| A second `APP_GUARD` running alongside `AuthGuard` | NestJS runs every `APP_GUARD` in registration order; a second guard would have to know whether `AuthGuard` already authenticated the request via JWT to avoid conflicting verdicts, splitting one concern across two classes for no benefit. |
| Storing the raw API key in plaintext | Same reasoning as password storage — trivial to avoid by storing a hash and comparing hashes, at effectively no extra cost. |
| Hand-parsing `X-Forwarded-For` in application code | Express's `trust proxy` + `req.ip` is the standard, tested mechanism for exactly this; reimplementing it risks trusting the wrong hop and being spoofable by the caller. |
| Caching the full authorization verdict per `(key, callerIp)` pair | Doubles the invalidation surface — a whitelist edit would need its own cache-busting path in addition to revoke. Caching the key **record** and checking IP in-process gets the same "no DB hit per repeat call" win with one invalidation path, not two. |
| Per-key fine-grained permission scopes (beyond a `roles` list) | Rejected at G0 — the chosen model is "named keys + admin UI", not "scoped keys". |
| Precomputed `request.user.permissions`, with `PermissionGuard`/`CrudPermissionGuard` checking it before falling back to the DB (ADR-04 alternative) | Verified against the real `RbacService`/`PermissionGuard` source after G2 first passed: `hasPermission`/`hasAnyPermission` always resolve from `user_roles` by `userId`, never from anything on `request.user`. This option would have made that true, but by editing two guards every other auth path also runs through — a wider blast radius than giving the API-key path its own real `userId`. |

## Domain model

| Entity | Fields | Notes |
|---|---|---|
| `ApiKeyEntity` (`api_keys`) | `id` (uuid), `organizationId`, `userId` (uuid, FK → shadow `users.id`), `name`, `keyPrefix`, `keyHash`, `roles: text[]` (real `roles.id` values, used only to populate `user_roles` at create/update time), `branchIds: text[] \| null` (null = all org branches), `ipWhitelist: jsonb` (array of IPv4 / CIDR strings), `createdAt`, `updatedAt`, `deletedAt` (soft-delete = revoke) | Org-scoped; registered via `EntityRegistryService` like `ProviderEntity` |
| Shadow `UserEntity` row (existing `users` table, not a new entity) | One per key, created *before* the key row (so no `apiKeyId` exists yet to key off): synthetic unique `email` (`api-key+<randomUUID>@internal.local`), `password_hash` of a random value that is generated, hashed, and discarded (never stored, never loggable), `isActive: false` | `is_active` blocks normal `/auth/login` even if the discarded password were somehow known; `resolvePermissions()` doesn't join `users` at all, so `is_active: false` does not block RBAC resolution for the API-key path |
| `ApiKeyActor` (in-memory only, not persisted) | `apiKeyId`, `organizationId`, `userId` (the shadow user — load-bearing for authorization), `branchIds` (fully resolved — all org branch ids substituted in when the key has no restriction) | Returned by `ApiKeyAuthService.validate()`; mapped by the guard into `request.user` in the same shape `Actor()` already reads from a JWT payload. `roles` dropped from this type — no longer meaningful downstream of the guard |

## Contracts

### Guard behaviour (no new route — `AuthGuard.canActivate`)
- `@Public()` handler/class → `true`, unchanged.
- `Authorization: Bearer <jwt>` present → existing JWT path, unchanged.
- Else, `X-Api-Key: <key>` present → `ApiKeyAuthService.validate(key, request.ip)`:
  - No matching active key → 401 `UnauthorizedException`.
  - Matching key, caller IP not in `ipWhitelist` → 403 `ForbiddenException`.
  - Matching key, IP OK, `X-Branch-Id` not in the key's `branchIds` → 403, reusing the
    existing `@RequireBranchScope` failure path.
  - Otherwise → `request.user = { userId: <shadow user id>, organizationId,
    branchId: <resolved from X-Branch-Id + branchIds, same rule Actor() already applies>,
    branchIds }` — a real `userId`, so `PermissionGuard`/`CrudPermissionGuard` resolve
    permissions exactly as they do for a JWT request, unmodified (ADR-04).
- Neither credential present → 401, unchanged.

### Admin CRUD (`entityKey: "api-keys"`, generic platform)
- `POST /admin/entities/api-keys/records` — validates `roles` are real `roles.id` values
  belonging to this org; in one transaction, creates the shadow user, its `user_roles` rows,
  and the `ApiKeyEntity` row (`userId` set to the shadow user). **Response includes the raw
  secret exactly once** (`ApiKeyCrudService` overrides `create()` to attach it — see
  ADR-01/ADR-02 for why this fits the existing hook rather than a bespoke controller).
- `GET .../records`, `GET .../records/:id` — never include the raw secret, only `keyPrefix`.
- `PATCH .../records/:id` — edit name / roles / `branchIds` / `ipWhitelist`. Triggers cache
  invalidation for that key's hash (`afterUpdate` hook); when `roles` changed, also
  reconciles the shadow user's `user_roles` rows and calls
  `RbacService.invalidateUserPermissions(shadowUserId, orgId)` — a second cache (RBAC's own,
  separate from `ApiKeyAuthService`'s) that a roles edit would otherwise leave stale for up
  to its own TTL.
- `DELETE .../records/:id` — soft-delete the key (revoke) and set the shadow user's
  `isActive: false`; triggers the same `ApiKeyAuthService` cache invalidation
  (`afterDelete` hook) — this alone is what actually blocks further use, since the guard
  never reaches `PermissionGuard` for a key that fails lookup.
- Gated by `api-key.read` / `api-key.create` / `api-key.update` / `api-key.delete`, matching
  the `resource.action` convention elsewhere in `rbac` (confirmed against the live
  permission catalog, e.g. `accounting.deposit_account.*`).
- `main.ts` Swagger config gains an `addApiKey({ name: 'X-Api-Key', in: 'header' }, ...)`
  entry alongside the existing `X-Branch-Id` / `X-Request-Id` / `X-Idempotency-Key` ones.

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| API key record (hash, roles, branch scope, whitelist) | Postgres `api_keys` | Until revoked (soft-delete) |
| Shadow user + `user_roles` | Postgres `users` / `user_roles` | Created with the key; `users.is_active` set false on revoke (not deleted — matches soft-delete elsewhere) |
| Cached key record | Redis, `CacheService` namespace `api-key`, keyed by `sha256(rawKey)` | TTL 60s (env-configurable), invalidated on any create/update/delete of the row |
| Cached RBAC permission set for the shadow user | Redis, `RbacService`'s own `rbac` namespace, keyed by `perms:<shadowUserId>:<orgId>` | TTL 300s (existing RBAC default, unrelated to this feature's own TTL); invalidated on a `roles` edit via `PATCH` |
| Per-request actor (`request.user`) | `AuthGuard`, set once | Single request only, never persisted |

## Error taxonomy

| Condition | Failure | Notes |
|---|---|---|
| No `Authorization` and no `X-Api-Key`, endpoint not `@Public()` | 401 `UnauthorizedException` | Unchanged from today |
| `X-Api-Key` present, no matching active key | 401 `UnauthorizedException` | AC-06 — indistinguishable from "no credential" by design; do not leak whether a key ever existed |
| `X-Api-Key` matches a revoked key | 401 `UnauthorizedException` | AC-07 |
| `X-Api-Key` valid, caller IP not in whitelist | 403 `ForbiddenException` | AC-04 — deliberately a different status than the 401s above, so an integrator can tell "wrong key" from "right key, wrong network" |
| `X-Api-Key` valid, IP OK, `X-Branch-Id` outside the key's `branchIds` | 403 `ForbiddenException` | Reuses the existing branch-scope failure path |
| Both `Authorization: Bearer` and `X-Api-Key` present | JWT path wins, evaluated first | Avoids ambiguity about which credential governs; matches the guard's existing check order |

## Cache & performance

See Approach/ADR-02. Cache namespace `api-key`, key = `sha256(rawKey)` hex, value = the
resolved `ApiKeyActor` plus `ipWhitelist`, TTL `API_KEY_CACHE_TTL_SECONDS` (default `60`).
Any mutation to an `ApiKeyEntity` row (create is a no-op for cache since nothing was cached
yet; update and delete both apply) calls `CacheService.invalidate('api-key', hash)`.

## Observability

- Request logs (existing `LoggingInterceptor`) gain one field: `authMethod: 'jwt' |
  'api-key'`, and for `api-key`, the `apiKeyId` (never the raw key or its hash).
- 403s from IP-whitelist and branch-scope rejections are logged at `warn` — these are the
  signal an admin needs when a partner reports "it stopped working" after a network change.

## ADRs

### ADR-01 — One global guard authenticates both JWT and API key
**Context:** G0 named `@Public()` as today's only bypass mechanism and flagged the risk of
a second, separately-applied guard being "forgotten" on some controller — exactly what the
chosen answer ("existing endpoints, JWT-or-key") is meant to avoid.
**Decision:** Extend `AuthGuard.canActivate` itself to accept either credential, rather than
adding a second `APP_GUARD` or a per-controller decorator.
**Consequences:** `AuthGuard`'s test surface grows (two credential paths instead of one),
but no controller — present or future — can omit third-party auth by omission. This is the
central guarantee the feature exists to provide.
**Status:** accepted

### ADR-02 — Cache the key record, not the authorization verdict
**Context:** The success signal requires repeat calls with the same key to skip a DB
lookup, while whitelist/branch edits and revocations must take effect quickly and through
one code path.
**Decision:** `CacheService` caches the active key's full record (roles, branch scope, IP
whitelist) keyed by its hash. IP and branch checks always run in-process against that
record — they are never cached as a separate `(key, IP)` verdict.
**Consequences:** One invalidation call (on create/update/delete of the row) keeps every
derived check fresh within one TTL window; a second cache would have needed its own
busting logic for whitelist edits specifically.
**Status:** accepted

### ADR-03 — Client IP via Express `trust proxy` + `req.ip`
**Context:** A-01 (confirmed): production sits behind a reverse proxy/load balancer, and
`main.ts` has no `trust proxy` configuration today — `req.ip` currently reflects the proxy
hop, not the caller, which would make IP whitelisting either always-wrong or spoofable.
**Decision:** Configure `app.set('trust proxy', N)` (`N` from env `TRUST_PROXY_HOPS`,
default `1`) and read the client IP from Express's `request.ip`, rather than parsing
`X-Forwarded-For` by hand in application code.
**Consequences:** Every route gets a correct `req.ip`, not just the API-key path — a small
positive side effect for logging elsewhere. Getting `TRUST_PROXY_HOPS` wrong at deploy time
silently mis-trusts forwarded headers; this is an infra fact the repo cannot verify, so it
is called out as a deployment checklist item rather than solved in code.
**Status:** accepted

### ADR-04 — API keys authorize through a real shadow user, not through `request.user.roles`
**Context:** ADR-01 originally claimed reusing the `roles` vocabulary meant `PermissionGuard`
needed zero changes. That was never actually checked against `RbacService`'s source: G2
reopened after construction proved it false — `resolvePermissions(userId, orgId)` always
queries `user_roles` by `userId`; nothing in `PermissionGuard` or `CrudPermissionGuard` ever
reads `request.user.roles`. A synthetic `userId` (`"api-key:" + apiKeyId`) has no
`user_roles` row, so every permission-gated endpoint — nearly the whole system — rejected
every API-key request with 403, regardless of the key's configured roles.
**Decision:** Creating an API key also creates a real, never-loginable **shadow user**
(`users` row with `isActive: false` and a discarded random password) plus `user_roles` rows
for the roles chosen at creation. `AuthGuard`'s API-key branch sets
`request.user.userId` to that shadow user's real id. `PermissionGuard`/`CrudPermissionGuard`/
`RbacService` are not touched at all — the original ADR-01 claim is now actually true,
rather than merely asserted.
**Rejected alternative:** giving `PermissionGuard`/`CrudPermissionGuard` an early-exit that
trusts a precomputed `request.user.permissions` array when present. Smaller schema footprint
(no shadow user), but edits the two guards every other authentication path — JWT included —
also runs through, for a feature-specific need. The shadow user keeps the blast radius
inside `modules/api-key/`.
**Consequences:** Key creation/update/revoke now touches `users`/`user_roles` in the same
transaction as `api_keys` — more moving parts per mutation, and a second cache
(`RbacService`'s own RBAC cache, TTL 300s) that a `roles` edit must now also invalidate
alongside this feature's own `api-key` cache. In exchange, authorization for an API-key
request is byte-for-byte the same code path a JWT request already takes, so there is
exactly one implementation of "what can this permission set do" in the whole codebase, not
two that must be kept in sync.
**Status:** accepted
