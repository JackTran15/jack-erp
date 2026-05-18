# TKT-072 Temp warehouse — close session API (3 mode)

## Epic

[EPIC-15052026 Temporary Warehouse Session](../epics/EPIC-15052026-temporary-warehouse-session.md)

## Summary

Endpoint `POST /inventory/temp-warehouse/sessions/:id/close` với body `{ mode: NET_OFFSET | CREATE_TRANSFERS | NONE }`. Đây là core API chuyển session `ACTIVE` → `CLOSED` và xử lý line theo từng mode.

Với mode `CREATE_TRANSFERS`, API **không gọi `StockTransferService` trực tiếp** mà publish 1 hoặc 2 event lên topic `erp.temp-warehouse.transfer-requested` (mỗi direction 1 event). Consumer độc lập (TKT-073) tiêu thụ event để tạo + post phiếu chuyển kho. API trả response ngay sau khi đóng session + publish event (async).

## Deliverables

- `TempWarehouseSessionService.close(sessionId, dto, actor)`.
- `TempWarehouseController.closeSession()` — `POST /inventory/temp-warehouse/sessions/:id/close`.
- DTO `apps/api/src/modules/inventory/temp-warehouse/dto/close-session.dto.ts`.
- Topic constant `TEMP_WAREHOUSE_TRANSFER_REQUESTED` thêm vào `packages/shared-kafka-client/src/topics.ts`.
- Thêm topic spec vào `TOPIC_SPECS` trong `apps/api/src/modules/events/topics.init.ts` (numPartitions = 3).
- Event payload interface `TempWarehouseTransferRequestedEvent` (xuất sang `@erp/shared-interfaces` hoặc shared-kafka-client).

## Acceptance Criteria

### Chung

- [ ] Reject nếu session không tồn tại / org khác → 404.
- [ ] Reject nếu actor không có permission (`temp-warehouse.close`) → 403.
- [ ] **Idempotent qua `X-Idempotency-Key`** (auto bởi `IdempotencyInterceptor`):
  - Same key + same body → replay response (`X-Idempotency-Status: REPLAYED`), **không** publish event lần 2, **không** tạo auto-balanced line lần 2.
  - Same key + different body (vd mode khác) → 409.
- [ ] **Defensive idempotency tại app layer** (cho trường hợp Redis cache hết hạn hoặc client mất key):
  - Nếu session đã `CLOSED` với `closeMode === dto.mode` → trả 200 với session hiện tại + `transferIds`/`publishedEvents` đã có; **không** throw 400, **không** publish event lần 2.
  - Nếu session đã `CLOSED` với `closeMode !== dto.mode` → 409 (`Session already closed with different mode`).
- [ ] Toàn bộ thao tác trong 1 DB transaction (NET_OFFSET balance lines + session update); với CREATE_TRANSFERS, publish event diễn ra **sau** khi commit transaction (`dataSource.transaction` afterCommit hook), tránh publish event nhưng DB rollback.
- [ ] Sau thành công: session `status=CLOSED`, `closeMode=<mode>`, `closedBy=actor.userId`, `closedAt=now`.
- [ ] Lúc publish event, `eventId` **deterministic** = `${sessionId}:${direction}` (để consumer dedupe qua `processed_events` đúng cách khi message bị replay từ Kafka).

### Mode `NET_OFFSET`

- [ ] Với mỗi `itemId` có line `ACTIVE` trong session: tính `diff = sum(W2S) - sum(S2W)`.
- [ ] Nếu `diff > 0`: tạo 1 line `status=AUTO_BALANCED`, `direction=S2W`, `quantity=diff`, `carrierUserId=null`, `notes='Auto-balanced on close (NET_OFFSET)'`, `createdBy=actor.userId`.
- [ ] Nếu `diff < 0`: tạo 1 line `status=AUTO_BALANCED`, `direction=W2S`, `quantity=|diff|`.
- [ ] Nếu `diff == 0`: không tạo line.
- [ ] Sau khi close, GET netted view của session → mọi item đều có `netQuantity=0`.
- [ ] **Không** publish event, **không** gọi ledger service, **không** tạo transfer.
- [ ] Set `transfer_processing_status='NONE'`.
- [ ] Return: `{ session, autoBalancedLines: TempWarehouseLineEntity[] }`.
- [ ] **Idempotent compute**: Auto-balanced lines được scope theo session — nếu session đã CLOSED và có `AUTO_BALANCED` line rồi → khi replay (mất Redis cache) phải skip tạo thêm. Logic: trước khi tạo line cân bằng, query xem session đã có line `AUTO_BALANCED` chưa; nếu có → return existing (không insert lần 2).

### Mode `CREATE_TRANSFERS`

- [ ] Group line `status=ACTIVE` theo direction.
- [ ] **Trong DB transaction**: update session `status=CLOSED`, `closeMode=CREATE_TRANSFERS`, `transfer_processing_status='PENDING'`, `closedBy`, `closedAt`.
- [ ] **Sau khi commit DB**: publish 1 event cho mỗi direction có line (tối đa 2 event):
  - Topic: `ERP_TOPICS.TEMP_WAREHOUSE_TRANSFER_REQUESTED` (`erp.temp-warehouse.transfer-requested`)
  - Key: `<sessionId>:<direction>` (đảm bảo cùng session+direction luôn vào cùng partition)
  - Payload `TempWarehouseTransferRequestedEvent`:
    ```ts
    {
      sessionId: string;
      organizationId: string;
      branchId: string;
      direction: TempWarehouseDirection;
      sourceLocationId: string;       // session.warehouseLocationId hoặc showroomLocationId tuỳ direction
      destinationLocationId: string;  // ngược lại
      sourceBranchId: string;         // = session.branchId
      destinationBranchId: string;    // = session.branchId
      lines: { tempWarehouseLineId: string; itemId: string; quantity: number }[];
      actor: { userId: string; organizationId: string; branchId?: string; roles: string[] };
      requestedAt: string;            // ISO
    }
    ```
  - `eventId` (cho idempotency): deterministic = `${sessionId}:${direction}`.
- [ ] Nếu chỉ 1 direction có line → chỉ publish 1 event.
- [ ] Nếu `EventPublisher.publish()` throw → log error, set `transfer_processing_status='FAILED'`, `transfer_failure_reason='Failed to publish event: <msg>'` (qua background update — không revert session status). Trả 202 với warning trong response để client biết cần retry close.
- [ ] Return: `{ session, publishedEvents: { direction: TempWarehouseDirection; eventId: string }[] }`.

### Mode `NONE`

- [ ] Chỉ update session `status=CLOSED`, `closeMode=NONE`, `transfer_processing_status='NONE'`.
- [ ] Không động vào line.
- [ ] Return: `{ session }`.
- [ ] Idempotent: gọi lần 2 với cùng mode → 200 + cùng response (không throw 400).

## Definition of Done

- [ ] Unit test (≥ 12 case):
  - NET_OFFSET: diff>0, diff<0, diff=0, mix multi-item.
  - NET_OFFSET replay: session đã CLOSED với mode NET_OFFSET → call lại không tạo line trùng.
  - CREATE_TRANSFERS: chỉ W2S → 1 event publish; chỉ S2W → 1 event publish; cả 2 → 2 event publish.
  - CREATE_TRANSFERS: verify event payload đúng + `eventId = ${sessionId}:${direction}` deterministic.
  - CREATE_TRANSFERS replay: session đã CLOSED với CREATE_TRANSFERS → call lại không publish event lần 2, return state cũ.
  - CREATE_TRANSFERS: `EventPublisher.publish()` throw → session vẫn CLOSED nhưng `transfer_processing_status='FAILED'`.
  - NONE: idempotent (gọi 2 lần lần 2 trả 200 với cùng response).
  - Different mode trên session đã CLOSED → 409.
  - Permission denied, session not found, org isolation.
- [ ] Event publish chỉ chạy sau commit DB (test bằng cách throw trong transaction → assert event KHÔNG được publish).
- [ ] Integration test `X-Idempotency-Key`: same key + same mode 5 lần → 1 lần publish event thật (track qua mock spy).
- [ ] OpenAPI có endpoint + 3 response variant + document `X-Idempotency-Key`.

## Tech Approach

```ts
async close(sessionId: string, dto: CloseSessionDto, actor: ActorContext) {
  let publishPlan: Array<{ direction: TempWarehouseDirection; payload: TempWarehouseTransferRequestedEvent }> = [];

  const result = await this.dataSource.transaction(async (manager) => {
    const session = await manager.findOne(TempWarehouseSessionEntity, {
      where: { id: sessionId, organizationId: actor.organizationId },
    });
    if (!session) throw new NotFoundException();
    if (session.status === TempWarehouseSessionStatus.CLOSED) {
      throw new BadRequestException('Session already closed');
    }

    const activeLines = await manager.find(TempWarehouseLineEntity, {
      where: { sessionId, status: TempWarehouseLineStatus.ACTIVE },
    });

    let updatePatch: Partial<TempWarehouseSessionEntity> = {
      status: TempWarehouseSessionStatus.CLOSED,
      closeMode: dto.mode,
      closedBy: actor.userId,
      closedAt: new Date(),
      transferProcessingStatus: 'NONE',
    };
    let extraReturn: any = {};

    if (dto.mode === TempWarehouseCloseMode.NET_OFFSET) {
      const byItem = groupBy(activeLines, (l) => l.itemId);
      const created: TempWarehouseLineEntity[] = [];
      for (const [itemId, lines] of byItem.entries()) {
        const w2s = sumQty(lines, TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM);
        const s2w = sumQty(lines, TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE);
        const diff = w2s - s2w;
        if (diff === 0) continue;
        const compensate = manager.create(TempWarehouseLineEntity, {
          organizationId: session.organizationId,
          sessionId,
          itemId,
          direction: diff > 0
            ? TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE
            : TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
          quantity: Math.abs(diff),
          status: TempWarehouseLineStatus.AUTO_BALANCED,
          notes: 'Auto-balanced on close (NET_OFFSET)',
          createdBy: actor.userId,
        });
        created.push(await manager.save(compensate));
      }
      extraReturn.autoBalancedLines = created;
    } else if (dto.mode === TempWarehouseCloseMode.CREATE_TRANSFERS) {
      updatePatch.transferProcessingStatus = 'PENDING';
      const w2sLines = activeLines.filter(
        (l) => l.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
      );
      const s2wLines = activeLines.filter(
        (l) => l.direction === TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE,
      );
      if (w2sLines.length > 0) {
        publishPlan.push({
          direction: TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
          payload: buildEventPayload(session, TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM, w2sLines, actor),
        });
      }
      if (s2wLines.length > 0) {
        publishPlan.push({
          direction: TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE,
          payload: buildEventPayload(session, TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE, s2wLines, actor),
        });
      }
    }

    await manager.update(TempWarehouseSessionEntity, sessionId, updatePatch);
    return { session: { ...session, ...updatePatch }, ...extraReturn };
  });

  // Publish AFTER commit
  const publishedEvents: { direction: TempWarehouseDirection; eventId: string }[] = [];
  for (const { direction, payload } of publishPlan) {
    const eventId = `${payload.sessionId}:${direction}`;
    try {
      await this.eventPublisher.publish(
        ERP_TOPICS.TEMP_WAREHOUSE_TRANSFER_REQUESTED,
        { eventId, eventType: 'temp-warehouse.transfer-requested', payload, occurredAt: new Date().toISOString() },
        `${payload.sessionId}:${direction}`,
      );
      publishedEvents.push({ direction, eventId });
    } catch (e) {
      this.logger.error(`Failed to publish transfer-requested event for ${sessionId}:${direction}`, e);
      await this.sessionRepo.update(sessionId, {
        transferProcessingStatus: 'FAILED',
        transferFailureReason: `Failed to publish event: ${e.message}`,
      });
    }
  }
  return { ...result, publishedEvents };
}
```

## Dependencies

- Phụ thuộc: TKT-068, TKT-069.
- Sử dụng: `EventPublisher` (đã có), `ERP_TOPICS` (mở rộng thêm 1 topic).
- Blocks: TKT-073.
