# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo

pnpm workspace (`pnpm-workspace.yaml`). Node `>=20`, pnpm `10.x`.

```
apps/
  api/             @erp/api             NestJS backend (port 4000)
  backoffice-web/  @erp/backoffice-web  React admin SPA (port 3000)
  pos-web/         @erp/pos-web         React POS SPA (port 3001)
packages/
  shared-interfaces/    @erp/shared-interfaces    shared TS types
  shared-kafka-client/  @erp/shared-kafka-client  Kafka/Redpanda wrapper
  api-client/           @erp/api-client           OpenAPI-generated TS client
  ui/                   @erp/ui                   shared shadcn/Radix component library
```

`postinstall` builds the three shared packages — `@erp/api-client`, `@erp/shared-interfaces`, `@erp/shared-kafka-client`. After cloning, always run `pnpm install` (which runs `pnpm build:shared`) before `dev:api`.

## Common commands

```bash
# Dev servers (run in separate terminals)
make dev-api           # NestJS API on :4000 (auto-rebuilds shared packages first)
make dev-backoffice    # Backoffice on :3000
make dev-pos           # POS on :3001

# Build / test / lint (workspace-wide)
pnpm build             # pnpm -r build
pnpm test              # pnpm -r test (only @erp/api has real tests; the web apps echo "test")
pnpm lint              # pnpm -r lint (no real linter wired — every workspace echoes "lint")

# API-only
pnpm --filter @erp/api test                   # Jest unit tests (rootDir = apps/api/src)
pnpm --filter @erp/api test -- foo.spec.ts    # single test file
pnpm --filter @erp/api test -- -t "creates"   # filter by test name
pnpm --filter @erp/api test:e2e               # Jest e2e (apps/api/test/e2e/jest-e2e.config.ts)

# DB schema (TypeORM, data-source.ts = apps/api/src/database/data-source.ts)
pnpm migration:generate src/database/migrations/MyChange   # diff entities vs DB
pnpm migration:run
pnpm migration:revert
pnpm migration:show

# Seeds
pnpm seed:inventory        # demo org + admin user + branch + inventory
pnpm seed:dev-admin        # alias of seed:inventory

# API client regeneration (API must be running on :4000)
pnpm openapi:generate      # regenerates packages/api-client from /docs-json
```

Local infra (Postgres :5433, Redis :6380, Redpanda :19092, Adminer :18088, Redpanda Console :18080):
```bash
docker compose up -d
```

E2E (`test:e2e`) runs against a separate DB: `apps/api/test/e2e/setup/global-setup.ts` loads `apps/api/.env`, auto-creates the `erp_test` database, and applies migrations before the suite. It runs serially (`maxWorkers: 1`) with `forceExit: true` — kafkajs consumers leave handles open, so a hung teardown can masquerade as a suite failure; check actual test output, not just the exit message.

## Architecture

### Stack
- Backend: NestJS 11, TypeORM, PostgreSQL, Redis (ioredis), Redpanda (Kafka-compatible via kafkajs), Socket.IO with Redis adapter.
- Frontend: React 19, TypeScript 5, Vite 6, React Router v7, TanStack Query v5, Zustand v5, Tailwind 3 + Radix primitives via `@erp/ui`.
- All user-facing UI strings are **Vietnamese**; enum/ID values stay English (UUIDs, `ACTIVE`, etc.). Format numbers/dates with `Intl` locale `vi-VN`.

### Multi-tenant scoping (load-bearing)

Every operational record is scoped by `organizationId` (company) + `branchId` (branch).

- JWT payload: `{ userId, organizationId, roles[], branchIds[], jti }`.
- The active branch is passed per-request as `X-Branch-Id` header.
- Controllers use `@Actor()` to get `ActorContext { userId, organizationId, branchId?, roles }`; queries **must** filter by `actor.organizationId` (and `branchId` when scope demands).
- Auth/branch decorators applied at the class level (`@UseGuards(AuthGuard, PermissionGuard)`); per-method use `@Public()`, `@RequirePermission("x.y")`, `@RequireBranchScope()`.

### Database rules

- `synchronize: false` everywhere — schema changes only via TypeORM migrations in `apps/api/src/database/migrations/`.
- IDs: `@PrimaryGeneratedColumn("uuid")` (UUID v4).
- Money: `@Column({ type: "numeric", precision: 18, scale: 2 })`.
- Timestamps stored UTC via `@CreateDateColumn` / `@UpdateDateColumn`.
- Soft-delete via `@DeleteDateColumn()` / `SoftDeleteEntity` base.
- Business transactions (stock ledger, journal entries, posted invoices) are **immutable after posting**; corrections are done via reversal entries, not edits.

### Generic CRUD platform

The API exposes a generic admin surface at `/admin/entities/:entityKey/records`. Any entity implementing `BaseCrudService<E, CreateDto, UpdateDto>` and registered via `EntityRegistryService.registerEntity(CONFIG, TOKEN)` in its module's `OnModuleInit` automatically gets:
- REST CRUD endpoints at `/admin/entities/:entityKey/records`
- A backoffice route `/admin/:entityKey` that auto-renders a list page via `CrudListPage` and hooks (`useCrudConfig`, `useCrudRecords`, `useCrudCreate`, `useCrudUpdate`, `useCrudDelete`).

`CrudEntityConfig` describes the entity (`entityKey`, `displayName`, `fields`, `searchableFields`, `filterDefinitions`, `permissions`, `scopingPolicy: ScopingPolicy.ORGANIZATION | BRANCH`, `deletionPolicy: SOFT | HARD`). Use this before hand-building admin pages.

### Events

Kafka/Redpanda is the event bus. Inject `EventPublisher` (global provider) and call `await events.publish("inventory.item.created", payload)`. Topics are created on app start by `TopicInitializer`. Dead-letter handling lives under `modules/events/`.

### Idempotency (load-bearing)

A global `IdempotencyInterceptor` (`common/interceptors/`, registered as `APP_INTERCEPTOR` in `common.module.ts`) dedupes mutations keyed on the `X-Idempotency-Key` header, backed by `IdempotencyStore` (Redis) in `modules/redis/`. Same key + same body replays the stored response (`X-Idempotency-Status: REPLAYED`); same key + different body returns 409 (`CONFLICT`). New mutation endpoints inherit this automatically — do not re-implement it. Event consumers dedupe separately via the `processed_events` table; emit deterministic `eventId`s so replays are no-ops.

### CQRS for complex queries

The `pos` module uses `@nestjs/cqrs` for heavy read operations (e.g., `SearchInvoicesV2Query` + `SearchInvoicesV2Handler`). Inject `QueryBus` in the controller and dispatch query objects; keep complex filter construction in `FilterBuilder` (`common/filters/`). Use CQRS for queries with dynamic multi-join filter combinations; use plain service injection for straightforward CRUD.

### Frontend data fetching

Both apps consume the API via a typed wrapper around `@erp/api-client`:
```ts
import { erpApi, requireErpData, requireErpSuccess } from "../lib/erp-api";
```
- `erpApi` auto-injects `Authorization`, `X-Branch-Id`, `X-Request-Id`, `X-Idempotency-Key`.
- `requireErpData(...)` throws `HttpError` on API error, returns the body on success.
- `requireErpSuccess(...)` is the void-returning variant for DELETE / no-body endpoints.
- Always wrap in TanStack Query; queryKey arrays start with the resource name and include all filters: `["inventory-items", page, search]`. Invalidate by prefix to bust related queries.

After changing API endpoints: run the API, then `pnpm openapi:generate`. Commit the updated `openapi.snapshot.json` and generated `packages/api-client/src/generated/schema.ts` (do not hand-edit the generated file).

### Auth session
- Access token kept in memory only; refresh token in `localStorage("refresh_token")`.
- `isAuthenticated` is derived from access token + Redis session check.

## API modules

`apps/api/src/modules/` contains: `accounting`, `auth`, `branch`, `crud`, `customer`, `document-numbering`, `events`, `health`, `hr`, `inventory`, `organization`, `pos`, `promotion`, `rbac`, `redis`, `registration`, `reporting`, `sales-hierarchy`, `websocket`.

### Inventory subdomains

`modules/inventory/` is split into subdomains, each with its own service/entity:
- `product/` — product catalog, attribute definitions/options, **variant generation** (see below)
- `item/` — inventory items (SKU-level records)
- `location/` — warehouses, providers (`ProviderEntity`), supplier groups (`SupplierGroupEntity`)
- `ledger/` — immutable stock ledger entries (`StockLedgerService`, `StockBalanceService`)
- `adjustment/`, `goods-receipt/`, `goods-issue/` — movement types
- `stock-take/`, `transfer-order/`, `transfer/` — inter-branch and counting flows
- `csv/` — Excel/CSV import-export subsystem (see below)
- `purchase-order/` — purchase order lifecycle

### Product variant generation

`VariantGenerationService` (`modules/inventory/product/`) generates variants from a product's attribute definitions:
- **Cartesian product** of all attribute option combos → one `ProductEntity` per variant.
- Hard limit: **500 variants** per product; pass `force: true` in the DTO to override.
- `resolveOrCreateVariant(dto)` matches an exact attribute combo or creates a new variant atomically (transaction-wrapped).
- Auto-generates variant codes with collision detection; links the variant to inventory items and providers in the same transaction.

### Excel/CSV import-export

`modules/inventory/csv/` owns all import-export logic:
- **Import flow**: `ExcelParserService` (raw grid parsing) → `CsvImportService` (validation, duplicate detection) → `ExcelImportItemService` (batch write). Long-running jobs are tracked via `InventoryImportJobEntity` / `InventoryImportJobRowEntity`.
- **Export**: `CsvExportService` streams selected items; configurable column sets.
- UI entry point: `InventoryItemsPage` in backoffice-web.

### Provider & supplier group

- `ProviderEntity` links an external supplier to an inventory item (`ItemProviderEntity` M2M); one provider per item can be flagged as primary.
- `SupplierGroupEntity` classifies providers into groups (scoped to organization).
- Both are registered via the generic CRUD platform — no hand-built admin pages needed.

## NestJS module convention

```
modules/my-feature/
  my-feature.module.ts        // @Module, OnModuleInit for entity registration
  my-feature.controller.ts    // @UseGuards(AuthGuard, PermissionGuard) at class level
  my-feature.service.ts
  my-feature.entity.ts
  dto/{create,update}-my-feature.dto.ts   // class-validator + @ApiProperty for Swagger
```

Global `ValidationPipe` uses `whitelist: true, transform: true, forbidNonWhitelisted: true` — DTOs must declare every accepted field.

OpenAPI UI at `/docs`, JSON at `/docs-json` (disabled when `NODE_ENV=production` or `DISABLE_SWAGGER=1`).

## React component convention

- Named exports only (no `export default`).
- Separate `interface Props`, no inline prop types.
- Add `React.memo` / `useMemo` / `useCallback` only when profiling shows a hot path.
- Cross-component UI state: React Context or Zustand. **Do not put server data in Zustand** — that belongs in TanStack Query.
- Always import primitives from `@erp/ui`, not Radix sub-packages directly.
- `cn()` from `@erp/ui` for conditional class merging; semantic Tailwind tokens (`bg-background`, `text-foreground`, etc.) instead of raw colors — the dark sidebar/header chrome (`bg-gray-900`) is the explicit exception.
- Icons exclusively from `lucide-react`.
- Page-level CRUD action bars use `PageToolbar` placed inside the page component (not in the layout).

### Navigation

`apps/backoffice-web/src/components/layout/navConfig.ts` is the single source of truth for the sidebar. Adding a route requires both an `<Route>` in `App.tsx` and a `NavChild` in `navConfig.ts`.

### POS-web page organization

`apps/pos-web/src/` organizes everything by page concern:
- `pages/` — 7 pages: `BranchSelectPage`, `CheckoutPage`, `FastStockTransferPage`, `InvoiceListPage`, `PosLoginPage`, `ReturnGoodsPage`, `UiCatalogPage`.
- `components/page-components/`, `hooks/page-hooks/`, `lib/page-libs/`, `stores/page-stores/` — page-specific code lives here, not in the common equivalents.
- `dtos/`, `interfaces/`, `types/` — local API shaping; do not duplicate types already in `@erp/shared-interfaces`.

## Documentation

Architectural specs and entity-level schema references live under `docs/` (per-domain markdown files + `docs/entities/`). Implementation tickets and epic dependency graph live under `tickets/`. Generate entity docs with `pnpm docs:entities`.



---

## 0. Non-negotiables

These rules override everything else in this file when in conflict:

1. **No flattery, no filler.** Skip openers like "Great question", "You're absolutely right", "Excellent idea", "I'd be happy to". Start with the answer or the action.
2. **Disagree when you disagree.** If the user's premise is wrong, say so before doing the work. Agreeing with false premises to be polite is the single worst failure mode in coding agents.
3. **Never fabricate.** Not file paths, not commit hashes, not API names, not test results, not library functions. If you don't know, read the file, run the command, or say "I don't know, let me check."
4. **Stop when confused.** If the task has two plausible interpretations, ask. Do not pick silently and proceed.
5. **Touch only what you must.** Every changed line must trace directly to the user's request. No drive-by refactors, reformatting, or "while I was in there" cleanups.

---

## 1. Before writing code

**Goal: understand the problem and the codebase before producing a diff.**

- State your plan in one or two sentences before editing. For anything non-trivial, produce a numbered list of steps with a verification check for each.
- Read the files you will touch. Read the files that call the files you will touch. Claude Code: use subagents for exploration so the main context stays clean.
- Match existing patterns in the codebase. If the project uses pattern X, use pattern X, even if you'd do it differently in a greenfield repo.
- Surface assumptions out loud: "I'm assuming you want X, Y, Z. If that's wrong, say so." Do not bury assumptions inside the implementation.
- If two approaches exist, present both with tradeoffs. Do not pick one silently. Exception: trivial tasks (typo, rename, log line) where the diff fits in one sentence.

---

## 2. Writing code: simplicity first

**Goal: the minimum code that solves the stated problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code. No configurability, flexibility, or hooks that were not requested.
- No error handling for impossible scenarios. Handle the failures that can actually happen.
- If the solution runs 200 lines and could be 50, rewrite it before showing it.
- If you find yourself adding "for future extensibility", stop. Future extensibility is a future decision.
- Bias toward deleting code over adding code. Shipping less is almost always better.

The test: would a senior engineer reading the diff call this overcomplicated? If yes, simplify.

---

## 3. Surgical changes

**Goal: clean, reviewable diffs. Change only what the request requires.**

- Do not "improve" adjacent code, comments, formatting, or imports that are not part of the task.
- Do not refactor code that works just because you are in the file.
- Do not delete pre-existing dead code unless asked. If you notice it, mention it in the summary.
- Do clean up orphans created by your own changes (unused imports, variables, functions your edit made obsolete).
- Match the project's existing style exactly: indentation, quotes, naming, file layout.

The test: every changed line traces directly to the user's request. If a line fails that test, revert it.

---

## 4. Goal-driven execution

**Goal: define success as something you can verify, then loop until verified.**

Rewrite vague asks into verifiable goals before starting:

- "Add validation" becomes "Write tests for invalid inputs (empty, malformed, oversized), then make them pass."
- "Fix the bug" becomes "Write a failing test that reproduces the reported symptom, then make it pass."
- "Refactor X" becomes "Ensure the existing test suite passes before and after, and no public API changes."
- "Make it faster" becomes "Benchmark the current hot path, identify the bottleneck with profiling, change it, show the benchmark is faster."

For every task:

1. State the success criteria before writing code.
2. Write the verification (test, script, benchmark, screenshot diff) where practical.
3. Run the verification. Read the output. Do not claim success without checking.
4. If the verification fails, fix the cause, not the test.

---

## 5. Tool use and verification

- Prefer running the code to guessing about the code. If a test suite exists, run it. If a linter exists, run it. If a type checker exists, run it.
- Never report "done" based on a plausible-looking diff alone. Plausibility is not correctness.
- When debugging, address root causes, not symptoms. Suppressing the error is not fixing the error.
- For UI changes, verify visually: screenshot before, screenshot after, describe the diff.
- Use CLI tools (gh, aws, gcloud, kubectl) when they exist. They are more context-efficient than reading docs or hitting APIs unauthenticated.
- When reading logs, errors, or stack traces, read the whole thing. Half-read traces produce wrong fixes.

---

## 6. Session hygiene

- Context is the constraint. Long sessions with accumulated failed attempts perform worse than fresh sessions with a better prompt.
- After two failed corrections on the same issue, stop. Summarize what you learned and ask the user to reset the session with a sharper prompt.
- Use subagents (Claude Code: "use subagents to investigate X") for exploration tasks that would otherwise pollute the main context with dozens of file reads.
- When committing, write descriptive commit messages (subject under 72 chars, body explains the why). No "update file" or "fix bug" commits. No "Co-Authored-By: Claude" attribution unless the project explicitly wants it.

---

## 7. Communication style

- Direct, not diplomatic. "This won't scale because X" beats "That's an interesting approach, but have you considered...".
- Concise by default. Two or three short paragraphs unless the user asks for depth. No padding, no restating the question, no ceremonial closings.
- When a question has a clear answer, give it. When it does not, say so and give your best read on the tradeoffs.
- Celebrate only what matters: shipping, solving genuinely hard problems, metrics that moved. Not feature ideas, not scope creep, not "wouldn't it be cool if".
- No excessive bullet points, no unprompted headers, no emoji. Prose is usually clearer than structure for short answers.

---

## 8. When to ask, when to proceed

**Ask before proceeding when:**
- The request has two plausible interpretations and the choice materially affects the output.
- The change touches something you've been told is load-bearing, versioned, or has a migration path.
- You need a credential, a secret, or a production resource you don't have access to.
- The user's stated goal and the literal request appear to conflict.

**Proceed without asking when:**
- The task is trivial and reversible (typo, rename a local variable, add a log line).
- The ambiguity can be resolved by reading the code or running a command.
- The user has already answered the question once in this session.

---

## 9. Self-improvement loop

**This file is living. Keep it short by keeping it honest.**

After every session where the agent did something wrong:

1. Ask: was the mistake because this file lacks a rule, or because the agent ignored a rule?
2. If lacking: add the rule under "Project Learnings" below, written as concretely as possible ("Always use X for Y" not "be careful with Y").
3. If ignored: the rule may be too long, too vague, or buried. Tighten it or move it up.
4. Every few weeks, prune. For each line, ask: "Would removing this cause the agent to make a mistake?" If no, delete. Bloated AGENTS.md files get ignored wholesale.

Boris Cherny (creator of Claude Code) keeps his team's file around 100 lines. Under 300 is a good ceiling. Over 500 and you are fighting your own config.

---

## AI tooling

### code-review-graph (MCP)
ALWAYS call code-review-graph MCP tools BEFORE Grep/Glob/Read when exploring the codebase.
The graph is faster, cheaper, and gives structural context (callers, dependents, test coverage) that file scanning cannot.

Workflow:
- First call: `get_minimal_context(task="<description>")` — ~100 tokens, full picture
- Exploring: `semantic_search_nodes_tool` or `query_graph_tool` instead of Grep
- Impact: `get_impact_radius_tool` instead of tracing imports manually
- Review: `detect_changes_tool` + `get_review_context_tool` instead of reading full files
- Relationships: `query_graph_tool` with callers_of / callees_of / imports_of / tests_for
- Fall back to Grep/Glob/Read only when the graph does not cover what you need

Target: ≤5 tool calls per task, ≤800 total tokens of graph context.

### rtk (CLI proxy)
RTK is installed and hooked into Claude Code. Shell commands are automatically compressed.
- `git status`, `git diff`, `git log` → compressed summaries
- `pnpm test` → failures only, passing tests stripped
- `pnpm lint` → errors only
- Use `rtk read <file> -l aggressive` for signatures-only file reading
- Use `rtk smart <file>` for 2-line heuristic summary

### code-review sub-agent
After implementing each ticket, spawn the code-review sub-agent:

  claude -p "Review staged diff for ticket TKT-XXX-NN. Ticket path: tickets/tickets/TKT-XXX-NN-slug.md"

The sub-agent returns a JSON verdict (PASS or BLOCKED).
- PASS → commit and move to next ticket
- BLOCKED → fix each blocker, re-stage, spawn sub-agent again

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
