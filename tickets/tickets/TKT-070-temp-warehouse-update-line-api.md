# TKT-070 Temp warehouse — update line API

## Epic

[EPIC-15052026 Temporary Warehouse Session](../epics/EPIC-15052026-temporary-warehouse-session.md)

## Summary

Endpoint `PATCH /inventory/temp-warehouse/lines/:id`: cập nhật line theo cơ chế **soft-delete + replace** — không edit in-place. Line cũ được set `status=DELETED`, một line mới được tạo với giá trị mới, và `superseded_by_id` của line cũ trỏ tới line mới (audit trail rõ ràng).

Field được phép update: `itemId`, `quantity`, `carrierUserId`, `notes`. **Không** cho phép đổi `direction` — đổi chiều luân chuyển là một movement hoàn toàn khác, phải DELETE + POST line mới.

## Deliverables

- `TempWarehouseSessionService.updateLine(lineId, dto, actor)`.
- `TempWarehouseController.updateLine()` — `PATCH /inventory/temp-warehouse/lines/:id`.
- DTO `apps/api/src/modules/inventory/temp-warehouse/dto/update-line.dto.ts`.
- (Tuỳ chọn) `DELETE /inventory/temp-warehouse/lines/:id` — soft-delete thuần (không tạo line mới).

## Acceptance Criteria

- [ ] `PATCH .../:id` với body `{ itemId?, quantity?, carrierUserId?, notes? }` (ít nhất 1 field):
  - Line cũ phải đang `status=ACTIVE` và thuộc session `status=ACTIVE` cùng `organizationId` actor.
  - Set line cũ: `status=DELETED`, `updatedAt=now`.
  - Tạo line mới (cùng `sessionId`, `direction`; `itemId` lấy từ DTO nếu có, không thì giữ nguyên), apply patched values, `status=ACTIVE`, `createdBy=actor.userId`.
  - Set `oldLine.supersededById = newLine.id`.
  - Cả 2 thao tác trong 1 transaction.
- [ ] **Idempotent** qua `X-Idempotency-Key` (auto bởi `IdempotencyInterceptor`):
  - Same key + same body → replay response (không tạo line mới thứ 2, line cũ vẫn `DELETED` qua replay).
  - Same key + different body → 409.
- [ ] **Defensive idempotency tại app layer**: nếu cùng line đã `status=DELETED` với `supersededById` set → trả về cặp `{ oldLine, newLine (supersededById) }` hiện có (200), **không** throw 400. Đảm bảo retry sau khi network drop vẫn safe.
- [ ] Trả về `{ oldLine, newLine }` (cả 2 với trạng thái sau update).
- [ ] Reject với 400 nếu:
  - Line không tồn tại / thuộc org khác → 404.
  - Session đã `CLOSED`.
  - Body trống (không field nào set).
  - Body chứa `direction` (không cho phép qua DTO — class-validator strip via `forbidNonWhitelisted`).
  - `quantity <= 0`.
  - `itemId` không phải UUID hợp lệ.
- [ ] `DELETE .../:id`: chỉ set `status=DELETED`, không tạo line mới. Trả về line đã update. Idempotent: gọi DELETE lần 2 → 200 với cùng response (line vẫn DELETED).

## Definition of Done

- [ ] Unit test 7 case: happy update qty; update carrier only; update closed session → 400; update deleted-but-superseded line (replay) → 200; body trống → 400; full chain (update lần 2 trên line mới) tạo chuỗi 3 line link nhau; PATCH cùng `X-Idempotency-Key` 5 lần → 1 cặp old/new trong DB.
- [ ] Multi-tenant: line org khác → 404.
- [ ] OpenAPI có endpoint + ví dụ payload + document `X-Idempotency-Key`.

## Tech Approach

### DTO

```ts
export class UpdateTempWarehouseLineDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.01)
  quantity?: number;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  carrierUserId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;
}
```

### Service logic

```ts
async updateLine(lineId: string, dto: UpdateTempWarehouseLineDto, actor: ActorContext) {
  if (Object.keys(dto).length === 0) {
    throw new BadRequestException('At least one field is required');
  }

  return this.dataSource.transaction(async (manager) => {
    const oldLine = await manager.findOne(TempWarehouseLineEntity, {
      where: { id: lineId, organizationId: actor.organizationId },
    });
    if (!oldLine) throw new NotFoundException(`Line ${lineId} not found`);
    if (oldLine.status !== TempWarehouseLineStatus.ACTIVE) {
      throw new BadRequestException(`Line ${lineId} is not editable (status=${oldLine.status})`);
    }

    const session = await manager.findOneOrFail(TempWarehouseSessionEntity, {
      where: { id: oldLine.sessionId },
    });
    if (session.status !== TempWarehouseSessionStatus.ACTIVE) {
      throw new BadRequestException(`Cannot edit lines in closed session`);
    }

    const newLine = manager.create(TempWarehouseLineEntity, {
      organizationId: oldLine.organizationId,
      sessionId: oldLine.sessionId,
      itemId: oldLine.itemId,
      direction: oldLine.direction,
      quantity: dto.quantity ?? oldLine.quantity,
      carrierUserId: dto.carrierUserId ?? oldLine.carrierUserId,
      notes: dto.notes ?? oldLine.notes,
      status: TempWarehouseLineStatus.ACTIVE,
      createdBy: actor.userId,
    });
    const savedNew = await manager.save(newLine);

    await manager.update(TempWarehouseLineEntity, oldLine.id, {
      status: TempWarehouseLineStatus.DELETED,
      supersededById: savedNew.id,
    });

    return {
      oldLine: { ...oldLine, status: TempWarehouseLineStatus.DELETED, supersededById: savedNew.id },
      newLine: savedNew,
    };
  });
}
```

## Dependencies

- Phụ thuộc: TKT-069.
- Blocks: TKT-073.
