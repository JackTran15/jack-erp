# TKT-STE-01 BE: sửa phiếu POSTED — đảo + ghi lại (1 transaction)

## Epic

[EPIC-09062026 Sửa phiếu chuyển kho (POSTED)](../epics/EPIC-09062026-stock-transfer-edit.md)

## Layer

🟦 Backend only (service).

## Summary

Mở rộng `StockTransferService.update()` để sửa được phiếu **POSTED**: trong **một** transaction, đảo bút toán phiếu cũ (rollback tồn) rồi ghi bút toán mới theo dữ liệu sửa, thay dòng, cập nhật header — giữ nguyên `id`, `documentNumber`, trạng thái POSTED. Trước khi ghi, **khóa bi quan + kiểm tra net delta** mỗi `(item, location)`; thiếu tồn → `400` và rollback toàn bộ. DRAFT giữ hành vi cũ (thay dòng, no ledger); CANCELLED → `400`.

## Deliverables

- `apps/api/src/modules/inventory/transfer/stock-transfer.service.ts` — `update(id, dto, actor)`:
  - **Branch nhánh trạng thái**:
    - `CANCELLED` → `BadRequestException('Cannot edit a cancelled stock transfer')`.
    - `DRAFT` → giữ nguyên path hiện tại (resolve + replace lines, không ledger).
    - `POSTED` → đảo + ghi lại (mới).
  - **POSTED path** (sau `resolveBranchScopedTransfer(dto, actor)` → `resolved`):
    1. **Build movements** trong 1 mảng:
       - *Reversal phiếu cũ* (từ `transfer.lines` đang lưu): mỗi dòng cũ → `TRANSFER_IN` `+qty` tại `sourceLoc` cũ, `TRANSFER_OUT` `-qty` tại `destLoc` cũ; `referenceType='TRANSFER_EDIT_REVERSAL'`, `referenceId=transfer.id`; `unitCost = line.unitPrice ?? snapshot`.
       - *Posting mới* (từ `resolved.lines`): mỗi dòng mới → `TRANSFER_OUT` `-qty` tại `sourceLoc` mới, `TRANSFER_IN` `+qty` tại `destLoc` mới; `referenceType='TRANSFER'`, `referenceId=transfer.id`; `unitCost = unitPrice`.
    2. **Net-delta on-hand guard**: gom `delta` theo `(itemId, locationId)` qua TẤT CẢ movements (reversal + new). Mở transaction; với mỗi key có `delta < 0` (hoặc tất cả key, an toàn), `SELECT … FOR UPDATE` `StockBalanceEntity` lấy `onHand`; nếu `onHand + delta < 0` → `BadRequestException` (kèm tên hàng + vị trí). Reuse pattern khóa từ `post()`.
    3. `recordBatchMovements([...reversal, ...new], manager)` (1 transaction, events publish sau commit).
    4. `DELETE` lines cũ + `INSERT` lines mới (giống path DRAFT: storages/locations/unitPrice/lineValue).
    5. `UPDATE stock_transfers` header: `transporterUserId`, `attachmentIds`, `transferredAt`, `notes`, `sourceLocationId/destinationLocationId` (legacy header = line[0] resolved). **KHÔNG** đụng `documentNumber`/`status`.
    6. Sau commit: `publishMovementEvents(entries)`. Trả `findOrFail(id)`.
  - Tách helper dùng chung nếu gọn (vd `buildReversalMovements(lines, transfer, actor, costMap)` đã ngầm có ở `cancel()` — có thể refactor nhẹ để tái dùng, hoặc nội tuyến).

## Acceptance Criteria

- [ ] Sửa POSTED đổi kho nhập A→B: tồn A không còn +q (đảo), B có +q (ghi mới), kho xuất giữ −q net; `documentNumber` + POSTED không đổi.
- [ ] Đổi số lượng/đơn giá/người vận chuyển/diễn giải/ngày giờ → phản ánh đúng; `line_value` tính lại.
- [ ] Thiếu tồn (kho xuất mới không đủ, hoặc hàng đã rời kho nhập cũ) → `400`; **không** ghi bất kỳ bút toán nào (rollback); phiếu gốc nguyên vẹn.
- [ ] Sửa CANCELLED → `400`. Sửa DRAFT vẫn chạy như cũ (no ledger).
- [ ] Đảo + ghi mới + thay dòng + update header nằm trong 1 transaction (all-or-nothing).
- [ ] Scope `organizationId`; same-branch (qua `resolveBranchScopedTransfer`); idempotent qua interceptor toàn cục.

## Definition of Done

- [ ] `pnpm --filter @erp/api build` + `lint` pass; service spec (TKT-STE-03) xanh.
- [ ] Không Vietnamese trong source BE (error/comment/log tiếng Anh).
- [ ] `cancel()` (reverse+void) và create/post không bị ảnh hưởng.

## Tech Approach

- Net-delta map: `Map<"itemId::locationId", {itemId, locationId, delta}>`; cộng `+qty`/`-qty` của từng movement; lock + verify `onHand + delta >= 0`. Cách này xử lý gọn cả trường hợp kho xuất mới = kho nhập cũ (delta triệt tiêu).
- Đảo dùng đúng `transfer.lines` (eager) đang lưu TRƯỚC khi xóa; `resolved.lines` cho posting mới.
- `referenceType` riêng cho leg đảo (`TRANSFER_EDIT_REVERSAL`) để phân biệt với create/cancel.

```ts
// status branch
if (transfer.status === TransferStatus.CANCELLED)
  throw new BadRequestException('Cannot edit a cancelled stock transfer');
if (transfer.status === TransferStatus.DRAFT) { /* existing replace-lines path */ }
// POSTED: resolve → build [reversalOld, postingNew] → net-delta lock+check → record → replace lines → update header
```

## Testing Strategy

- Unit (`stock-transfer.service.spec.ts`): mock repo/ledger/manager (createQueryBuilder/update/delete/save). Assert recordBatchMovements nhận cả reversal (TRANSFER_EDIT_REVERSAL) + new (TRANSFER) legs; documentNumber giữ nguyên; thiếu tồn → throw + không record.

## Dependencies

- Requires: EPIC inter-warehouse-transfer + list-v2 (resolve + reverse + lock patterns).
- Blocks: TKT-STE-02, TKT-STE-03.
