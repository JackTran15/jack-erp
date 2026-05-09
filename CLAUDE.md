# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Package manager:** `pnpm` (workspace root). Node >= 20 required. Run `pnpm install` from the root before anything else.

> **Footgun:** `pnpm install` runs a `postinstall` that builds `@erp/shared-interfaces`, `@erp/shared-kafka-client`, and `@erp/api-client` (see root `package.json`). Skipping it (or editing files inside `packages/shared-*` later) will cause stale types in the API. Run `pnpm build:shared` after changing those packages — `make dev-api` does this for you, but `dev-backoffice` / `dev-pos` do not (they consume the already-generated TypeScript output).

### Development

```bash
# Start individual services
make dev-api              # NestJS API on :4000 (auto-builds shared packages first)
make dev-backoffice       # Vite/React backoffice on :3000
make dev-pos              # Vite/React POS on :3001

# Or via pnpm filters
pnpm dev:api
pnpm dev:backoffice
pnpm dev:pos
```

### Lint

```bash
pnpm lint                                  # Lint every workspace package
pnpm --filter @erp/backoffice-web lint     # Single package
# Note: apps/api currently stubs `lint` as `echo lint` — no ESLint wired up there yet.
```

### Infrastructure (Docker)

```bash
docker compose up -d      # Postgres :5433, Redis :6380, Redpanda :19092, Adminer :18088, Redpanda Console :18080
```

Copy `apps/api/.env.example` → `apps/api/.env` before first run. The defaults match the docker-compose ports.

### Database

```bash
pnpm migration:run        # Apply pending migrations
pnpm migration:generate   # Generate migration from entity diff (API must have DB connection)
pnpm migration:revert     # Revert last migration
pnpm migration:show       # List applied vs. pending migrations
pnpm migration:create     # Create an empty migration skeleton
pnpm seed:inventory       # Seed demo org, admin user, branches, and inventory data
pnpm seed:dev-admin       # Alias of seed:inventory (dev login + tenant data)
```

### API client codegen

```bash
pnpm openapi:generate     # Fetches /docs-json from running API and regenerates packages/api-client/src/generated/schema.ts
# or:
make openapi-generate
```
The API must be running at `http://127.0.0.1:4000`. Falls back to `openapi-stub.json` if not reachable.
Commit `openapi.snapshot.json` when the API contract changes so teammates don't need to run the API to build.

### Tests

```bash
# API unit tests (Jest, matches *.spec.ts)
pnpm --filter @erp/api test

# Single test file
pnpm --filter @erp/api test -- --testPathPattern=auth.service

# E2E tests
pnpm test:e2e
```

### Build

```bash
make build-api
make build-backoffice
make build-pos
# or all at once:
make build-all
```

### Utility scripts

```bash
pnpm contract:check       # Verify FE/BE contract is in sync (uses scripts/contract-check.ts)
pnpm docs:entities        # Regenerate entity manifest + markdown under docs/entities/
```

## Conventions

### Vietnamese UI copy (hard rule, from `.cursor/rules/vietnamese-ui.mdc`)

- All user-facing strings in `apps/backoffice-web` (page titles, buttons, form labels, placeholders, frontend-generated error/success messages, table & filter copy) **must be Vietnamese**, written naturally and consistently with common ERP terminology.
- API keys, IDs, and enum values sent to the server stay as-is (UUIDs, `ACTIVE`, etc.) — only the **display label** is translated.
- `CrudEntityConfig.displayName` / `label` for entities rendered in the backoffice should also be Vietnamese.
- Currency and dates: format with `Intl` using locale `vi-VN` unless a specific override is required.
- When adding a new screen or component to the backoffice, default to Vietnamese strings — do **not** add English copy unless it's a forced technical term (API name, raw error code).

### Shared UI components (backoffice)

To keep the backoffice visually and behaviorally consistent, prefer the shared building blocks over rolling new ones:

- **Modals → always use `AppModal` from `@erp/ui`** (`packages/ui/src/components/app-modal.tsx`). It already provides drag, resize, maximize, escape-to-close, and a default Vietnamese Save/Cancel footer (`saveLabel = "Lưu"`, `cancelLabel = "Huỷ"`). Use the `footer` prop to inject extra actions instead of building a bespoke `<Dialog>`. Do not import shadcn `Dialog` directly for new dialogs — wrap them with `AppModal` so resize/drag behavior stays uniform.
- **Tables → use `BaseDataTable`** at `apps/backoffice-web/src/components/table/BaseDataTable.tsx` with the typed `TableColumn<T>` API. Column-level filtering is built in via `filterKind: "symbol" | "select" | "none"` (and `filterOptions` for select), so derive filter state from column config rather than building separate filter bars per page. Reach for a custom table only when the data shape genuinely cannot be expressed as `TableColumn<T>`.

### Documentation files

- Do **not** create incidental summary `.md` files (work-in-progress notes, "what I just did" recaps, throwaway design docs). Long-lived docs belong under `docs/` and follow its numbering convention.
- The full design corpus lives in `docs/` as numbered files `01-product-scope.md` → `21-generic-crud-platform.md`, plus `docs/entities/` for per-entity field-level docs and `docs/go-live-checklist.md`. Treat the numbering as stable — when adding a new top-level doc, append the next number rather than reshuffling.

## Architecture

### Monorepo layout

```
apps/
  api/            NestJS backend
  backoffice-web/ React admin SPA
  pos-web/        React POS SPA
packages/
  api-client/     Generated TypeScript HTTP client (openapi-typescript)
  shared-interfaces/ Shared TypeScript types used by API and both frontends
  shared-kafka-client/ Typed Redpanda/Kafka producer + consumer
  ui/             Shared React component library (Tailwind)
```

### Multi-tenant model

Every operational record is scoped by `organizationId` (top-level company) and `branchId` (operational unit). These flow through the system as:
- JWT payload: `{ userId, organizationId, roles[], branchIds[] }`
- HTTP header: `X-Branch-Id` — validated against the JWT `branchIds` list by the `@Actor` decorator
- The `Actor` param decorator (in `apps/api/src/common/decorators/actor-context.decorator.ts`) resolves the active branch from the header first, then JWT fallback.

### Auth & session

- Login → JWT access token (15 min) + refresh token (7 days), session stored in Redis via `SessionStore`
- `AuthGuard` (applied globally) verifies JWT and checks the session is still active in Redis (supports server-side revocation)
- `PermissionGuard` checks `@RequirePermission('permission.name')` decorator against `RbacService`
- `@Public()` decorator opts a route out of `AuthGuard`
- Sessions are rotated on refresh (old jti is revoked, new jti issued)

### Generic CRUD platform

`CrudModule` provides a reusable admin CRUD layer at `/admin/entities/:entityKey`. Modules register entities by implementing `BaseCrudService` and calling `EntityRegistryService.registerEntity()` during `OnModuleInit`. The backoffice `CrudListPage` at `/admin/:entityKey` consumes this dynamically. This keeps entity management out of bespoke controllers for simple admin tables.

### Real-time / events

- **WebSocket**: Socket.IO with a Redis adapter (`RedisIoAdapter`) for horizontal scaling. Events module (`EventsModule`) is global.
- **Kafka (Redpanda)**: `shared-kafka-client` wraps KafkaJS with typed envelopes, retry, and DLQ. `EventPublisher` and `EventConsumerManager` are global providers discovered via `@nestjs/core` `DiscoveryModule`.

### Frontend patterns

Both `backoffice-web` and `pos-web` follow the same pattern:
- **State**: TanStack Query for server state, Zustand for client/UI state
- **HTTP**: `packages/api-client` (`createErpApiClient`) is the preferred client — it injects `Authorization`, `X-Branch-Id`, `X-Request-Id`, and `X-Idempotency-Key` automatically. The older `apps/backoffice-web/src/lib/http.ts` Axios wrapper is legacy.
- **Auth context**: `useAuth` / `AuthProvider` in backoffice; `RequirePosAuth` / `RequirePosBranch` guards in pos-web
- **Routing**: React Router v7; all authenticated routes wrap `RequireAuth` → `BackofficeLayout` (backoffice) or the equivalent POS shell

### API conventions

- All controllers use `ValidationPipe` (whitelist + transform + forbidNonWhitelisted) globally
- Swagger UI at `http://localhost:4000/docs`, JSON spec at `/docs-json`
- `synchronize: false` — schema changes always go through TypeORM migrations
- Monetary amounts: `NUMERIC(18,2)`. IDs: UUID v4. Timestamps: UTC.
- Business transactions (stock ledger, journal entries) are immutable after posting; corrections use reversal entries.
- Document numbers are generated by `DocumentNumberingModule` using configurable rules per document type.

### Detailed docs

Full domain design docs are in `docs/` — see the `## Conventions › Documentation files` section above for the numbering layout.
