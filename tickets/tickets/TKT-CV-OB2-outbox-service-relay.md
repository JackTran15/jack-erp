# TKT-CV-OB2 Transactional Outbox — service + relay

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only — hạ tầng dùng chung.

## Summary

`OutboxService.enqueue()` (insert event trong cùng TX với business write) + `OutboxRelayService` (poller publish at-least-once, backoff, cleanup). Khép kín bất biến "COMMIT ⟹ event chắc chắn publish".

## Deliverables

- `OutboxService.enqueue(manager, topic, event, key?)` — **bắt buộc nhận `EntityManager`** của TX hiện tại (không tự mở TX riêng).
- `OutboxRelayService`:
  - Poll `WHERE published_at IS NULL AND next_attempt_at <= now() ORDER BY created_at LIMIT N FOR UPDATE SKIP LOCKED` → publish Kafka → set `published_at`.
  - Lỗi → `attempts++`, `last_error`, `next_attempt_at = now() + backoff(attempts)`.
  - Cleanup job định kỳ `DELETE WHERE published_at < now() - interval '7 days'`.
  - (Tùy chọn) immediate dispatch best-effort sau commit cho latency happy path ≤ 2s.
- Add dep `@nestjs/schedule` (`@Interval`) hoặc `setInterval` trong `OnApplicationBootstrap` + `clearInterval` trong `OnModuleDestroy`.
- Register + export `OutboxService` trong `EventsModule`.
- Unit test.

## Acceptance Criteria

- [x] `enqueue()` insert nằm trong source TX → rollback source ⟹ outbox row cũng rollback.
- [x] Relay publish → mark `published_at`.
- [x] Crash sau publish, trước mark `published_at` → republish lần 2 (at-least-once); consumer dedupe đảm bảo idempotent.
- [x] Backoff tăng theo `attempts` sau lỗi; row không bị poll lại trước `next_attempt_at`.
- [x] `FOR UPDATE SKIP LOCKED`: 2 relay instance chạy song song không double-publish cùng row.
- [x] Cleanup xóa row đã publish > 7 ngày.

## Definition of Done

- [x] Unit test: publish→mark; republish khi crash trước mark (idempotent qua eventId); backoff; SKIP LOCKED multi-instance; `enqueue()` rollback cùng source TX.
- [x] Source tiếng Anh.

## Tech Approach

- Relay là at-least-once; idempotency thực sự do consumer (`processed_events`) + unique constraint đảm nhận.
- Poller batch nhỏ (LIMIT N) để tránh long transaction.

## Dependencies

- Phụ thuộc: TKT-CV-OB1 (schema), `EventPublisher` hiện có.
- Blocks: TKT-CV-OB3.
