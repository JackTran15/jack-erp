# TKT-073 Temp warehouse — transfer-requested Kafka consumer

## Epic

[EPIC-15052026 Temporary Warehouse Session](../epics/EPIC-15052026-temporary-warehouse-session.md)

## Summary

Kafka consumer subscribe topic `erp.temp-warehouse.transfer-requested`. Khi nhận event (do TKT-072 publish lúc close session với mode `CREATE_TRANSFERS`), consumer:

1. Build `CreateTransferDto` từ payload (source/dest location, lines).
2. Gọi `StockTransferService.create()` → `.approve()` → `.post()` (cùng `actor` từ payload).
3. Update session: set `transferW2sId` hoặc `transferS2wId` (tuỳ direction); nếu cả 2 direction đã xử lý xong → set `transferProcessingStatus='COMPLETED'`.
4. Idempotent qua `processed_events` (eventId = `${sessionId}:${direction}`).
5. Lỗi 3 lần → DLQ tự động bởi `createDlqHandler()` wrapper; ghi `dead_letter_events` qua DLQ recorder; consumer cập nhật `transferProcessingStatus='FAILED'` + `transferFailureReason` (thực hiện trong DLQ recovery hook hoặc trong consumer ngay trước khi throw).

## Deliverables

- `apps/api/src/modules/inventory/temp-warehouse/consumers/temp-warehouse-transfer.consumer.ts`
- Đăng ký consumer trong `TempWarehouseModule` providers.
- Interface `TempWarehouseTransferRequestedEvent` (nếu chưa được TKT-072 publish lên `@erp/shared-interfaces` thì TKT-073 publish — coordinated).
- Update `apps/api/src/modules/events/topics.init.ts` thêm `TEMP_WAREHOUSE_TRANSFER_REQUESTED` vào `TOPIC_SPECS` (nếu chưa có từ TKT-072): `(ERP_TOPICS.TEMP_WAREHOUSE_TRANSFER_REQUESTED, 3, 1)`.

## Acceptance Criteria

- [ ] Consumer được auto-discover bởi `EventConsumerManager` qua `@OnDomainEvent(ERP_TOPICS.TEMP_WAREHOUSE_TRANSFER_REQUESTED)`.
- [ ] Topic + DLQ topic được `TopicInitializer.ensureTopics()` tạo lúc app start (verify Redpanda console).
- [ ] Handler nhận `DomainEvent<TempWarehouseTransferRequestedEvent>`:
  - Reconstruct `ActorContext` từ `event.payload.actor`.
  - Validate session tồn tại + `status=CLOSED` + `closeMode=CREATE_TRANSFERS` + `transferProcessingStatus IN ('PENDING','FAILED')`.
  - Gọi `stockTransferService.create({ sourceLocationId, destinationLocationId, sourceBranchId, destinationBranchId, notes: 'From kho tạm session <id>', lines: payload.lines.map(...) }, actor)` → `approve(t.id, actor)` → `post(t.id, actor)`.
  - Update session row tương ứng theo direction:
    - `direction === W2S` → `transferW2sId = transfer.id`
    - `direction === S2W` → `transferS2wId = transfer.id`
  - Nếu sau update cả 2 direction đã set (hoặc chỉ có 1 direction được publish và đã set) → `transferProcessingStatus = 'COMPLETED'`.
- [ ] Idempotency: re-deliver cùng `eventId` → `tryClaim()` return false → skip handler, **không** tạo transfer trùng.
- [ ] Idempotency rollback: nếu handler throw, gọi `release()` để cho phép retry.
- [ ] Lỗi rõ ràng:
  - Session không tồn tại → throw `NonRetryableError` → đẩy DLQ ngay không retry.
  - Stock không đủ tại source location → `StockTransferService.post()` throw → retry tối đa 3 lần → DLQ.
- [ ] Khi đẩy DLQ: update session `transferProcessingStatus='FAILED'`, `transferFailureReason=<error.message>` (cập nhật bằng repo, không qua manager transaction của handler).
- [ ] Logging: log info khi process thành công với `{ sessionId, direction, transferId }`; log error với stack trace khi fail.

## Definition of Done

- [ ] Unit test consumer handler (mock `StockTransferService`):
  - Happy path: 1 direction → tạo 1 transfer, set `transferW2sId`, `transferProcessingStatus='COMPLETED'`.
  - 2 direction xử lý song song: cả 2 event đều process, cuối cùng `transferProcessingStatus='COMPLETED'`.
  - Re-deliver same eventId → skip (idempotency).
  - Session not found → NonRetryableError.
  - `StockTransferService.post()` throw → handler throw → retry.
- [ ] Integration test với Redpanda thật (testcontainers hoặc dev compose):
  - Publish event → consumer xử lý → verify `stock_transfers` POSTED + ledger entries.
  - Publish event với invalid sessionId → message trong `erp.temp-warehouse.transfer-requested.dlq`, row trong `dead_letter_events`.
- [ ] Idempotent verify: publish cùng event 5 lần → chỉ 1 transfer được tạo.

## Tech Approach

### Consumer file

```ts
// apps/api/src/modules/inventory/temp-warehouse/consumers/temp-warehouse-transfer.consumer.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnDomainEvent } from '../../../events/decorators/on-event.decorator';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { DomainEvent } from '@erp/shared-kafka-client';
import { StockTransferService } from '../../transfer/stock-transfer.service';
import { TempWarehouseSessionEntity } from '../temp-warehouse-session.entity';
import {
  TempWarehouseTransferRequestedEvent,
  TempWarehouseDirection,
  TempWarehouseSessionStatus,
} from '@erp/shared-interfaces';

@Injectable()
export class TempWarehouseTransferConsumer {
  private readonly logger = new Logger(TempWarehouseTransferConsumer.name);

  constructor(
    private readonly stockTransferService: StockTransferService,
    @InjectRepository(TempWarehouseSessionEntity)
    private readonly sessionRepo: Repository<TempWarehouseSessionEntity>,
  ) {}

  @OnDomainEvent(ERP_TOPICS.TEMP_WAREHOUSE_TRANSFER_REQUESTED)
  async handle(event: DomainEvent<TempWarehouseTransferRequestedEvent>): Promise<void> {
    const p = event.payload;
    this.logger.log(`Processing ${event.eventId} for session=${p.sessionId} direction=${p.direction}`);

    const session = await this.sessionRepo.findOne({
      where: { id: p.sessionId, organizationId: p.organizationId },
    });
    if (!session) {
      throw new NonRetryableError(`Session ${p.sessionId} not found`);
    }
    if (session.status !== TempWarehouseSessionStatus.CLOSED) {
      throw new NonRetryableError(`Session ${p.sessionId} is not CLOSED (status=${session.status})`);
    }

    // Short-circuit: nếu transferId đã set cho direction này → skip (defensive idempotency ngoài processed_events)
    const existingId = p.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM
      ? session.transferW2sId
      : session.transferS2wId;
    if (existingId) {
      this.logger.warn(`Session ${p.sessionId} direction=${p.direction} đã có transfer ${existingId}, skip`);
      return;
    }

    const actor = p.actor;
    const transfer = await this.stockTransferService.create(
      {
        sourceLocationId: p.sourceLocationId,
        destinationLocationId: p.destinationLocationId,
        sourceBranchId: p.sourceBranchId,
        destinationBranchId: p.destinationBranchId,
        notes: `From kho tạm session ${p.sessionId}`,
        lines: p.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
      },
      actor,
    );
    await this.stockTransferService.approve(transfer.id, actor);
    await this.stockTransferService.post(transfer.id, actor);

    const patch: Partial<TempWarehouseSessionEntity> =
      p.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM
        ? { transferW2sId: transfer.id }
        : { transferS2wId: transfer.id };
    await this.sessionRepo.update(p.sessionId, patch);

    // Re-fetch và check completion
    const updated = await this.sessionRepo.findOneOrFail({ where: { id: p.sessionId } });
    const expectedDirections = inferExpectedDirections(updated);  // dựa trên line direction đã publish
    const done =
      (!expectedDirections.includes(TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM) || updated.transferW2sId) &&
      (!expectedDirections.includes(TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE) || updated.transferS2wId);
    if (done) {
      await this.sessionRepo.update(p.sessionId, { transferProcessingStatus: 'COMPLETED' });
    }

    this.logger.log(`Session ${p.sessionId} direction=${p.direction} → transfer ${transfer.id} POSTED`);
  }
}
```

### Topic registration

`packages/shared-kafka-client/src/topics.ts`:
```ts
export const ERP_TOPICS = {
  ...,
  TEMP_WAREHOUSE_TRANSFER_REQUESTED: 'erp.temp-warehouse.transfer-requested',
} as const;
```

`apps/api/src/modules/events/topics.init.ts` (TOPIC_SPECS):
```ts
[ERP_TOPICS.TEMP_WAREHOUSE_TRANSFER_REQUESTED, 3, 1],
```

## Dependencies

- Phụ thuộc: TKT-072 (event publish), TKT-047 (DLQ infra).
- Sử dụng: `StockTransferService` (không sửa), `EventConsumerManager`, `EventIdempotencyService`, DLQ recorder, `processed_events` table.
- Blocks: TKT-074.
