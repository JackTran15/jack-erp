# TKT-TWD-01 Migration + entity: session.direction + unique (branch, direction)

## Epic

[EPIC-25062026 Kho tạm theo hướng phiên](../epics/EPIC-25062026-temp-warehouse-session-direction.md)

## Summary

Thêm cột `direction` vào `temp_warehouse_sessions` để mỗi phiên mang đúng 1 hướng (`warehouse_to_showroom` / `showroom_to_warehouse`). Đổi partial unique index từ "1 phiên ACTIVE / chi nhánh" sang "1 phiên ACTIVE / (chi nhánh, hướng)" → cho phép tối đa 2 phiên ACTIVE đồng thời. Hand-written migration; `synchronize` giữ false.

## Deliverables

- `apps/api/src/database/migrations/1785200000000-AddTempWarehouseSessionDirection.ts` (new) — hand-written.
- `apps/api/src/modules/inventory/temp-warehouse/temp-warehouse-session.entity.ts` — thêm cột `direction`, cập nhật class comment.

## Acceptance Criteria

- [ ] Cột `direction varchar(30) NULL` thêm vào `temp_warehouse_sessions` (nullable cho legacy combined session; phiên mới luôn set).
- [ ] Index cũ `UQ_temp_wh_one_active_per_branch` bị drop; index mới `UQ_temp_wh_one_active_per_branch_direction` ON `(branch_id, direction) WHERE status='ACTIVE' AND deleted_at IS NULL`.
- [ ] `migration:run` rồi `migration:revert` chạy sạch (down tái tạo index cũ + drop cột).
- [ ] Không đụng `temp_warehouse_lines` (đã có `direction` riêng).

## Definition of Done

- [ ] `pnpm migration:run` xanh trên `erp` dev DB; entity khớp DB (không sinh drift mới khi `migration:generate` cho riêng bảng này).
- [ ] No schema change ngoài migration; `synchronize` false.
- [ ] No Vietnamese trong source backend (comment cột bằng English).

## Tech Approach

```ts
// 1785200000000-AddTempWarehouseSessionDirection.ts
export class AddTempWarehouseSessionDirection1785200000000 implements MigrationInterface {
  name = 'AddTempWarehouseSessionDirection1785200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "temp_warehouse_sessions"
        ADD COLUMN "direction" varchar(30) NULL
    `);
    await q.query(`
      COMMENT ON COLUMN "temp_warehouse_sessions"."direction" IS
        'warehouse_to_showroom (w2s) | showroom_to_warehouse (s2w) — NULL for legacy combined sessions'
    `);
    await q.query(`DROP INDEX IF EXISTS "UQ_temp_wh_one_active_per_branch"`);
    await q.query(`
      CREATE UNIQUE INDEX "UQ_temp_wh_one_active_per_branch_direction"
        ON "temp_warehouse_sessions" ("branch_id", "direction")
        WHERE "status" = 'ACTIVE' AND "deleted_at" IS NULL
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "UQ_temp_wh_one_active_per_branch_direction"`);
    await q.query(`
      CREATE UNIQUE INDEX "UQ_temp_wh_one_active_per_branch"
        ON "temp_warehouse_sessions" ("branch_id")
        WHERE "status" = 'ACTIVE' AND "deleted_at" IS NULL
    `);
    await q.query(`ALTER TABLE "temp_warehouse_sessions" DROP COLUMN "direction"`);
  }
}
```

```ts
// temp-warehouse-session.entity.ts — add after showroomLocationId block
@Column({
  type: 'varchar',
  length: 30,
  nullable: true,
  comment: 'warehouse_to_showroom (w2s) | showroom_to_warehouse (s2w) — direction of this session',
})
direction?: TempWarehouseDirection | null;
```

> Postgres coi mỗi `NULL` là khác biệt nên index mới không chặn nhiều legacy row `direction=NULL`; phiên mới luôn set `direction` nên ràng buộc "1 ACTIVE / (branch, direction)" có hiệu lực cho dữ liệu mới. Nhánh in-flight chưa có dữ liệu prod → không cần backfill.

## Testing Strategy

- Manual: `migration:run` → kiểm `\d temp_warehouse_sessions` có cột + index mới; `migration:revert` về trạng thái cũ.

## Dependencies

- Depends on: —
- Blocks: TKT-TWD-02, TKT-TWD-03, TKT-TWD-04
