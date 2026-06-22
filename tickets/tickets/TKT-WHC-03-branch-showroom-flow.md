# TKT-WHC-03 Branch flow: showroom WH-code + default receiving

## Epic

[EPIC-21062026 Warehouse Code Auto-Generation](../epics/EPIC-21062026-warehouse-code-autogen.md)

## Summary

Cập nhật `BranchService.create` để showroom storage tự sinh ra khi tạo chi nhánh có **mã WH** và được đánh dấu **`isDefaultReceiving = true`**. Hiện tại storage này tạo với `code` rỗng và không set `isDefaultReceiving` — nên chi nhánh mới không có kho nhập hàng mặc định (migration cũ chỉ backfill main storage *đã tồn tại*).

## Deliverables

- `apps/api/src/modules/branch/branch.service.ts` — trong `create()`:
  - Sinh mã `WH` qua `DocumentNumberingService.generate(DocumentType.WAREHOUSE, branchId, actor)` cho showroom `StorageEntity`.
  - Set `isDefaultReceiving: true` khi `manager.create(StorageEntity, { ... })`.
- `apps/api/src/modules/branch/branch.module.ts` — import `DocumentNumberingModule` (hoặc đảm bảo `DocumentNumberingService` khả dụng để inject).

## Acceptance Criteria

- [ ] Tạo chi nhánh mới → showroom `StorageEntity` có `code` khớp định dạng `WH\d{6}` và `isDefaultReceiving = true`, `isMainStorage = true`.
- [ ] Đúng 1 storage `isDefaultReceiving = true` / branch — không vi phạm `UQ_storages_default_receiving_per_branch`.
- [ ] Toàn bộ vẫn nằm trong cùng transaction tạo branch/storage/showroom/location (atomic). `generate` được gọi **trước** khi mở transaction để tránh nested-tx.
- [ ] Tạo branch vẫn idempotent (kế thừa `IdempotencyInterceptor`); với chi nhánh đầu tiên (`actor.branchId` có thể `undefined`) generate vẫn rơi về rule org-level và trả mã hợp lệ.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh.
- [ ] Spec `branch.service.spec.ts`: showroom storage có `code` WH + `isDefaultReceiving = true`.
- [ ] Không Vietnamese trong source backend.

## Tech Approach

```ts
// branch.service.ts — trong create(), trước dataSource.transaction(...)
const showroomCode = await this.docNumbering.generate(
  DocumentType.WAREHOUSE,
  actor.branchId, // org-level fallback khi tạo chi nhánh đầu tiên
  actor,
);
// ... bên trong transaction:
const storage = await manager.save(
  manager.create(StorageEntity, {
    name: showroomName,
    code: showroomCode,
    isMainStorage: true,
    isDefaultReceiving: true, // <-- mới
    branchId: branch.id,
    organizationId: branch.organizationId,
    createdBy: actor.userId,
  }),
);
```

## Testing Strategy

- Unit (`branch.service.spec.ts`): mock `DocumentNumberingService`; assert storage tạo ra có `code` + `isDefaultReceiving=true`.
- E2E (tùy chọn, nếu chạy `test:e2e`): tạo branch qua API → GET storages của branch → đúng 1 default receiving + có mã.

## Dependencies

- Depends on: TKT-WHC-01
- Blocks: —
