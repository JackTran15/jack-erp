# TKT-023 WebSocket realtime notification service

## Epic

[EPIC-001 Foundation and Monorepo](../epics/EPIC-001-foundation-and-monorepo.md)

## Summary

Implement a `socket.io` realtime gateway/service to push acknowledgements and notifications so clients can avoid polling for async updates.

## Deliverables

- Authenticated `socket.io` gateway in `apps/api`.
- Redis adapter integration for cross-node event propagation.
- Channel scoping for organization, branch, user, and session contexts.
- Event contracts with `correlationId` for request-to-event mapping.
- Sticky-session ingress/load-balancer policy for polling-enabled environments.
- Push notifications for:
  - inventory import status
  - POS checkout acknowledgement
  - report completion
  - reconciliation completion

## Acceptance Criteria

- Supported clients receive near real-time status updates via WebSocket.
- Branch and role access control is enforced for subscriptions.
- Event payloads are idempotent-friendly and include correlation metadata.
- Multi-instance deployment receives and emits notifications consistently via Redis adapter.

## Dependencies

- [TKT-003 API app bootstrap](./TKT-003-api-app-bootstrap.md)
- [TKT-021 Shared KafkaJS client package](./TKT-021-shared-kafkajs-client-package.md)
- [TKT-020 Redis caching layer setup](./TKT-020-redis-caching-layer-setup.md)
