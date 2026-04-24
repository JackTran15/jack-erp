# Multi-Agent Ownership and Implementation Guide

## Agent Tracks and Code Boundaries

### Agent `platform-core`

**Tickets:** TKT-001, TKT-002, TKT-003

**Code ownership:**

- `/package.json`, `/pnpm-workspace.yaml`, `/tsconfig.base.json`
- `packages/shared-interfaces/**`
- `apps/api/src/main.ts`, `apps/api/src/app.module.ts`
- `apps/api/src/common/**` (health, config, logging, error filters, base entities, interceptors)
- `apps/api/src/database/**` (TypeORM datasource config, migration tooling)
- Shared lint/tsconfig presets if created

**Does not own:** domain modules, frontend apps, infra packages.

---

### Agent `web-shells`

**Tickets:** TKT-004, TKT-005

**Code ownership:**

- `apps/backoffice-web/**` (scaffold, routing shell, shared HTTP client, env config)
- `apps/pos-web/**` (scaffold, POS route shell, shared HTTP client, env config)

**Does not own:** API modules, packages, backend logic.

---

### Agent `infra-events-cache`

**Tickets:** TKT-021, TKT-019, TKT-020

**Code ownership:**

- `packages/shared-kafka-client/**` (producer/consumer factories, topic helpers, envelope types, DLQ/retry utils)
- `apps/api/src/modules/redis/**` (Redis module, cache service, session store, idempotency store, invalidation hooks, key naming)
- `apps/api/src/modules/events/**` (Redpanda producer/consumer wiring, topic config, integration event envelope)
- Docker/infra config for Redis and Redpanda (compose files, env templates)

**Does not own:** domain-specific event handlers, WebSocket gateway, auth guards.

---

### Agent `security-access`

**Tickets:** TKT-006

**Code ownership:**

- `apps/api/src/modules/auth/**` (JWT strategy, login/refresh/logout/session endpoints, guards)
- `apps/api/src/modules/rbac/**` (permission model, role mapping, branch scope middleware/guards)
- DB entities/migrations: `users`, `roles`, `permissions`, `user_roles`, `user_branch_assignments`

**Depends on:** Redis session store from `infra-events-cache` (TKT-020). Coordinate session key design.

**Does not own:** Redis module internals, domain-specific permission checks beyond guard framework.

---

### Agent `org-branch-master`

**Tickets:** TKT-007, TKT-025, TKT-026

**Code ownership:**

- `apps/api/src/modules/organization/**` (org entity, main branch bootstrap, registration requests)
- `apps/api/src/modules/branch/**` (branch entity, hierarchy, archive/suspend, user-branch assignments)
- `apps/api/src/modules/sales-hierarchy/**` (salesman/sales-manager assignment APIs)
- `apps/backoffice-web/src/pages/onboarding/**` (org/branch registration UI, approval queue)
- `apps/backoffice-web/src/pages/branch-management/**` (sales hierarchy UI)
- DB entities/migrations: `organizations`, `branches`, registration request tables, assignment junction tables

**Does not own:** storage/showroom/location (inventory-domain), auth guards (security-access).

---

### Agent `crud-framework`

**Tickets:** TKT-024

**Code ownership:**

- `apps/api/src/modules/crud/**` (BaseCrudService, entity metadata registry, admin controller, hooks, cascade, audit integration)
- `apps/backoffice-web/src/components/crud/**` (generic table, filters, form renderer, detail view)
- `apps/backoffice-web/src/pages/admin/**` (generic CRUD route shell `/admin/:entityKey`)
- `packages/shared-interfaces/src/crud/**` (metadata types, field definitions, entity config contracts)

**Does not own:** domain-specific hook implementations (those live in each domain module).

---

### Agent `customer-domain`

**Tickets:** TKT-008

**Code ownership:**

- `apps/api/src/modules/customer/**` (customer service, dedupe logic, merge endpoint, CRUD hooks)
- DB entities/migrations: `customers`
- Domain event: `erp.customer.merged` (producer side)

**Does not own:** generic CRUD base (crud-framework), Redpanda producer internals (infra-events-cache).

---

### Agent `inventory-domain`

**Tickets:** TKT-009, TKT-010, TKT-011, TKT-012

**Code ownership:**

- `apps/api/src/modules/inventory/**`
  - `location/` (storages, showrooms, locations, storage-manager assignments)
  - `ledger/` (stock ledger write service, balance projection)
  - `transfer/` (draft/approve/post workflow, state machine)
  - `adjustment/` (create/approve/post, reason codes, threshold rules)
  - `csv/` (import validate/commit, export, job tracking, row-level errors)
- DB entities/migrations: `items`, `storages`, `showrooms`, `locations`, `stock_balances`, `stock_ledger_entries`, `stock_transfers`, `stock_transfer_lines`, `stock_adjustments`, `stock_adjustment_lines`, `inventory_import_jobs`, `inventory_import_job_rows`
- Domain events: `erp.stock.movement.posted` (producer side)
- WebSocket integration: `inventory.import.status.changed` (emit via realtime gateway)

**Does not own:** WebSocket gateway internals (realtime), Redpanda producer internals (infra-events-cache).

---

### Agent `accounting-domain`

**Tickets:** TKT-022, TKT-015, TKT-016

**Code ownership:**

- `apps/api/src/modules/document-numbering/**` (rule engine, sequence reservation, CRUD, activation)
- `apps/api/src/modules/accounting/**`
  - `coa/` (chart of accounts, account CRUD)
  - `journal/` (journal posting, balance checks, reversal workflow)
  - `payables/` (lifecycle, settlement)
  - `receivables/` (lifecycle, settlement, write-off)
  - `expenses/` (posting, account mapping, threshold approval)
  - `cash/` (cash accounts, movements, EOD reconciliation link)
- DB entities/migrations: `document_number_rules`, `document_number_counters`, `accounts`, `journal_entries`, `journal_lines`, `payables`, `payable_settlements`, `receivables`, `receivable_settlements`, `expenses`, `cash_accounts`, `cash_movements`
- Domain events: `erp.journal.posted` (producer side)

**Does not own:** POS-specific journal triggers (pos-domain calls accounting service), generic CRUD base.

---

### Agent `realtime`

**Tickets:** TKT-023

**Code ownership:**

- `apps/api/src/modules/websocket/**` (Socket.IO gateway, Redis adapter config, channel/room management, auth handshake, event emission service, correlation ID handling)
- Shared event contract types in `packages/shared-interfaces/src/websocket/**`

**Depends on:** Redis adapter from `infra-events-cache` (TKT-020), auth token validation from `security-access` (TKT-006).

**Does not own:** domain-specific event triggers (each domain module calls the emission service).

---

### Agent `pos-domain`

**Tickets:** TKT-013, TKT-014

**Code ownership:**

- `apps/api/src/modules/pos/**`
  - `checkout/` (sale creation, payment, stock + journal side effects)
  - `returns/` (return with sale linking, stock + journal reversal)
  - `exchange/` (paired in/out, settlement difference, stock + journal)
  - `session/` (open/close lifecycle, reconciliation, variance, approval)
- `apps/pos-web/src/pages/**` (checkout UI, session management UI)
- DB entities/migrations: `pos_terminals`, `pos_sessions`, `sales`, `sale_lines`, `payments`, `returns`, `return_lines`
- Domain events: `erp.sale.posted` (producer side)
- WebSocket integration: `pos.checkout.acknowledged`, `reconciliation.completed`

**Does not own:** stock ledger internals (calls inventory service), journal internals (calls accounting service), WebSocket gateway.

---

### Agent `reporting`

**Tickets:** TKT-017

**Code ownership:**

- `apps/api/src/modules/reporting/**` (report endpoints, KPI computations, read models, async job runner)
- `apps/backoffice-web/src/pages/reports/**` (dashboard, report views)
- WebSocket integration: `report.job.completed`

**Does not own:** underlying transactional tables (reads from other modules' tables via query builders or views).

---

### Agent `quality-release`

**Tickets:** TKT-018

**Code ownership:**

- `e2e/**` or `tests/e2e/**` (Playwright/Cypress regression suite)
- CI workflow files (`.github/workflows/` or equivalent)
- Contract drift detection scripts
- `docs/` go-live checklist and runbook updates

**Does not own:** application code (only tests and CI config).

---

## Wave-by-Wave Execution

### Wave 0 — Serial Foundation

| Agent | Ticket | Deliverables | Gate criteria |
|-------|--------|-------------|---------------|
| `platform-core` | TKT-001 | Root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, workspace scripts | `pnpm install` succeeds; `pnpm -r build` runs clean |

### Wave 1 — Parallel

| Agent | Ticket | Deliverables | Gate criteria |
|-------|--------|-------------|---------------|
| `platform-core` | TKT-002 | `packages/shared-interfaces` with core domain types, enums, API contracts | Package builds; importable via `workspace:*` |
| `web-shells` | TKT-004 | `apps/backoffice-web` scaffold, shared HTTP client, env config | Dev server runs; sample API call typed |
| `web-shells` | TKT-005 | `apps/pos-web` scaffold, POS route shell, shared contract imports | Dev server runs; shared interfaces consumed |

### Wave 2 — Serial Gate

| Agent | Ticket | Deliverables | Gate criteria |
|-------|--------|-------------|---------------|
| `platform-core` | TKT-003 | `apps/api` Nest bootstrap, health endpoint, TypeORM datasource + migration tooling, global error/logging/config, `@erp/shared-interfaces` imports | API runs; health passes; DB connects; baseline migration runs |

### Wave 3 — Parallel Platform Expansion

| Agent | Ticket | Deliverables | Gate criteria |
|-------|--------|-------------|---------------|
| `org-branch-master` | TKT-007 | Org/branch entities + APIs, main branch bootstrap, registration models, user-branch assignments, default main storage + showroom flags | Branch CRUD works; state transitions audited; main branch auto-provisions |
| `infra-events-cache` | TKT-020 | Redis module, cache service, session store, idempotency store, key naming, TTL strategy, invalidation hooks | Cache hit/miss works; session CRUD works; idempotency store functional |
| `infra-events-cache` | TKT-021 | `packages/shared-kafka-client`, producer/consumer factories, config separation, DLQ/retry helpers | Package builds; integration test publish/consume passes |
| `crud-framework` | TKT-024 | BaseCrudService, metadata registry, admin endpoints, generic backoffice CRUD pages, cascade + audit | New entity onboardable via config; pagination/filter/sort works; RBAC + audit enforced |

### Wave 4 — Parallel Security + Infra + Numbering

| Agent | Ticket | Deliverables | Gate criteria |
|-------|--------|-------------|---------------|
| `security-access` | TKT-006 | JWT auth flow, Redis session validation, permission model, role mapping, branch scope guards, registration approval permissions | Unauthorized blocked; branch leakage tests pass; session revocation works |
| `infra-events-cache` | TKT-019 | Redpanda cluster config, topic setup (4 core topics), producer/consumer baseline, retry/DLQ policy | Events publish on committed tx; consumer lag visible; idempotent handling verified |
| `accounting-domain` | TKT-022 | Document numbering rule engine, sequence reservation, CRUD + activation APIs | Configurable patterns work; concurrent generation race-safe; past numbers immutable |
| `realtime` | TKT-023 | Socket.IO gateway, Redis adapter, channel scoping, auth handshake, event contracts, correlation IDs | Push updates received; branch/role scope enforced; multi-instance consistent |

**Checkpoint A:** JWT + Redis session validated end-to-end. Idempotency store functional. Redpanda topics created with publish/consume verified. WebSocket gateway connected and scoped. Document numbering generates unique sequences.

### Wave 5 — Parallel Master Data + Inventory Start

| Agent | Ticket | Deliverables | Gate criteria |
|-------|--------|-------------|---------------|
| `org-branch-master` | TKT-025 | Org/branch registration UI, superadmin approval queue, approve/reject with reason, status tracking | Inactive until approved; audit trail visible; non-approvers blocked |
| `org-branch-master` | TKT-026 | Salesman/sales-manager assignment APIs + UI, branch-scoped validation | Branch admins manage only allowed branches; assignments auditable |
| `customer-domain` | TKT-008 | Customer CRUD, dedupe detection, merge with referential safety | Required fields validated; merge produces auditable before/after |
| `inventory-domain` | TKT-009 | Storage/showroom/location entities + APIs, main storage/showroom flags, storage manager assignments | Hierarchy supports posting; cross-branch blocked; main storage under main branch only |

### Wave 6 — Parallel Mid-Domain

| Agent | Ticket | Deliverables | Gate criteria |
|-------|--------|-------------|---------------|
| `inventory-domain` | TKT-010 | Stock ledger write service, balance projection, stock query APIs | Every movement creates ledger rows; balances recomputable from ledger |
| `accounting-domain` | TKT-015 | COA APIs, journal posting with balance checks, reversal workflow | Unbalanced journals rejected; posted journals immutable; reversal chain works |

### Wave 7 — Parallel Convergence

| Agent | Ticket | Deliverables | Gate criteria |
|-------|--------|-------------|---------------|
| `inventory-domain` | TKT-011 | Transfer draft/approve/post, adjustment create/approve/post, reason codes, threshold approvals | Illegal transitions blocked; posted docs immutable; ledger entries created |
| `inventory-domain` | TKT-012 | CSV validate-only + commit modes, row-level errors, idempotency keys, job audit, WebSocket status | Bad rows return errors; same idempotency key replays safely; WS status updates fire |
| `pos-domain` | TKT-013 | Checkout + return + exchange endpoints, stock + accounting integration hooks, document numbering | Sale updates stock + posts journal; return reverses correctly; exchange does paired in/out |

**Checkpoint B:** End-to-end commerce path verified: customer -> inventory -> numbering -> POS checkout -> journal side-effects -> stock ledger entries.

### Wave 8 — Parallel Late Domain

| Agent | Ticket | Deliverables | Gate criteria |
|-------|--------|-------------|---------------|
| `pos-domain` | TKT-014 | Session lifecycle APIs, variance vs policy, supervisor approval for large variance | Cannot close without reconciliation; variance events recorded |
| `accounting-domain` | TKT-016 | Payable/receivable lifecycle, expense posting, cash movements | Partial/full settlement works; cash aligns with POS and journal effects |

**Checkpoint C:** Finance closure path verified: payables/receivables/cash settled; session reconciliation complete; all journal entries balanced.

### Wave 9 — Serial Reporting Gate

| Agent | Ticket | Deliverables | Gate criteria |
|-------|--------|-------------|---------------|
| `reporting` | TKT-017 | Report endpoints, KPI computations, branch/org scope filtering, main branch dashboard, async job runner | Reports align with posted data; branch access enforced; consolidated dashboard works |

### Wave 10 — Final Hardening

| Agent | Ticket | Deliverables | Gate criteria |
|-------|--------|-------------|---------------|
| `quality-release` | TKT-018 | E2E regression suite, contract drift checks, operational readiness checklist | Regression passes in CI; rollout checklist completed |

**Checkpoint D:** Production readiness sign-off from testing/deployment/rollout docs.

---

## Cross-Agent Coordination Rules

1. **Shared interfaces first:** any new DTO, enum, or contract type goes into `packages/shared-interfaces` before being used in API or frontend code.
2. **Migration ownership:** each domain agent owns migrations for their tables. Migrations must be sequential and non-conflicting. Use timestamp-prefixed migration names.
3. **Event contracts:** domain agents define event payloads in shared interfaces. `infra-events-cache` owns transport; domain agents own publish triggers.
4. **WebSocket emission:** domain agents call the realtime gateway emission service. `realtime` agent owns the gateway; domain agents own the trigger logic.
5. **Auth guards:** `security-access` provides guard decorators and middleware. Domain agents apply them via decorators on their controllers.
6. **CRUD hooks:** `crud-framework` provides the base service and hook interface. Domain agents implement hooks in their modules.
7. **No cross-module direct repository access:** modules interact through exported NestJS services, not by importing another module's repositories.
