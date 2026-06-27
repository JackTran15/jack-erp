# TKT-TWD-05 Consumer/materializer: phiên single-direction hoàn tất sau 1 transfer

## Epic

[EPIC-25062026 Kho tạm theo hướng phiên](../epics/EPIC-25062026-temp-warehouse-session-direction.md)

## Summary

Trước đây 1 phiên chứa cả 2 hướng → `markTransferCompleted` chờ **cả** `transferW2sId` và `transferS2wId` mới chuyển `processing=COMPLETED`. Nay mỗi phiên chỉ 1 hướng nên chỉ sinh đúng 1 transfer; phải cho phiên hoàn tất **ngay sau transfer của chính hướng nó**, không kẹt PENDING vô hạn chờ hướng kia.

## Deliverables

- `apps/api/src/modules/inventory/temp-warehouse/temp-warehouse.service.ts` — sửa `markTransferCompleted` để xét theo `session.direction`.
- `apps/api/src/modules/inventory/temp-warehouse/temp-warehouse-transfer.consumer.ts` — xác nhận luồng đánh dấu lines TRANSFERRED + completion (không đổi contract event).
- (verify) `TempWarehouseTransferMaterializerService` dùng `session.warehouse/showroomLocationId` (đã đúng) cho location riêng từng phiên.

## Acceptance Criteria

- [ ] Phiên `w2s` sau khi consumer tạo transfer (set `transferW2sId`) → `processing=COMPLETED` ngay; tương tự `s2w` với `transferS2wId`.
- [ ] Completion xét theo `session.direction`: phiên chỉ cần transfer-id của đúng hướng nó, không chờ hướng đối diện.
- [ ] Materializer tạo transfer với `source/destination` = location của **chính phiên** (case khác-location → 2 phiếu single đúng kho mỗi bên).
- [ ] Idempotent: replay event (eventId tất định) là no-op (consumer dedupe qua `processed_events`); lines đã TRANSFERRED không bị tạo lại.
- [ ] `transferProcessingStatus=FAILED` + `transferFailureReason` khi publish/materialize lỗi (giữ nguyên hành vi).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh.
- [ ] Spec/e2e: đóng `CREATE_TRANSFERS` 1 phiên → phiên COMPLETED sau 1 transfer (không kẹt PENDING).
- [ ] No Vietnamese trong source.

## Tech Approach

```ts
// markTransferCompleted — gate theo direction của phiên
async markTransferCompleted(sessionId: string, direction: TempWarehouseDirection, transferId: string) {
  const patch: Partial<TempWarehouseSessionEntity> =
    direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM
      ? { transferW2sId: transferId } : { transferS2wId: transferId };
  await this.sessionRepo.update(sessionId, patch);

  const s = await this.sessionRepo.findOne({ where: { id: sessionId } });
  if (!s) return;
  // Single-direction session: completed once ITS direction's transfer exists.
  const doneForDirection =
    s.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM ? !!s.transferW2sId
    : s.direction === TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE ? !!s.transferS2wId
    : (!!s.transferW2sId && !!s.transferS2wId); // legacy NULL-direction: keep old both-done rule
  if (doneForDirection && s.transferProcessingStatus === TempWarehouseTransferProcessingStatus.PENDING) {
    await this.sessionRepo.update(sessionId, { transferProcessingStatus: TempWarehouseTransferProcessingStatus.COMPLETED });
  }
}
```

> Giữ nhánh `legacy NULL-direction` để không vỡ phiên cũ còn trong DB. Đọc trọn `markTransferCompleted` hiện tại trước khi sửa (logic đếm hai chiều nằm ngay sau đoạn đã trích trong service).

## Testing Strategy

- Unit: gọi `markTransferCompleted` cho phiên w2s → COMPLETED; phiên s2w → COMPLETED.
- E2E (TWD-09): close CREATE_TRANSFERS → poll tới COMPLETED.

## Dependencies

- Depends on: TKT-TWD-04
- Blocks: TKT-TWD-09
