# TKT-ITV-05 RBAC: inventory.transfer.export + .import + VI labels

## Epic

[EPIC-07062026 Phiếu Điều Chuyển Kho](../epics/EPIC-07062026-inventory-transfer-voucher.md)

## Layer

🟦 Backend only (RBAC seed).

## Summary

Phiếu 2 pha có action `export`/`import` thay cho `approve`/`execute` cũ. Thêm 2 permission mới, **tái dùng** `inventory.transfer.read/create/cancel` đã có. `inventory.transfer.approve` trở thành legacy (giữ để không vỡ role cũ, không gán cho route mới).

## Deliverables

- `apps/api/src/modules/rbac/permissions.seed.ts` — thêm vào `PERMISSION_DEFINITIONS` (cụm inventory, cạnh `inventory.transfer.*`):

```ts
{ key: "inventory.transfer.export", module: "inventory" },
{ key: "inventory.transfer.import", module: "inventory" },
```

- `PERMISSION_LABELS_VI` — thêm nhãn:
  - `inventory.transfer.export` → "Xác nhận xuất kho (điều chuyển)"
  - `inventory.transfer.import` → "Xác nhận nhập kho (điều chuyển)"
- Gán 2 permission cho role admin/quản lý kho theo đúng nơi `inventory.transfer.create/.cancel` đang được gán.

## Acceptance Criteria

- [ ] Sau seed có `inventory.transfer.export` + `inventory.transfer.import` (module inventory, có nhãn VI).
- [ ] Admin gọi được `/export` + `/import` (không 403); route cũ approve/execute đã xoá (404).
- [ ] Không đổi tên/khoá `inventory.transfer.read/create/cancel/approve` cũ.

## Definition of Done

- [ ] Re-run seed idempotent (không nhân bản dòng).
- [ ] `pnpm --filter @erp/api test` pass.

## Tech Approach

Mirror format entry `inventory.transfer.*` hiện có. Description tự sinh từ `PERMISSION_LABELS_VI` (thiếu nhãn → fallback key, nên phải thêm).

## Dependencies

- Depends on: none.
- Blocks: TKT-ITV-04, TKT-ITV-09.
