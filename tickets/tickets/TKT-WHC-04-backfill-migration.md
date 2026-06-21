# TKT-WHC-04 Migration backfill mã kho + seed counter

## Epic

[EPIC-21062026 Warehouse Code Auto-Generation](../epics/EPIC-21062026-warehouse-code-autogen.md)

## Summary

Migration tay: gán mã `WH` cho mọi storage đang `code IS NULL` (bao gồm showroom storage cũ do branch flow tạo) và đẩy counter `WAREHOUSE` của từng org lên high-water mark để runtime `generate` tiếp tục **không trùng** mã đã backfill.

## Deliverables

- `apps/api/src/database/migrations/<timestamp>-BackfillStorageCode.ts` (mới, timestamp > `1784500000000`) — hand-written.

Logic `up()` (mỗi `organization_id`):
1. Đánh số storage `code IS NULL` theo thứ tự ổn định (`created_at, id`) → `WH` + 6 chữ số, bắt đầu từ `max(existing WH seq)+1` của org đó (an toàn nếu một số storage đã có mã WH).
2. Upsert `document_number_rules` cho `(organization_id, document_type='WAREHOUSE', branch_id IS NULL, is_active=true)` với `prefix='WH'`, padding 6, reset `NEVER` — khớp `DEFAULT_DOC_NUMBER_CONFIG`.
3. Upsert `document_number_counters` cho rule trên với `period_key` ứng với reset `NEVER` (xác nhận `computeResetKey('NEVER')` trả về hằng số — vd `'ALL'`/`''`) và `current_value = ` tổng số đã cấp (high-water).

`down()`: set `code = NULL` lại cho các storage được backfill (best-effort) — hoặc no-op an toàn nếu khó xác định; ưu tiên không phá dữ liệu.

## Acceptance Criteria

- [ ] Sau `migration:run`: **không** còn storage `code IS NULL`.
- [ ] Mã backfill duy nhất trong phạm vi org, đúng định dạng `WH\d{6}`.
- [ ] `generate(WAREHOUSE, …)` chạy sau migration trả mã **lớn hơn** mọi mã đã backfill (counter đã ở high-water) — không trùng.
- [ ] Khớp tên cột thực tế của `document_number_rules`/`document_number_counters` (xác nhận `reset_policy`/`reset_period`, `period_key`, `current_value` trước khi viết SQL).

## Definition of Done

- [ ] `pnpm migration:run` chạy sạch trên DB local; `migration:revert` không lỗi.
- [ ] `synchronize` vẫn false; không đổi schema ngoài migration này.
- [ ] Verify thủ công: đếm `storages WHERE code IS NULL` = 0; tạo 1 storage mới → mã nối tiếp không trùng.
- [ ] Không Vietnamese trong source backend.

## Tech Approach

- Xác nhận cột rule/counter từ `document-number-rule.entity.ts` + `document-number-counter.entity.ts` (đặc biệt enum `ResetPolicy` và `computeResetKey` cho `NEVER`) trước khi viết SQL — không đoán.
- Backfill bằng `UPDATE ... FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at, id) ...)` cộng offset = max seq hiện có của org.
- Seed rule/counter bằng `INSERT ... ON CONFLICT DO UPDATE` theo unique scope của bảng.

## Testing Strategy

- Verify trên DB local (seed `pnpm seed:inventory` để có storage `code` NULL, chạy migration, kiểm tra).
- E2E (tùy chọn): global-setup `erp_test` đã apply migrations; thêm assertion không còn NULL nếu cần.

## Dependencies

- Depends on: TKT-WHC-01 (prefix/format `WH`)
- Phối hợp với: TKT-WHC-02/03 (cùng prefix `WH`, padding 6 để counter khớp)
- Blocks: —
