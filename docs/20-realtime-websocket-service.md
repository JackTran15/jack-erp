# Realtime WebSocket Service

## Purpose

Provide push-based acknowledgements and notifications to clients so they do not rely on polling for long-running or asynchronous operations.

## Primary Use Cases

- Inventory CSV import/export job status updates.
- POS checkout acknowledgement and receipt-ready events.
- Reconciliation completion notifications.
- Reporting job completion and file-ready notifications.
- High-priority operational alerts (example: stock threshold or variance alerts).

## Service Model

- NestJS `socket.io` gateway with authenticated channels.
- `socket.io` Redis adapter for multi-instance pub/sub fan-out.
- Event publication triggered by domain events and async worker outcomes.
- Backpressure-safe fan-out using scoped channels.

## Channel Scope

- Organization-scoped channels.
- Branch-scoped channels.
- User-scoped channels (private notifications).
- Session-scoped channels (example: active POS session).

## Event Contract Principles

- Every event includes:
  - `eventId`
  - `eventType`
  - `timestamp`
  - `organizationId`
  - `branchId` (if applicable)
  - `correlationId` (ties event to API request/job)
  - `payload`
- Support client acknowledgement semantics for critical events.
- Clients are expected to be idempotent against repeated delivery.

## Reliability Rules

- WebSocket delivery is near real-time but not a replacement for source-of-truth REST reads.
- Missed events are recoverable by querying status endpoints.
- Event ordering is guaranteed per logical stream where required (example: job state changes).
- Sticky-session policy:
  - required at ingress/load balancer when long-polling transport is enabled
  - recommended in production even when using WebSocket-only transport
- Redis adapter is required for cross-instance event propagation and room synchronization.

## Security and Authorization

- WebSocket handshake uses authenticated token.
- Channel subscription is validated against role and branch scope.
- Unauthorized subscriptions are rejected and logged.

## Transport and Scaling Defaults

- Preferred transport: WebSocket.
- Fallback transport: polling (optional by environment policy).
- If polling is enabled, sticky-session must be enabled.
- Deployment baseline for clustered API nodes:
  - `socket.io` server per node
  - shared Redis adapter backend
  - sticky-session at gateway/load balancer

## Acceptance Criteria

- Users receive push updates for async operations without periodic polling.
- Critical acknowledgements include correlation IDs and status payloads.
- Branch and role scoping is enforced for all emitted notifications.
- Realtime events are delivered across multiple API instances consistently.
