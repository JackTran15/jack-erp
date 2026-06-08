# TKT-ITV-02 shared-interfaces: TransferOrderStatus rebuild + TransferOrder/Line field additions

## Epic

[EPIC-07062026 Phiếu Điều Chuyển Kho](../epics/EPIC-07062026-inventory-transfer-voucher.md)

## Layer

🟦 Shared types (consumed by backoffice-web).

## Summary

Cập nhật type dùng chung: rebuild enum `TransferOrderStatus` sang `DRAFT|IN_PROGRESS|COMPLETED|CANCELLED` và bổ sung field mới (kho theo dòng, đính kèm, liên kết 2 chân xuất/nhập) vào `TransferOrder`/`TransferOrderLine`. Sau khi đổi enum, **grep & sửa** mọi nơi FE/shared còn tham chiếu `APPROVED`/`EXECUTED`.

## Deliverables

- `packages/shared-interfaces/src/inventory/index.ts`:

```ts
export enum TransferOrderStatus {
  DRAFT = "DRAFT",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export interface TransferOrderLine {
  id: string;
  transferOrderId: string;
  itemId: string;
  requestedQty: number;
  sourceStorageId?: string | null;
  destinationStorageId?: string | null;
  note?: string | null;
}

export interface TransferOrder {
  id: string;
  documentNumber?: string | null;
  status: TransferOrderStatus;
  sourceBranchId: string;
  destinationBranchId: string;
  sourceStorageId?: string | null;
  destinationStorageId?: string | null;
  requestedDate?: string | null;
  notes?: string | null;          // mô tả
  attachmentIds: string[];
  exportGoodsIssueId?: string | null;
  importGoodsReceiptId?: string | null;   // import_reference
  exportedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  lines: TransferOrderLine[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
```

- Nếu `TOStatus` alias cũ tồn tại với `APPROVED`/`EXECUTED`, sửa/loại; cập nhật mọi import.

## Acceptance Criteria

- [ ] `pnpm --filter @erp/shared-interfaces build` pass; không còn `TransferOrderStatus.APPROVED`/`.EXECUTED` trong shared-interfaces.
- [ ] Tên field khớp response service (`importGoodsReceiptId` = import_reference; line có `sourceStorageId`/`destinationStorageId`).
- [ ] Không trùng/redeclare `TransferStatus`/`StockTransfer` (entity khác).

## Definition of Done

- [ ] Build shared-interfaces + `build:shared` pass.
- [ ] Grep repo (`APPROVED`/`EXECUTED` trên TransferOrder) → không còn usage chết ở shared/BE types (FE dọn ở TKT-ITV-08).
- [ ] Không Vietnamese trong file type.

## Tech Approach

Chỉ type. timestamp = `string` (ISO), qty = `number` — nhất quán file hiện tại. Việc đổi enum sẽ phá compile ở chỗ còn dùng giá trị cũ → đó là tín hiệu để dọn (BE ở TKT-ITV-03, FE ở TKT-ITV-08).

## Dependencies

- Depends on: TKT-ITV-01.
- Blocks: TKT-ITV-07.
