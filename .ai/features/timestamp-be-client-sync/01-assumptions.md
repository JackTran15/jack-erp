---
feature: timestamp-be-client-sync
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | Scope is explicit-timezone-only; DB column-type reconciliation (naive `timestamp` vs `timestamptz`) and server-side plausibility validation on client timestamps are explicitly out of scope for this feature | high | no | None — this is a scope decision already made, not a technical guess | confirmed | Confirmed by Akenzy via AI-DLC discovery Q&A, 2026-08-17 |
| A-02 | The shared FE date-formatting util lives in `packages/ui` — both apps already depend on it per CLAUDE.md's stated convention ("Always import primitives from `@erp/ui`"), avoiding a new shared package's build/publish wiring for a single utility | high | no | Every ad-hoc formatter call site (~7, see `00-intent.md`) must import from `packages/ui` — now settled, feeds directly into the G2 contract design | confirmed | Confirmed by Akenzy via AI-DLC discovery Q&A, 2026-08-17 |
| A-03 | Pinning the TypeORM connection's `timezone` option is sufficient on its own to close the timezone gap, given the naive-timestamp driver-parsing nuance described in `00-intent.md` (Constraints) — vs. being cosmetically correct but not a full guarantee without also touching the out-of-scope column-type split | low | no | If wrong, the BE fix is incomplete and the bug can still surface via naive-timestamp columns after this feature ships, requiring a follow-up feature (the already-out-of-scope column-type reconciliation) | pending | — |

## Rejected assumptions

None yet — no assumption has been rejected in this feature.
