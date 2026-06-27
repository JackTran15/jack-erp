# TKT-TWD-03 DTO + service: mở phiên theo hướng + active/list theo direction

## Epic

[EPIC-25062026 Kho tạm theo hướng phiên](../epics/EPIC-25062026-temp-warehouse-session-direction.md)

## Summary

Đưa `direction` thành trục phân giải phiên ở read + write side: `addLine` mở/dùng phiên đúng theo `(branchId, direction)` với location do client cung cấp (fallback resolver), gán `line.direction = session.direction`; `getActiveSession` lọc theo `direction`; `listLines`/netted phân giải phiên theo `direction`, và netted-gộp span cả 2 phiên ACTIVE của chi nhánh để feed dialog đối chiếu. Bỏ auto-resolve hướng từ tồn kho (orphan sau thay đổi này).

## Deliverables

- `apps/api/src/modules/inventory/temp-warehouse/dto/add-line.dto.ts` — `direction` required; thêm `warehouseLocationId?`/`showroomLocationId?`.
- `apps/api/src/modules/inventory/temp-warehouse/temp-warehouse.service.ts` — `addLine`, `getActiveSession`, `resolveSessionId`, netted-gộp.
- `apps/api/src/modules/inventory/temp-warehouse/temp-warehouse.controller.ts` — `getActiveSession` thêm `@Query('direction')` (required).
- (cleanup) gỡ `resolveDirectionFromStock` nếu không còn nơi gọi.

## Acceptance Criteria

- [ ] `addLine` tìm phiên theo `{ branchId, organizationId, status: ACTIVE, direction: dto.direction }`; nếu chưa có thì mở phiên mới với `direction = dto.direction`, `warehouseLocationId`/`showroomLocationId` = dto cung cấp **đủ cặp** ?? `BranchLocationResolverService.resolve()`. `line.direction = dto.direction` (không auto-resolve).
- [ ] Mở 2 lần với 2 direction khác nhau cho cùng branch → 2 phiên ACTIVE; race re-find dùng đúng `(branch, direction)`.
- [ ] `getActiveSession(branchId, direction, actor)` chỉ trả phiên đúng hướng; controller yêu cầu `direction` (enum), thiếu → 400 validation.
- [ ] `listLines` với `branchId` + `direction` phân giải đúng phiên của hướng đó; netted (`hideOffsetting`) theo `branchId` gộp lines ACTIVE của **cả 2** phiên để tính `totalW2s/totalS2w/netQuantity`.
- [ ] Mọi query lọc `actor.organizationId`; không rò chéo tenant.
- [ ] Idempotent: addLine kế thừa `IdempotencyInterceptor`; mở phiên trùng do race bắt `PG_UNIQUE_VIOLATION` rồi re-find.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh.
- [ ] Spec phủ: mở phiên theo direction, 2 phiên song song, active theo direction, netted gộp 2 phiên, location client vs fallback.
- [ ] No Vietnamese trong source; không TODO ngoài plan.

## Tech Approach

```ts
// add-line.dto.ts
@ApiProperty({ enum: TempWarehouseDirection })   // required now
@IsEnum(TempWarehouseDirection)
direction: TempWarehouseDirection;

@ApiPropertyOptional({ description: 'Warehouse-side location for this session; falls back to branch main storage when omitted' })
@IsOptional() @IsUUID()
warehouseLocationId?: string;

@ApiPropertyOptional({ description: 'Showroom-side location for this session; falls back to branch main showroom when omitted' })
@IsOptional() @IsUUID()
showroomLocationId?: string;
```

```ts
// service.addLine — session lookup + open
let session = await manager.findOne(TempWarehouseSessionEntity, {
  where: { branchId: dto.branchId, organizationId: actor.organizationId,
           status: TempWarehouseSessionStatus.ACTIVE, direction: dto.direction },
});
if (!session) {
  const resolved = dto.warehouseLocationId && dto.showroomLocationId
    ? { warehouseLocationId: dto.warehouseLocationId, showroomLocationId: dto.showroomLocationId }
    : await this.locationResolver.resolve(dto.branchId, actor.organizationId);
  const newSession = manager.create(TempWarehouseSessionEntity, {
    organizationId: actor.organizationId, branchId: dto.branchId,
    status: TempWarehouseSessionStatus.ACTIVE, direction: dto.direction,
    warehouseLocationId: resolved.warehouseLocationId,
    showroomLocationId: resolved.showroomLocationId,
    openedBy: actor.userId, openedAt: new Date(),
    transferProcessingStatus: TempWarehouseTransferProcessingStatus.NONE,
    createdBy: actor.userId,
  });
  try { session = await manager.save(newSession); }
  catch (err) {
    if (this.isUniqueViolation(err)) {
      session = await manager.findOne(TempWarehouseSessionEntity, {
        where: { branchId: dto.branchId, organizationId: actor.organizationId,
                 status: TempWarehouseSessionStatus.ACTIVE, direction: dto.direction },
      });
      if (!session) throw err;
    } else throw err;
  }
}
// line.direction = session.direction (no resolveDirectionFromStock)
const line = manager.create(TempWarehouseLineEntity, { /* ... */, direction: dto.direction /* = session.direction */ });
```

```ts
// service.getActiveSession
async getActiveSession(branchId: string, direction: TempWarehouseDirection, actor: ActorContext) {
  return this.sessionRepo.findOne({
    where: { branchId, organizationId: actor.organizationId,
             status: TempWarehouseSessionStatus.ACTIVE, direction },
  });
}
```

```ts
// controller
@Get('sessions/active')
async getActiveSession(
  @Query('branchId', ParseUUIDPipe) branchId: string,
  @Query('direction', new ParseEnumPipe(TempWarehouseDirection)) direction: TempWarehouseDirection,
  @Actor() actor: ActorContext,
) {
  const session = await this.service.getActiveSession(branchId, direction, actor);
  if (!session) throw new NotFoundException({ code: 'TEMP_WAREHOUSE_NO_ACTIVE_SESSION',
    message: `Branch ${branchId} has no ACTIVE ${direction} temp warehouse session` });
  return session;
}
```

> `resolveSessionId(query)`: khi có `branchId` không kèm `sessionId`, dùng `query.direction` để chọn phiên ACTIVE đúng hướng. Netted-gộp (`hideOffsetting` + `branchId`, không `direction`): lấy `sessionId` của **cả 2** phiên ACTIVE và gộp lines ACTIVE trước khi `computeNettedView`, để dialog đối chiếu thấy net span 2 phiên.

## Testing Strategy

- Unit (`temp-warehouse.service.spec.ts`): các case ở Acceptance.
- Manual: 2 lệnh addLine khác direction → 2 phiên; `GET sessions/active?direction=` cho từng hướng.

## Dependencies

- Depends on: TKT-TWD-01, TKT-TWD-02
- Blocks: TKT-TWD-04, TKT-TWD-06
