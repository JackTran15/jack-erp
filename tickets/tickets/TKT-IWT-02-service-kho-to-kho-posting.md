# TKT-IWT-02 DTO + Service: kho→kho posting (cùng chi nhánh, định giá, 2 chân ledger trong 1 tx)

## Epic

[EPIC-09062026 Chuyển kho giữa các kho trong cùng chi nhánh](../epics/EPIC-09062026-inter-warehouse-transfer.md)

## Layer

🟦 Backend only (service + DTO).

## Summary

Logic nghiệp vụ chính. Mở rộng request contract + `StockTransferService` để: nhận Kho xuất/Kho nhập theo dòng, **bắt buộc mọi storage thuộc `actor.branchId`** (cùng chi nhánh), resolve vị trí mặc định khi bỏ trống, tính đơn giá/thành tiền, và **tạo + post nguyên tử** (ghi `TRANSFER_OUT` rồi `TRANSFER_IN` trong 1 transaction có khóa bi quan kiểm tra tồn). Tái dùng `createAndPost`/`post` hiện có thay vì viết path mới.

## Deliverables

- `apps/api/src/modules/inventory/transfer/stock-transfer.service.ts`:
  - Mở rộng `interface CreateTransferDto` + line: thêm `sourceStorageId`, `destinationStorageId` (per line), `unitPrice?`, `transporterUserId?`, `attachmentIds?: string[]`, `transferredAt?: string`.
  - **`resolveDefaultLocation(storageId)`** (helper mới): tìm location `is_unassigned = true` của storage; ném `BadRequestException` nếu kho chưa có vị trí mặc định.
  - **Validate cùng chi nhánh** trong `create()`: load mọi `storageId` referenced (`sourceStorageId`/`destinationStorageId` toàn bộ dòng), assert `storage.organizationId === actor.organizationId && storage.branchId === actor.branchId`; sai → `BadRequestException('Stock transfer is only allowed between storages in the same branch')`. Set `sourceBranchId = destinationBranchId = actor.branchId`.
  - **Resolve vị trí/dòng**: `effSrcLoc = line.sourceLocationId ?? resolveDefaultLocation(line.sourceStorageId)`; `effDstLoc = line.destinationLocationId ?? resolveDefaultLocation(line.destinationStorageId)`. Reject no-op: dòng có `effSrcLoc === effDstLoc` (cùng kho + cùng vị trí) → `BadRequestException` "source and destination must differ".
  - **Định giá**: nếu `unitPrice` rỗng → dùng `itemCostSnapshotService.snapshotCosts(org, itemIds)`; `lineValue = unitPrice × quantity` (giữ 2 chữ số, lưu string).
  - **Validate transporter**: nếu có `transporterUserId`, kiểm tra user thuộc org (query users repo / inject UsersService); sai → `BadRequestException`.
  - Lưu `transporterUserId`, `attachmentIds`, `transferredAt` (mặc định `new Date()` khi post nếu rỗng) lên header; lưu `sourceStorageId`/`destinationStorageId`/`unitPrice`/`lineValue` lên từng line.
  - **`post()`**: bổ sung khóa bi quan kiểm tra tồn tại `(item, effSrcLoc)` (`SELECT … FOR UPDATE` trên `StockBalanceEntity`, tái dùng pattern từ `postIntraWarehouseMoves`) **trước** khi `recordBatchMovements`; thiếu tồn → `BadRequestException` (rollback). Mỗi dòng push `TRANSFER_OUT` (locationId=effSrcLoc, branchId=actor.branchId, qty=−line.qty, unitCost=unitPrice) và `TRANSFER_IN` (locationId=effDstLoc, qty=+line.qty, unitCost=unitPrice), `referenceType='TRANSFER'`. Giữ publish event sau commit.

## Acceptance Criteria

- [ ] Tạo phiếu với dòng Kho xuất ≠ Kho nhập (cùng chi nhánh) → `stock_balances` kho xuất −qty, kho nhập +qty; phiếu POSTED có `documentNumber`.
- [ ] Bất kỳ storage thuộc chi nhánh khác → 400, không ghi bất kỳ ledger nào.
- [ ] Dòng bỏ trống Vị trí xuất/nhập → ghi sổ vào location `is_unassigned` của kho tương ứng.
- [ ] `unitPrice` rỗng → lấy giá vốn snapshot; `lineValue = unitPrice × quantity`; tổng `line_value` 2 chân net 0 theo giá vốn.
- [ ] Tồn không đủ tại vị trí xuất → 400 (khóa bi quan), không ghi sổ.
- [ ] `transporterUserId` không thuộc org → 400.
- [ ] Tất cả query lọc `actor.organizationId` (+ `branchId`); idempotent qua `IdempotencyInterceptor` toàn cục.

## Definition of Done

- [ ] `pnpm --filter @erp/api build` + `lint` pass.
- [ ] Không Vietnamese trong source (error/comment/log tiếng Anh).
- [ ] `createAndPost` cũ (temp-warehouse consumer gọi `create`/`post` riêng) không bị double-post.

## Tech Approach

- Giữ `createAndPost` = `create` (DRAFT, gán số phiếu) → `post` (ghi sổ) như hiện tại; rollback DRAFT khi post fail (đã có).
- Định giá tính trên RAM (JS) từ rows snapshot — KHÔNG GROUP BY trong SQL (xem [[feedback_prefer_in_memory_aggregation]]).
- Khóa tồn: gom `requiredByKey` theo `(itemId, effSrcLoc)`, `SELECT … FOR UPDATE` từng key trong cùng transaction ghi ledger (pattern `postIntraWarehouseMoves`).

```ts
interface CreateTransferLineDto {
  itemId: string;
  sourceStorageId: string;
  destinationStorageId: string;
  sourceLocationId?: string;     // bỏ trống → is_unassigned của sourceStorageId
  destinationLocationId?: string;
  quantity: number;
  unitPrice?: number;            // bỏ trống → snapshot cost
  notes?: string;
}
```

## Dependencies

- Requires: TKT-IWT-01 (cột mới).
- Blocks: TKT-IWT-03, TKT-IWT-06.
