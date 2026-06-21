# TKT-FND-02 Kho nhập hàng mặc định + chặn xoá showroom + đổi nhãn

## Epic

[EPIC-18062026 Inventory Foundation](../epics/EPIC-18062026-inventory-foundation.md)

## Layer

🟦 Backend (migration + CQRS command + guard) + 🟩 Frontend (toggle + ẩn nút xoá).

## Summary

Thêm khái niệm **"Kho nhập hàng mặc định"** (`isDefaultReceiving`) **tách biệt** với showroom (`isMainStorage`). Mỗi chi nhánh **≤ 1** kho mặc định, đổi thì tự gỡ cờ kho cũ (đảm bảo bằng **partial unique index** + command transaction). Showroom tự sinh (`isMainStorage = true`) **không được xoá**. Đổi nhãn cột "Kho chính" → **"Kho nhập hàng mặc định"** (bind `isDefaultReceiving`).

## Deliverables

- `apps/api/src/database/migrations/<ts>-AddStorageDefaultReceiving.ts` (mới, tay):
  ```sql
  ALTER TABLE storages ADD COLUMN is_default_receiving boolean NOT NULL DEFAULT false;
  CREATE UNIQUE INDEX "UQ_storages_default_receiving_per_branch"
    ON storages (branch_id) WHERE is_default_receiving = true;
  ```
- `apps/api/src/modules/inventory/location/storage.entity.ts` — thêm:
  ```ts
  @Column({ name: 'is_default_receiving', default: false, comment: "Branch's default warehouse for inbound goods (one per branch)" })
  isDefaultReceiving: boolean;
  ```
- `apps/api/src/modules/inventory/location/commands/set-default-receiving-warehouse.command.ts` + `.handler.ts` — `@CommandHandler`: transaction → `UPDATE storages SET is_default_receiving=false WHERE branch_id=:b AND is_default_receiving` rồi set `true` cho `:id` (validate kho thuộc `actor.branchId` + `organizationId`); publish `inventory.storage.default_receiving_changed` (eventId = `storage-default:{branchId}:{storageId}`).
- `apps/api/src/modules/inventory/location/controllers/storage-default-receiving.controller.ts` — `POST /v2/inventory/storages/:id/set-default-receiving`, guards + `@RequirePermission('inventory.write')` + `@RequireBranchScope()`, dispatch `CommandBus`. (Kế thừa `IdempotencyInterceptor`.)
- `apps/api/src/modules/inventory/location/storage-crud.service.ts`:
  - **Override `remove()`** chặn xoá khi `isMainStorage === true` → ném `ConflictException('Cannot delete the auto-generated showroom storage')`.
  - CrudEntityConfig: **bỏ** field hiển thị `isMainStorage` label 'Kho chính'; **thêm** `{ key: 'isDefaultReceiving', label: 'Kho nhập hàng mặc định', type: 'boolean' }` + filter tương ứng. `isMainStorage` chuyển `hideInList: true, readOnly: true`.
- `apps/backoffice-web/src/pages/inventory/InventoryStoragesPage.tsx` (+ CRUD list/form):
  - Toggle "Kho nhập hàng mặc định" gọi `POST /v2/.../set-default-receiving` (không update qua CRUD patch để giữ ràng buộc single-default).
  - Ẩn/disable nút **Xoá** khi `isMainStorage` hoặc khi kho là kho đang chọn của chi nhánh hiện tại ("đang chọn nó thì không được xoá").

## Acceptance Criteria

- [ ] `is_default_receiving` thêm mới, default false; partial unique index đảm bảo ≤ 1 kho mặc định/chi nhánh ở tầng DB.
- [ ] `POST /v2/.../set-default-receiving` gỡ cờ kho cũ + set kho mới trong 1 transaction; idempotent; phát event.
- [ ] Xoá showroom (`isMainStorage`) trả 409 ở BE; FE ẩn nút xoá cho showroom & kho đang chọn.
- [ ] Nhãn FE hiển thị "Kho nhập hàng mặc định"; không còn "Kho chính".
- [ ] Mọi query lọc `organizationId` + `branchId`; không rò rỉ chéo.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass; migration `migration:run` sạch, `migration:revert` đảo được.
- [ ] Handler spec: set default chuyển cờ; double-set idempotent; reject kho khác branch.
- [ ] `pnpm openapi:generate` chạy, snapshot + `schema.ts` commit.
- [ ] Source/Swagger tiếng Anh.

## Tech Approach

- Single-default đảm bảo **2 lớp**: partial unique index (chống race ở DB) + command (UX gỡ cờ cũ). Bắt lỗi unique → map về 409 thân thiện.
- Override `remove()` là hook entity-specific của `BaseCrudService` (không phải sửa generic platform core).

## Dependencies

- Requires: branch auto-create showroom (`branch.service.ts`) — đã có.
- Blocks: TKT-FND-03 (resolve dùng `isDefaultReceiving` làm fallback kho).
