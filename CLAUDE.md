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

## Documentation

Architectural specs and entity-level schema references live under `docs/` (per-domain markdown files + `docs/entities/`). Implementation tickets and epic dependency graph live under `tickets/`. Generate entity docs with `pnpm docs:entities`.
