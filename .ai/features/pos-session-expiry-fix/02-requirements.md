---
feature: pos-session-expiry-fix
stories: 3
acceptance_criteria: 8
---

# Requirements — pos-session-expiry-fix

## US-01 — Session tokens last a full shift, and are configurable

As an ops engineer, I want the access token to last 1 day and the refresh token to last
30 days by default, both retunable per environment via env var, so that a normal shift
doesn't require re-authentication due to token expiry alone.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Default TTLs apply
```gherkin
Given JWT_ACCESS_TTL and JWT_REFRESH_TTL are unset in the API's environment
When a user logs in
Then the issued access token's `exp - iat` equals 86400 (1 day)
And the issued refresh token's `exp - iat` equals 2592000 (30 days)
```

**AC-02** — Env override is honored
```gherkin
Given JWT_ACCESS_TTL=1800 is set in the API's environment
When a user logs in
Then the issued access token's `exp - iat` equals 1800, not the 86400 default
```

**AC-03** — Rotation preserves the configured TTL
```gherkin
Given a valid refresh token, and JWT_ACCESS_TTL/JWT_REFRESH_TTL configured to non-default
  values
When POST /auth/refresh is called
Then the newly issued access and refresh tokens both carry the same configured TTLs as a
  fresh login would
```

## US-02 — POS silently restores an expired-but-refreshable session

As a POS cashier, when my access token has expired but my refresh token is still valid, I
want the app to silently refresh my session instead of forcing me back to the login screen,
so idling between customers doesn't cost me a re-login.

**Priority:** must
**Depends on:** US-03 (needs the shared, single-flight refresh call from UOW-02)

### Acceptance criteria

**AC-04** — Silent restore on stale-but-refreshable session
```gherkin
Given a valid (unexpired) refresh token and an expired access token in localStorage
When the POS app loads, or the user navigates
Then a silent refresh is attempted before any redirect to /dang-nhap
And on success the user lands on their originally requested page, still authenticated
And no more than one POST /auth/refresh call fires for this restore
```

**AC-05** — No regression when refresh cannot help (non-negotiable guard)
```gherkin
Given the refresh token is itself invalid, expired, or absent
When the same scenario occurs
Then the user still falls through to /dang-nhap exactly as today
```

**AC-06** — Handoff flow still takes priority
```gherkin
Given the POS app loads with a `?handoff=` code param (the "Bán hàng" handoff from ERP)
When PosSessionHandoff runs
Then the handoff code exchange still completes exactly as before, unaffected by the new
  proactive-refresh check
```

## US-03 — POS's two HTTP clients coordinate refresh instead of racing

As a POS cashier issuing requests that hit both of the app's HTTP clients close together, I
want at most one refresh call in flight at a time, shared by both clients, so that a losing
race never logs me out while my session is actually still valid.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-07** — Single in-flight refresh across both clients
```gherkin
Given a 401 arrives on a http.ts-backed request and a 401 arrives on an api-axios.ts-backed
  request at roughly the same time
When both trigger a refresh
Then exactly one POST /auth/refresh network call fires
And both original requests are retried successfully using its result
```

**AC-08** — Shared failure handling, no duplicate logout
```gherkin
Given that shared refresh call fails (refresh token invalid or revoked)
When both original callers observe the failure
Then both fall through to today's clear-tokens-and-redirect behavior exactly once — no
  duplicate redirects, no unhandled rejection
```

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Compatibility | `api-axios.ts`'s existing `AuthErrorCode.TOKEN_EXPIRED` branch and its "AC-05 regression guard" comment (from `auth-token-auto-refresh`) are preserved verbatim | T-02-03 |
| Compatibility | `PosRequireAuth.tsx` itself is not modified | T-03-01 |
