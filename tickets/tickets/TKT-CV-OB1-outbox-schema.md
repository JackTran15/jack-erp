# TKT-CV-OB1 Transactional Outbox — schema

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only — hạ tầng dùng chung (generic), không gắn cứng cash-vouchers.

## Summary

Migration + entity cho bảng `outbox_messages` để đóng dual-write gap (event mất nếu crash giữa COMMIT và publish). Generic — mọi publisher opt-in được; epic này là consumer đầu tiên.

## Deliverables

- Migration `<timestamp>-outbox-messages.ts` (cột: `id`, `organization_id` nullable, `branch_id` nullable, `topic`, `event_id`, `partition_key` nullable, `payload jsonb`, `published_at` nullable, `attempts` default 0, `next_attempt_at` default now(), `last_error` nullable, `created_at`).
- Partial index:
  ```sql
  CREATE INDEX idx_outbox_pending
    ON outbox_messages (next_attempt_at)
    WHERE published_at IS NULL;
  ```
- `OutboxMessageEntity` trong `modules/events/outbox/`.

## Acceptance Criteria

- [x] Migration up/down sạch; bảng generic (không FK cứng tới cash-vouchers).
- [x] `event_id` lưu được uuid deterministic; `payload` lưu full `DomainEvent<T>`.
- [x] Partial index chỉ index row `published_at IS NULL` (scan rẻ cho poller).
- [x] `pnpm migration:revert` drop bảng + index.

## Definition of Done

- [x] PR có migration + entity; pass build.
- [x] Migration test trên staging.
- [x] Source tiếng Anh.

## Tech Approach

- Đặt trong `modules/events/outbox/` (shared infra), đăng ký entity ở `EventsModule`.
- Hand-write migration.

## Dependencies

- Phụ thuộc: Phase 1 done; `EventsModule` hiện có (TKT-047 DLQ infra).
- Blocks: TKT-CV-OB2, và là prerequisite cho publish của TKT-CV-15/16/17 (qua OB3).
