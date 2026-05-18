# TKT-067 Temp warehouse schema & migration

## Epic

[EPIC-15052026 Temporary Warehouse Session](../epics/EPIC-15052026-temporary-warehouse-session.md)

## Summary

Một migration TypeORM duy nhất tạo 2 bảng mới cho Kho Tạm: `temp_warehouse_sessions` (header, kèm cột tracking transfer status để consumer cập nhật) và `temp_warehouse_lines` (chi tiết). Bao gồm partial unique index đảm bảo mỗi branch chỉ có 1 session `ACTIVE` tại một thời điểm.

## Deliverables

- 1 migration file `apps/api/src/database/migrations/<timestamp>-TempWarehouseSession.ts`.
- Down migration đảo ngược được (drop 2 bảng + indexes).

## Acceptance Criteria

- [ ] Migration up chạy thành công, tạo đủ 2 bảng + indexes + FK.
- [ ] Insert 2 row vào `temp_warehouse_sessions` cùng `branch_id` cùng `status='ACTIVE'` → fail vì partial unique index.
- [ ] Insert 1 row `status='ACTIVE'` + 1 row `status='CLOSED'` cùng `branch_id` → OK.
- [ ] FK `session_id` của `temp_warehouse_lines` có `ON DELETE CASCADE`.
- [ ] FK `carrier_user_id` có `ON DELETE SET NULL`.
- [ ] CHECK constraint `quantity > 0` enforce.
- [ ] Migration down drop sạch cả 2 bảng + indexes, idempotent.

## Definition of Done

- [ ] PR có migration file; pass CI lint + build.
- [ ] Migration test trên staging replica, snapshot DB trước/sau.
- [ ] Đã thử rollback (down) trên staging và re-up lại → schema identical.

## Tech Approach

### Bảng `temp_warehouse_sessions`

```sql
CREATE TABLE temp_warehouse_sessions (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id          UUID NOT NULL,
  branch_id                UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  status                   VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  close_mode               VARCHAR(20) NULL,        -- NET_OFFSET | CREATE_TRANSFERS | NONE
  warehouse_location_id    UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  showroom_location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  opened_by                UUID NOT NULL,
  opened_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_by                UUID NULL,
  closed_at                TIMESTAMPTZ NULL,

  -- Tracking transfer creation (consumer ghi sau khi xử lý CREATE_TRANSFERS event)
  transfer_processing_status VARCHAR(20) NOT NULL DEFAULT 'NONE',
                                                    -- NONE | PENDING | COMPLETED | FAILED
  transfer_w2s_id          UUID NULL REFERENCES stock_transfers(id) ON DELETE SET NULL,
  transfer_s2w_id          UUID NULL REFERENCES stock_transfers(id) ON DELETE SET NULL,
  transfer_failure_reason  TEXT NULL,

  notes                    TEXT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at               TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX uq_temp_warehouse_one_active_per_branch
  ON temp_warehouse_sessions(branch_id)
  WHERE status = 'ACTIVE' AND deleted_at IS NULL;

CREATE INDEX idx_temp_wh_sessions_org_status
  ON temp_warehouse_sessions(organization_id, status);

CREATE INDEX idx_temp_wh_sessions_processing
  ON temp_warehouse_sessions(transfer_processing_status)
  WHERE transfer_processing_status IN ('PENDING', 'FAILED');
```

### Bảng `temp_warehouse_lines`

```sql
CREATE TABLE temp_warehouse_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL,
  session_id        UUID NOT NULL REFERENCES temp_warehouse_sessions(id) ON DELETE CASCADE,
  item_id           UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  direction         VARCHAR(30) NOT NULL,
  quantity          NUMERIC(18,2) NOT NULL CHECK (quantity > 0),
  carrier_user_id   UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  superseded_by_id  UUID NULL REFERENCES temp_warehouse_lines(id) ON DELETE SET NULL,
  notes             TEXT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_temp_wh_lines_session_status ON temp_warehouse_lines(session_id, status);
CREATE INDEX idx_temp_wh_lines_session_item   ON temp_warehouse_lines(session_id, item_id);
```

### Giá trị enum hợp lệ (validate ở app layer)

- `status` của session: `ACTIVE | CLOSED`
- `close_mode`: `NET_OFFSET | CREATE_TRANSFERS | NONE` (NULL khi session còn ACTIVE)
- `transfer_processing_status`: `NONE | PENDING | COMPLETED | FAILED`
  - `NONE`: chưa close hoặc close với mode NET_OFFSET/NONE
  - `PENDING`: close với CREATE_TRANSFERS, event đã publish, consumer chưa xử lý xong
  - `COMPLETED`: consumer tạo xong cả 2 transfer (hoặc 1 nếu chỉ 1 chiều có line)
  - `FAILED`: consumer đẩy DLQ, `transfer_failure_reason` chứa lỗi
- `direction`: `warehouse_to_showroom | showroom_to_warehouse`
- `status` của line: `ACTIVE | DELETED | AUTO_BALANCED`

## Testing Strategy

- Migration test trên DB staging replica có 5 branch giả lập.
- Assert: insert 2 session `ACTIVE` cùng branch fail; close session 1 → mở session 2 thành công.
- Assert: cascade delete session → tất cả line liên quan bị xoá.
- Assert: drop một `stock_transfers` → `transfer_w2s_id` set NULL (ON DELETE SET NULL hoạt động).
- Rollback: down rồi up lại → `\d temp_warehouse_sessions` identical.

## Dependencies

- Phụ thuộc: EPIC-003 (`branches`, `locations`, `items`, `users`, `stock_transfers` đã có).
- Blocks: TKT-068.
