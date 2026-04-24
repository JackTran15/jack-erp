# Monorepo Workspace and Shared Interfaces

## Purpose

Standardize the ERP codebase as a `pnpm` workspace monorepo so backend and frontend applications can reuse shared interfaces, enums, and validation contracts.

## Workspace Layout

Recommended structure:

```text
/
  apps/
    api/               # NestJS backend
    backoffice-web/    # React back office
    pos-web/           # React POS client
  packages/
    shared-interfaces/ # Domain DTOs, request/response contracts, enums
    shared-kafka-client/ # Shared kafkajs producer/consumer clients
    shared-utils/      # Optional common helpers (pure, framework-agnostic)
    eslint-config/     # Optional shared lint config
    tsconfig/          # Optional shared tsconfig presets
  pnpm-workspace.yaml
  package.json
  tsconfig.base.json
```

## pnpm Workspace Rules

- Use `pnpm` as the only package manager.
- Define workspace paths in `pnpm-workspace.yaml`:
  - `apps/*`
  - `packages/*`
- Internal dependencies must use workspace protocol:
  - `"@erp/shared-interfaces": "workspace:*"`
- Root scripts orchestrate tasks using recursive commands (`pnpm -r`).

## Shared Interfaces Package

The `packages/shared-interfaces` package should contain:

- Domain interfaces (customer, inventory, accounting, POS).
- Shared enums and status constants.
- API request/response contracts aligned with endpoint specs.
- Optional runtime schemas if a single-source contract approach is used.

Constraints:

- Keep package framework-agnostic (no NestJS/React imports).
- Avoid business logic; include contracts and pure type utilities only.
- Version with workspace protocol in monorepo; publish externally only if needed.

## Contract Ownership and Flow

- API contracts are authored or generated in one source of truth, then exported from `shared-interfaces`.
- Backend controllers/services implement and validate these contracts.
- Frontend clients consume the same contracts for type-safe requests and responses.
- Contract changes require coordinated updates and contract tests.

## Build and Dev Conventions

Suggested root scripts:

- `pnpm -r build`
- `pnpm -r test`
- `pnpm -r lint`
- `pnpm --filter @erp/api dev`
- `pnpm --filter @erp/backoffice-web dev`
- `pnpm --filter @erp/pos-web dev`

Suggested dependency graph order:

1. `packages/shared-interfaces`
2. `packages/shared-kafka-client`
3. `packages/shared-utils` (if dependent on interfaces)
4. `apps/api`
5. `apps/backoffice-web` and `apps/pos-web`

## Shared KafkaJS Client Package

The `packages/shared-kafka-client` package should provide a single integration surface for Redpanda messaging:

- Shared `Kafka` bootstrap/client factory.
- Producer factory with producer-specific config defaults.
- Consumer factory with consumer-specific config defaults.
- Topic naming helpers and message envelope typing.

Required config separation:

- Producer config (example concerns):
  - `acks`, compression, batching (`linger`-like behavior), retry policy, idempotent publishing settings.
- Consumer config (example concerns):
  - `groupId`, `sessionTimeout`, heartbeat interval, `maxBytesPerPartition`, concurrency, commit policy.

Rules:

- Do not share the same runtime config object for producer and consumer.
- Keep producer and consumer configs independently overridable per module/use case.
- Include dead-letter and retry helper utilities for consistent failure handling.

## Guardrails

- Enforce import boundaries so apps do not import each other directly.
- Disallow duplicate interface definitions outside shared package.
- Add CI checks to detect API/interface drift.

## Acceptance Criteria

- Workspace uses `pnpm` with `apps/*` and `packages/*`.
- Shared interfaces package is consumed by API and both web apps.
- Contract changes are validated by automated tests in CI.
