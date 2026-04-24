# EPIC-001 Foundation and Monorepo

## Goal

Establish the `pnpm` workspace monorepo foundation and shared interface contracts used by all apps.

## Scope

- Workspace setup (`apps/*`, `packages/*`).
- Shared interfaces package and conventions.
- Shared KafkaJS client package with producer/consumer config separation.
- Generic CRUD platform (base CRUD service + metadata-driven admin UI).
- Initial app bootstraps for API and frontend clients.
- Redpanda broker setup for event-driven workflows.
- Redis cache baseline setup.
- WebSocket realtime notification gateway baseline.

## Success Metrics

- All apps build using `pnpm -r build`.
- API and web apps consume `@erp/shared-interfaces`.
- No duplicate core domain interfaces outside shared package.

## Tickets

- [TKT-001 Init pnpm workspace](../tickets/TKT-001-init-pnpm-workspace.md)
- [TKT-002 Shared interfaces package](../tickets/TKT-002-shared-interfaces-package.md)
- [TKT-003 API app bootstrap](../tickets/TKT-003-api-app-bootstrap.md)
- [TKT-004 Backoffice app bootstrap](../tickets/TKT-004-backoffice-app-bootstrap.md)
- [TKT-005 POS app bootstrap](../tickets/TKT-005-pos-app-bootstrap.md)
- [TKT-019 Redpanda event bus setup](../tickets/TKT-019-redpanda-event-bus-setup.md)
- [TKT-020 Redis caching layer setup](../tickets/TKT-020-redis-caching-layer-setup.md)
- [TKT-021 Shared KafkaJS client package](../tickets/TKT-021-shared-kafkajs-client-package.md)
- [TKT-023 WebSocket realtime notification service](../tickets/TKT-023-websocket-realtime-notification-service.md)
- [TKT-024 Generic CRUD platform](../tickets/TKT-024-generic-crud-platform.md)

## Dependencies

- None (starting epic).
