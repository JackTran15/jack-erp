---
feature: auth-token-auto-refresh
environments: [local-backoffice, local-pos]
viewports: [desktop]
---

# Verification — auth-token-auto-refresh

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Authenticated session loads normally post-login, no regression | `/` | — | AC-04, AC-05, AC-06 | — |

## Not verified here

This feature's acceptance criteria are almost entirely about HTTP response **bodies** (the
`code` field's exact value: `4014001`/`4014002`/`4014003`/`HTTP_401`) and interceptor **control
flow** (which branch runs, whether a second refresh is attempted) — neither is something a DOM
text assertion can meaningfully prove. `text=`/`no-text=`/`count` check visible page content,
not network request/response bodies or which code path executed.

- **AC-01, AC-02, AC-03** (the three distinct codes reach the JSON body) — proved by
  `apps/api/src/common/guards/auth.guard.spec.ts` (4/4 unit tests, one per failure subtype) and
  `apps/api/test/e2e/auth.e2e-spec.ts` (20/20 e2e, real HTTP round-trips asserting the exact
  `code` value per scenario — this is strictly stronger evidence than a screenshot could be for
  a JSON field).
  The silent-refresh, fallback, and second-401 stories (see S1 in the Steps table above, which
  covers them with live evidence of a normal authenticated session surviving this feature's
  interceptor changes) still rest on a *specific* control-flow claim S1 cannot distinguish from
  "it would have worked before this feature too" — that refresh is now triggered by matching the
  expiry code rather than "any 401". That distinction is proved by
  `apps/backoffice-web/src/lib/api-axios.test.ts` and `apps/pos-web/src/lib/common/api-axios.test.ts`
  (mocking distinct response codes and asserting which branch fires).
- **AC-07** (code survives unaltered to the frontend's error-handling layer) — a data-shape
  claim about an intermediate object, not a rendered value; proved by the same two `.test.ts`
  files above.
- **AC-08** (revoked-session regression: refresh-then-fail still redirects to login) — requires
  actually revoking a live session mid-test (e.g. via `/auth/logout` in another tab while a
  request is in flight) to observe without mocking; the existing interceptor code path is
  unchanged by this feature per construction (T-02-01/T-02-02 only add a branch ahead of it), and
  is covered by the pre-existing regression test asserting the clear-session-and-redirect path,
  extended in T-02-03.

## Notes

S1 runs once per declared environment (`local-backoffice`, `local-pos`) and deliberately carries
no text assertion: this feature spans two apps with entirely different UI text, so no single
positive assertion holds for both. The meaningful check is the runner's own built-in
redirect-to-sign-in detection (fires before any `Assert` is evaluated) plus `ready_when` and
`failure_signals` — together they prove a real login + authenticated page load survived this
feature's interceptor changes, which is the only *visible* regression this feature could
plausibly cause (a typo in the new code-check breaking the login/refresh path entirely). This is
a smoke test, not AC-level evidence — the actual acceptance criteria are verified by the test
suites cited above, which this feature's construction already ran green.
