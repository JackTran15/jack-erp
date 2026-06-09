# TKT-GRT-01 Schema + shared-interfaces

## Epic

[EPIC-08062026 Lập phiếu nhập kho từ chứng từ điều chuyển](../epics/EPIC-08062026-goods-receipt-from-transfer.md)

## Layer

🟦 Backend schema/entity + 🟪 shared types. **CÓ migration** (1 cột jsonb trên `goods_receipts`).

## Summary

Đặt nền cho round-trip header trên phiếu nhập + dòng picker import. `goods_receipts` chỉ thiếu **`references`** (providerId/deliveredBy/received_at/reference_* đã có). Thêm type `ImportableTransferOrderListItem` và mở rộng `ImportTransferOrderRequest`.

## Deliverables

- `apps/api/src/database/migrations/<ts>-AddGoodsReceiptReferences.ts` (new):
  ```sql
  ALTER TABLE "goods_receipts" ADD COLUMN "references" jsonb NOT NULL DEFAULT '[]'::jsonb
  ```
  `down`: `DROP COLUMN IF EXISTS "references"`.
- `apps/api/src/modules/inventory/goods-receipt/goods-receipt.entity.ts` — thêm:
  ```ts
  @Column({ name: 'references', type: 'jsonb', default: () => "'[]'::jsonb", comment: 'FE-supplied reference codes shown as Tham chiếu' })
  references: string[];
  ```
- `packages/shared-interfaces/src/inventory/index.ts`:
  - `ImportableTransferOrderListItem` (mirror `IssuableTransferOrderListItem`):
    ```ts
    export interface ImportableTransferOrderListItem {
      id: string;
      documentNumber: string;            // LDC
      requestedDate: string | null;      // Ngày
      notes: string | null;
      sourceBranchId: string;
      sourceBranchName: string;          // Điều chuyển từ
      exportGoodsIssueId: string | null;
      exportGoodsIssueDocumentNumber: string | null; // Số chứng từ (XK)
      totalAmount: number;               // Tổng thành tiền (Σ XK line_total)
      status: TransferOrderStatus;       // IN_PROGRESS
    }
    ```
  - Mở rộng `ImportTransferOrderRequest`:
    ```ts
    export interface ImportTransferOrderRequest {
      destinationStorageId?: string;
      providerId?: string;
      deliverer?: string;
      references?: string[];
      occurredAt?: string;
    }
    ```
    (nếu type chưa tồn tại thì tạo mới; hiện DTO chỉ có `destinationStorageId`.)

## Acceptance Criteria

- [ ] Migration chạy sạch; phiếu nhập cũ `references` = `[]`.
- [ ] Entity khớp cột; `synchronize` false; `migration:generate` không drift ngoài cột này.
- [ ] Build `@erp/shared-interfaces` xanh; type export đúng.

## Definition of Done

- [ ] `pnpm --filter @erp/api build` + `pnpm --filter @erp/shared-interfaces build` xanh.
- [ ] Không Vietnamese trong source backend.

## Dependencies

- Blocks: TKT-GRT-02.
