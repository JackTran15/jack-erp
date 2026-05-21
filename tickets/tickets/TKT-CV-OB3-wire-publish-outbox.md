# TKT-CV-OB3 Wire publish qua outbox

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only.

## Summary

Thay mọi `await publisher.publish()` sau commit trong epic bằng `outbox.enqueue(manager, …)` trong cùng TX, với `event_id` deterministic theo `(sourceType, sourceId)`. Đóng dual-write gap cho toàn bộ flow Phase 2.

## Deliverables

- Wire qua outbox:
  - 3 source `needed.*` (TKT-CV-17: debt / GR / expense).
  - `cash.voucher.created` ở voucher consumer (TKT-CV-15).
  - POS `needed.pos_sale` (TKT-CV-16).
- `event_id = uuidv5(ns, 'cash.voucher.needed:{sourceType}:{sourceId}')` (deterministic).
- E2E crash-recovery scenario (relay tắt → source POST → bật relay → voucher xuất hiện ≤ Ns).

## Acceptance Criteria

- [ ] **(partial)** Không còn `await publisher.publish()` sau commit trong các flow epic này. ✅ 3 source `needed.*` (debt/GR/expense) qua `outbox.enqueue(manager, …)` trong TX. ⛔ POS `needed.pos_sale` (vẫn qua `CashFromPaymentPublisher`) và `cash.voucher.created` ở consumers vẫn publish trực tiếp — follow-up.
- [x] `event_id` deterministic theo `(sourceType, sourceId)` (`uuidv5`); replay → consumer `tryClaim` skip + `uniq_*_reference` + pre-check `findByReference` → không voucher trùng.
- [x] Source TX rollback (insufficient balance) → outbox row cũng rollback, KHÔNG publish (asserted trong phase2 E2E + unit).
- [x] Relay tắt: source POST 200 + 1 outbox row `published_at NULL`; `pollOnce()` → publish, voucher xuất hiện — tự recovery (phase2 E2E).
- [x] At-least-once: `OutboxRelay` republish khi crash trước mark (unit-tested); consumer dedupe đảm bảo không tạo voucher/JE thứ 2.

## Definition of Done

- [x] E2E crash-recovery (relay tắt → `pollOnce` → voucher) trong `cash-vouchers-phase2.e2e-spec.ts`.
- [ ] **(partial)** Tất cả publish point trong epic dùng outbox — POS + `cash.voucher.created` chưa wire (follow-up).
- [x] Source tiếng Anh.

## Tech Approach

- `enqueue` nhận `manager` từ TX của source/consumer.
- Immediate dispatch (best-effort) để happy path nhanh; poller là lưới an toàn.

## Dependencies

- Phụ thuộc: **TKT-CV-00** (enqueue chỉ đóng được dual-write gap khi `recordMovement` + `UPDATE source` + `outbox.enqueue` cùng 1 TX — cần recordMovement nhận `manager`), TKT-CV-OB2 (service+relay), TKT-CV-15, TKT-CV-16, TKT-CV-17.
- Blocks: TKT-CV-23.
