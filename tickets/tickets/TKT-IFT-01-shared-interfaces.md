# TKT-IFT-01 shared-interfaces: GoodsIssueReferenceType.TRANSFER_ORDER + picker/export types

## Epic

[EPIC-08062026 Lập phiếu xuất kho từ Lệnh điều chuyển](../epics/EPIC-08062026-goods-issue-from-transfer.md)

## Layer

🟦 Shared package (`@erp/shared-interfaces`).

## Summary

Bổ sung hợp đồng kiểu cho cả BE và FE: thêm giá trị enum `GoodsIssueReferenceType.TRANSFER_ORDER`, type dòng cho dialog picker (`IssuableTransferOrderListItem`, có `destinationBranchName` inline), và type body export kèm dòng đã sửa (`ExportTransferOrderRequest`). Không tạo lại type đã có (`TransferOrder`, `TransferOrderStatus` do EPIC-07062026 sở hữu).

## Deliverables

- `packages/shared-interfaces/src/inventory/index.ts`:
  - Thêm `TRANSFER_ORDER = "TRANSFER_ORDER"` vào enum `GoodsIssueReferenceType` (hiện chỉ có `STOCK_TAKE`).
  - `IssuableTransferOrderListItem` — dòng kết quả picker:
    ```ts
    export interface IssuableTransferOrderListItem {
      id: string;
      documentNumber: string;          // LDC…
      requestedDate: string | null;    // ISO; fallback createdAt
      notes: string | null;            // "Lý do"
      destinationBranchId: string;
      destinationBranchName: string;   // "Điều chuyển đến" — inline, không root map
      status: TransferOrderStatus;     // luôn DRAFT trong scope picker
    }
    ```
  - `ExportTransferOrderLine` + `ExportTransferOrderRequest` — body của `POST /:id/export` khi lưu từ form:
    ```ts
    export interface ExportTransferOrderLine {
      itemId: string;
      locationId: string;
      quantity: number;
      unitPrice?: number;
      notes?: string;
    }
    export interface ExportTransferOrderRequest {
      lines?: ExportTransferOrderLine[]; // bỏ trống → BE derive như nút export cũ
      reason?: string;
      notes?: string;
    }
    ```
- Build lại package: `pnpm --filter @erp/shared-interfaces build` (postinstall/`build:shared`).

## Acceptance Criteria

- [ ] `GoodsIssueReferenceType.TRANSFER_ORDER` tồn tại; không phá vỡ union hiện dùng cho `STOCK_TAKE`.
- [ ] Type picker/export export ra từ `@erp/shared-interfaces` và import được ở `apps/api` + `apps/backoffice-web`.
- [ ] Không định nghĩa lại `TransferOrder`/`TransferOrderStatus`/`TransferOrderLine` (đã có ở ITV-02).

## Definition of Done

- [ ] `pnpm --filter @erp/shared-interfaces build` xanh; `tsc` toàn workspace không lỗi type mới.
- [ ] Không Vietnamese trong identifier/enum value.
- [ ] Không đổi schema, không đụng generated `api-client`.

## Tech Approach

Chỉ thêm field/enum-value, không sửa shape cũ. Type body export đặt cạnh các type transfer-order hiện hữu để FE/BE cùng tham chiếu một nguồn.

## Dependencies

- Depends on: EPIC-07062026 (ITV-02 đã có `TransferOrderStatus`/`TransferOrder`).
- Blocks: TKT-IFT-02, TKT-IFT-04.
