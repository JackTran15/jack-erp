---
feature: auth-token-auto-refresh
stories: 3
acceptance_criteria: 8
---

# Requirements — auth-token-auto-refresh

## US-01 — Guard emits a distinct code per JWT failure subtype

As a backend/frontend integrator, I want `AuthGuard` to emit a distinct machine-readable code
for each of its JWT failure subtypes (access token expired, malformed/invalid token, revoked
session) instead of collapsing all three into one generic 401, so that a client can tell them
apart without guessing from the message string.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Expired access token yields the expiry code
```gherkin
Given a request carries an access token whose `exp` claim has passed, so `jwt.verify()` throws `TokenExpiredError`
When `AuthGuard.canActivate` evaluates the request
Then the response is 401 and its `code` identifies "access token expired", distinct from the malformed/invalid-token and revoked-session codes
```

**AC-02** — Malformed or invalid-signature token yields the invalid-token code
```gherkin
Given a request carries a token that is malformed or fails signature verification, so `jwt.verify()` throws `JsonWebTokenError` or `NotBeforeError`
When `AuthGuard.canActivate` evaluates the request
Then the response is 401 and its `code` identifies "invalid token", distinct from the expired and revoked-session codes
```

**AC-03** — Revoked or expired session yields the revoked-session code
```gherkin
Given a request carries a structurally valid, unexpired access token whose `jti` is no longer active in Redis (session revoked or logged out elsewhere)
When `AuthGuard.canActivate` evaluates the request
Then the response is 401 and its `code` identifies "session revoked", distinct from the expired and invalid-token codes
```

## US-02 — Access-token-expiry code drives silent refresh in both frontends

As a logged-in user of backoffice-web or pos-web, I want a request that fails only because my
access token expired to be silently retried after a token refresh — as it already appears to
work today — driven explicitly by the new code rather than by "any 401 at all", so behavior for
everything else stays exactly as it is today.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-04** — Access-token-expired code triggers the existing refresh-and-retry path
```gherkin
Given a backoffice-web or pos-web request receives a 401 whose code identifies "access token expired" (per AC-01)
When the app's response interceptor inspects the error
Then it invokes the existing single-flight refresh-and-retry path unchanged (the same coalescing-of-concurrent-401s and `__isRetry`/`_retry` guard already in place), and the original request is retried once with the new access token
```

**AC-05** — Unrecognized or uncoded 401s still fall back to attempting refresh (regression guard)
```gherkin
Given a 401 response carries no code, or a code the frontend's auth-taxonomy map does not recognize
When the app's response interceptor inspects the error
Then it falls back to today's behavior of attempting a refresh-and-retry — no behavior change for any 401 outside the new taxonomy
```

**AC-06** — A second 401 on an already-retried request still forces logout, unchanged
```gherkin
Given a request already marked as retried (post-refresh, `__isRetry`/`_retry` already true) receives another 401, regardless of its code
When the app's response interceptor inspects the error
Then it clears the session and redirects to login exactly as today — the new taxonomy introduces no second refresh attempt and does not alter this terminal path
```

## US-03 — Revoked-session responses are distinguishable end-to-end (non-functional / regression)

As a platform maintainer, I want a revoked-session 401 to be distinguishable from other 401s at
the response-shape level all the way to the frontend, so that a future pass can decide to skip
the wasted refresh attempt for this case without another backend change.

**Explicit scope choice:** this story requires only that the backend emits the distinguishable
"session revoked" code (already covered by AC-03) and that it survives unmodified through the
frontend's existing error-handling layers. It does **not** require either frontend to branch
its refresh-vs-logout decision on this code — that behavior change is explicitly deferred (see
`01-assumptions.md` A-03 and `00-intent.md` Out of scope). Today's refresh-then-fail path for a
revoked session is expected to keep running unchanged in this pass.

**Priority:** should
**Depends on:** US-01

### Acceptance criteria

**AC-07** — Revoked-session code survives to the frontend unaltered
```gherkin
Given the backend returns a 401 with the "session revoked" code (per AC-03)
When the frontend's error-handling layer (e.g. `apps/backoffice-web/src/lib/user-facing-api-error.ts`, and whatever pos-web's interceptor already threads the response body through) processes the response
Then the code value is preserved unchanged in the structure the layer already carries — no requirement to change displayed messages or refresh-vs-logout branching based on it in this pass
```

**AC-08** — No regression: today's refresh-then-fail behavior for revoked sessions is unchanged
```gherkin
Given a session has been revoked and the frontend's interceptor still attempts a refresh first (current behavior, unchanged in this pass)
When the refresh call itself is rejected by the backend (its session is gone too)
Then the frontend still falls through to its existing clear-session-and-redirect-to-login path, exactly as it does today
```
