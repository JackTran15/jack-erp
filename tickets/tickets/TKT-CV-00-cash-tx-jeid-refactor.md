# TKT-CV-00 CashService/JournalService — TX-composable + return journalEntryId (prerequisite)

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only — refactor hạ tầng EPIC-009 đang chạy (cash/journal). Prerequisite của toàn epic.

## Summary

Hai gap nền tảng phát hiện khi đối chiếu code thực tế, chặn cả Phase 1 lẫn Phase 2:

1. **`CashService.recordMovement()` KHÔNG trả về `journalEntryId`** — hiện return `Promise<CashMovementEntity>` (`apps/api/src/modules/accounting/cash/cash.service.ts:78-81`), tạo JE nội bộ qua `journalService.post()` rồi **vứt kết quả**. Không có cột `journal_entry_id` trên `cash_movements`; liên kết JE↔movement gián tiếp qua `journal_entries.sourceReferenceId = cashMovementId` (`journal.service.ts:259 findBySourceRef`). Nhưng contract A-revised yêu cầu `createAndPostInternal()` trả `{voucherId, voucherNumber, cashMovementId, journalEntryId}` và event `CashVoucherNeededPayload` carry `journalEntryId` để `createVoucherForMovement()` link JE có sẵn.

2. **`recordMovement()` tự mở transaction riêng** (`this.dataSource.transaction(...)`, dòng 131/217) — **không nhận `EntityManager`**. Hệ quả:
   - Phase 1 `createAndPostInternal()` không thật sự atomic (movement+JE commit ở TX con, voucher INSERT ở TX khác).
   - `CashCountService.post()` dùng `SELECT cash_account FOR UPDATE` ở TX ngoài rồi gọi `recordMovement` → recordMovement mở TX riêng UPDATE cùng `cash_account` → **deadlock / lock-timeout** với lock FOR UPDATE bên ngoài.
   - Phase 2 A-revised + Outbox sụp đổ: tiền đề "1 LOCAL TX" gồm `recordMovement` + `UPDATE source` + `outbox.enqueue(manager,…)` cùng một TX. recordMovement commit độc lập → enqueue outbox **không** cùng TX với business write → dual-write gap không được đóng.

`JournalService.post()` cũng tự mở TX (`journal.service.ts:66`) — cần refactor song song để compose được trong TX của caller.

## Deliverables

- **`CashService.recordMovement(dto, actor, manager?: EntityManager)`**:
  - Khi `manager` được truyền: chạy toàn bộ logic (insert movement + update balance + post JE) **trong `manager` của caller**, KHÔNG mở `dataSource.transaction` mới.
  - Khi không truyền: giữ hành vi cũ (tự mở TX) — backward compatible.
  - Đổi return thành `{ movement: CashMovementEntity; journalEntryId: string }` (hoặc thêm field `journalEntryId` vào kết quả). Cập nhật mọi call site hiện có (`CashFromPaymentConsumer`, cash controller, test) sang shape mới.
- **`JournalService.post(dto, actor, manager?: EntityManager)`** + `reverse(..., manager?)`: nhận optional manager để chạy trong TX của caller; giữ overload cũ.
- Insufficient-balance check (`newBalance < 0 → BadRequestException`) **giữ nguyên** vị trí trong `recordMovement` (xem #6 — đã tồn tại sẵn ở dòng 201-205, không thêm mới).
- Unit test: recordMovement trong TX của caller → rollback caller ⟹ movement+JE+balance rollback theo; recordMovement trả về đúng `journalEntryId` (== `journal_entries.id` có `sourceReferenceId = movement.id`).

## Acceptance Criteria

- [x] `recordMovement(dto, actor, manager)` chạy hoàn toàn trong `manager`; không tạo nested `dataSource.transaction`.
- [x] `recordMovement()` (không manager) vẫn hoạt động như cũ — POS consumer + cash controller không vỡ.
- [x] Return chứa `journalEntryId` đúng với JE vừa post (verify `journalService.findBySourceRef(movementId)` trỏ cùng id).
- [x] `JournalService.post()` / `reverse()` nhận optional manager; gọi không-manager vẫn như cũ.
- [x] Rollback test: trong một outer TX, `recordMovement(…, manager)` rồi `throw` → không còn movement/JE/balance thay đổi.
- [x] Không deadlock: `SELECT cash_account FOR UPDATE` (outer) + `recordMovement(…, sameManager)` chạy thông suốt (cùng TX, cùng lock).
- [x] Existing POS checkout/cash regression pass.

## Definition of Done

- [x] Unit test pass: manager-mode rollback, jeId trả đúng, no-manager backward compat.
- [x] Mọi call site `recordMovement` cập nhật sang return shape mới; typecheck pass.
- [x] Source tiếng Anh.

## Tech Approach

- Pattern: tách core logic thành private `recordMovementWithManager(manager, dto, actor)`; public `recordMovement(dto, actor, manager?)` = `manager ? core(manager) : this.dataSource.transaction(core)`. Tương tự cho `JournalService.post`.
- `journalService.post()` đang được gọi bên trong recordMovement — sửa để truyền `manager` xuống, lấy về entity → expose `journalEntryId`.
- KHÔNG thêm cột `journal_entry_id` vào `cash_movements` (giữ source-of-truth là `journal_entries.sourceReferenceId`); chỉ trả jeId qua return value để caller đẩy vào event/voucher.

## Dependencies

- Phụ thuộc: EPIC-009 (`recordMovement`), TKT-015 (`JournalService`). Không cần schema mới.
- Blocks: TKT-CV-03, TKT-CV-04 (atomic `createAndPostInternal` + jeId), TKT-CV-06 (deadlock-free post), TKT-CV-17 (jeId trong event), TKT-CV-OB3 (enqueue cùng TX).
