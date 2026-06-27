# TKT-TWD-02 Shared-interfaces: session direction + DTO bodies

## Epic

[EPIC-25062026 Kho tạm theo hướng phiên](../epics/EPIC-25062026-temp-warehouse-session-direction.md)

## Summary

Cập nhật contract chia sẻ ở `@erp/shared-interfaces` cho mô hình phiên-theo-hướng: phiên mang `direction`; addLine yêu cầu `direction` + cho phép location tùy chọn; đóng phiên chuyển sang đóng gộp theo `branchId`. **Tái dùng** enum `TempWarehouseDirection` (không thêm enum; `w2s`/`s2w` chỉ là nhãn FE).

## Deliverables

- `packages/shared-interfaces/src/inventory/temp-warehouse.ts` — sửa `TempWarehouseSession`, `AddTempWarehouseLineBody`, `CloseTempWarehouseSessionBody`; thêm `CloseBranchSessionsResult`.

## Acceptance Criteria

- [ ] `TempWarehouseSession` thêm `direction: TempWarehouseDirection | null`.
- [ ] `AddTempWarehouseLineBody.direction` thành **bắt buộc**; thêm `warehouseLocationId?: string`, `showroomLocationId?: string`.
- [ ] `CloseTempWarehouseSessionBody` đổi sang `{ branchId: string; mode: TempWarehouseCloseMode }`.
- [ ] Thêm `CloseBranchSessionsResult` (mảng phiên + cờ eligibility).
- [ ] `pnpm --filter @erp/shared-interfaces build` xanh; không vỡ type chỗ tiêu thụ (BE + pos-web compile theo các ticket sau).

## Definition of Done

- [ ] `pnpm build:shared` xanh.
- [ ] Không redefine enum đã có; reuse `TempWarehouseDirection`/`TempWarehouseCloseMode`.

## Tech Approach

```ts
// TempWarehouseSession — thêm trường
export interface TempWarehouseSession {
  // ...existing...
  direction: TempWarehouseDirection | null;
  // ...
}

// addLine body
export interface AddTempWarehouseLineBody {
  branchId: string;
  itemId: string;
  direction: TempWarehouseDirection;        // was optional → required
  warehouseLocationId?: string;             // new — client-chosen, fallback resolver
  showroomLocationId?: string;              // new
  carrierUserId?: string;
  notes?: string;
  sourceLocationId?: string;
}

// combined close body (was { mode })
export interface CloseTempWarehouseSessionBody {
  branchId: string;
  mode: TempWarehouseCloseMode;
}

// combined close result
export interface CloseBranchSessionsResult {
  sessions: TempWarehouseSession[];                 // 0..2 phiên đã đóng
  netOffsetEligible: boolean;                       // 2 phiên cùng location?
  autoBalancedLines?: TempWarehouseLine[];          // chỉ khi NET_OFFSET
  publishedEvents?: { direction: TempWarehouseDirection; eventId: string }[];
}
```

> Giữ `CloseSessionResult` cũ nếu còn nơi tham chiếu; sau khi TWD-04 gỡ `POST sessions/:id/close` và TWD-07 chuyển FE, có thể xóa `CloseSessionResult` như orphan (ghi chú ở TWD-04).

## Testing Strategy

- Type-check qua build; verify thực tế ở TWD-03/04 (BE) và TWD-07 (FE).

## Dependencies

- Depends on: TKT-TWD-01
- Blocks: TKT-TWD-03, TKT-TWD-04, TKT-TWD-07
