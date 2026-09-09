---
feature: api-key-auth
stories: 6
acceptance_criteria: 12
---

# Requirements — api-key-auth

## US-01 — Third party authenticates with an API key instead of a JWT

As a third-party integration, I want to call an existing jack-erp API endpoint using an
API key, so that I don't need a user account or JWT to integrate.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Happy path
```gherkin
Given an organization has an active API key with IP whitelist containing the caller's IP
And the endpoint is not marked @Public()
When the caller sends a request with a valid X-Api-Key header (no Authorization header)
   and a valid X-Branch-Id for that key's organization
Then the request is authorized exactly as a valid JWT request would be
And request.user is populated with the key's organizationId, roles and allowed branches
```

**AC-02** — No credential at all
```gherkin
Given an endpoint is not marked @Public()
When the caller sends a request with neither an Authorization header nor X-Api-Key
Then the request is rejected with 401, same as today's JWT-missing behaviour
```

**AC-03** — @Public() endpoints unaffected (regression guard)
```gherkin
Given an endpoint is marked @Public() (e.g. metrics, auth login)
When the caller sends a request with no Authorization header and no X-Api-Key
Then the request is allowed through, exactly as it is today
```

## US-02 — IP whitelist enforcement

As an org admin, I want calls that present a valid key from a non-whitelisted IP to be
rejected, so a leaked key alone doesn't grant access from anywhere.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-04** — IP not in whitelist
```gherkin
Given an organization has an active API key whose IP whitelist does not include the caller's IP
When the caller sends a request with that key's X-Api-Key header
Then the request is rejected with 403
And the failure is distinguishable (response/log) from the 401 used for missing/invalid credentials
```

**AC-05** — CIDR range match
```gherkin
Given a key's whitelist contains a CIDR range (e.g. 203.0.113.0/28)
When the caller's IP falls inside that range
Then the request is authorized
```

## US-03 — Invalid or revoked key is rejected

As an org admin, I want a wrong or revoked key to be rejected immediately, so a leaked or
retired key can't be used to reach the API.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-06** — Unknown key
```gherkin
Given no API key in the system matches the presented value
When the caller sends a request with that value as X-Api-Key
Then the request is rejected with 401
```

**AC-07** — Revoked key
```gherkin
Given an API key was valid and is then revoked by an admin
When the caller sends a request with that key within one cache TTL window of the revocation
Then the request is rejected with 401
And no request after the revocation is authorized using a stale cached "valid" result
```

## US-04 — Admin creates a named API key with an IP whitelist

As an org admin (backoffice), I want to create a named API key scoped to my organization
with its own IP whitelist, so I can hand a unique credential to each integration partner.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-08** — Secret shown once
```gherkin
Given I am an org admin creating a new API key in the backoffice
When the key is created
Then the response/UI shows the raw secret value exactly once
And every subsequent read of that key (list, detail) shows only a non-secret identifying prefix
```

**AC-09** — Org isolation
```gherkin
Given org A has an active API key
When a caller presents org A's key against any endpoint
Then request.user.organizationId is always org A's id
And no data belonging to another organization is reachable through that key
```

## US-05 — Admin revokes a key

As an org admin, I want to revoke a key so a compromised or retired integration stops
working without deleting audit history.

**Priority:** must
**Depends on:** US-04

### Acceptance criteria

**AC-10** — Revoke stops access, keeps history
```gherkin
Given an org admin revokes (soft-deletes) an API key
When any caller subsequently presents that key
Then every request is rejected (see AC-07)
And the key's row/audit trail is not hard-deleted
```

## US-06 — Key/IP validation doesn't spam the backend

As a backend operator, I want repeated calls with the same key to skip a DB lookup, so
third-party polling traffic doesn't add avoidable load.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-11** — Cache hit avoids a DB roundtrip
```gherkin
Given a valid API key + IP combination was just validated
When a second request with the same key and IP arrives within the cache TTL
Then the second request's key/IP check is served from cache
And no additional database query for key validation is issued
```

**AC-12** — Revoke invalidates the cache immediately
```gherkin
Given a key's validation result is currently cached as valid
When an admin revokes that key
Then the cache entry for that key is invalidated as part of the revoke operation
And the next request is rejected rather than served a stale cached "valid" result
```

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Security | Raw key value is never logged (LoggingInterceptor, error logs) after creation; only the hash and non-secret prefix are persisted | T-TBD (guard + storage tickets, cut at G3) |
| Performance | Repeated calls with the same key/IP within the cache TTL issue exactly one DB lookup | AC-11 |
| Consistency | A single global guard authenticates both JWT and API-key requests — no controller opts in separately | AC-01, AC-02, AC-03 |
| Tenancy | An API key never resolves to a different organization than the one it was issued for | AC-09 |
