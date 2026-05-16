# TKT-069 Temp warehouse — add line API

## Epic

[EPIC-15052026 Temporary Warehouse Session](../epics/EPIC-15052026-temporary-warehouse-session.md)

## Summary

Endpoint `POST /inventory/temp-warehouse/lines`: thêm 1 line vào session ACTIVE của branch. Nếu chưa có session ACTIVE thì tự động open mới (resolve warehouse + showroom location qua `BranchLocationResolverService`).

## Deliverables

- `TempWarehouseSessionService.addLine(dto, actor)` — implement logic auto-open + insert.
- `TempWarehouseController.addLine()` — route handler.
- DTO `apps/api/src/modules/inventory/temp-warehouse/dto/add-line.dto.ts`.
- `GET /inventory/temp-warehouse/sessions/active?branchId=...` (lightweight helper, dùng chung với UI).
- `GET /inventory/temp-warehouse/sessions/:id` (chi tiết 1 session).

## Acceptance Criteria

- [ ] `POST /inventory/temp-warehouse/lines` với body `{ branchId, itemId, direction, quantity, carrierUserId?, notes? }`:
  - Nếu branch chưa có session `status=ACTIVE` → tạo session mới (resolve location, set `openedBy=actor.userId`, `openedAt=now`).
  - Insert line với `status=ACTIVE`, `createdBy=actor.userId`.
  - Trả về `{ session, line }`.
- [ ] **Idempotent** qua `X-Idempotency-Key` header (auto bởi global `IdempotencyInterceptor`):
  - Same key + same body → replay response gốc (`X-Idempotency-Status: REPLAYED`), **không** tạo line trùng.
  - Same key + different body → 409 Conflict.
  - Key TTL 24h trong Redis.
  - Document header trong Swagger.
- [ ] Race condition: 2 request đồng thời add line cho branch chưa có session → chỉ tạo 1 session (xử lý qua DB partial unique index + catch unique violation, refetch session, retry insert line).
- [ ] Validate: `quantity > 0`; `direction` ∈ `TempWarehouseDirection`; `itemId` thuộc cùng `organizationId`; `carrierUserId` (nếu có) thuộc cùng `organizationId`.
- [ ] Same item add 2 lần với **khác** `X-Idempotency-Key` → 2 line riêng (không merge). Same item add 2 lần với **cùng** `X-Idempotency-Key` + body giống → replay, vẫn 1 line.
- [ ] `GET /inventory/temp-warehouse/sessions/active?branchId=...` trả 200 + session, hoặc 404 nếu chưa có.
- [ ] `GET /inventory/temp-warehouse/sessions/:id` trả session + lines (eager load).
- [ ] Multi-tenant: actor không thuộc org của branch → 403.

## Definition of Done

- [ ] Unit test cho `addLine()` (5 case): no active → open + add; có active → reuse; race → 1 session only; cùng item 2 lần với khác key → 2 line; carrier khác org → 400.
- [ ] Integration test idempotency: same key + same body 5 lần → 1 line trong DB, 4 response `X-Idempotency-Status: REPLAYED`.
- [ ] Integration test idempotency conflict: same key + different body → 409.
- [ ] Controller integration test với `@Actor()` mock.
- [ ] OpenAPI swagger có 3 endpoint mới (request/response example) + document `X-Idempotency-Key` header trên POST.

## Tech Approach

### DTO

```ts
export class AddTempWarehouseLineDto {
  @ApiProperty() @IsUUID()
  branchId: string;

  @ApiProperty() @IsUUID()
  itemId: string;

  @ApiProperty({ enum: TempWarehouseDirection })
  @IsEnum(TempWarehouseDirection)
  direction: TempWarehouseDirection;

  @ApiProperty() @IsNumber() @Min(0.01)
  quantity: number;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  carrierUserId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;
}
```

### Service logic

```ts
async addLine(dto: AddTempWarehouseLineDto, actor: ActorContext) {
  return this.dataSource.transaction(async (manager) => {
    let session = await manager.findOne(TempWarehouseSessionEntity, {
      where: {
        branchId: dto.branchId,
        organizationId: actor.organizationId,
        status: TempWarehouseSessionStatus.ACTIVE,
      },
    });

    if (!session) {
      const { warehouseLocationId, showroomLocationId } =
        await this.locationResolver.resolve(dto.branchId, actor.organizationId);
      session = manager.create(TempWarehouseSessionEntity, {
        organizationId: actor.organizationId,
        branchId: dto.branchId,
        status: TempWarehouseSessionStatus.ACTIVE,
        warehouseLocationId,
        showroomLocationId,
        openedBy: actor.userId,
        openedAt: new Date(),
        createdBy: actor.userId,
      });
      try {
        session = await manager.save(session);
      } catch (e) {
        // Partial unique conflict — refetch
        if (isUniqueViolation(e)) {
          session = await manager.findOneOrFail(TempWarehouseSessionEntity, {
            where: { branchId: dto.branchId, status: TempWarehouseSessionStatus.ACTIVE },
          });
        } else throw e;
      }
    }

    const line = manager.create(TempWarehouseLineEntity, {
      organizationId: actor.organizationId,
      sessionId: session.id,
      itemId: dto.itemId,
      direction: dto.direction,
      quantity: dto.quantity,
      carrierUserId: dto.carrierUserId,
      notes: dto.notes,
      status: TempWarehouseLineStatus.ACTIVE,
      createdBy: actor.userId,
    });
    const saved = await manager.save(line);
    return { session, line: saved };
  });
}
```

## Dependencies

- Phụ thuộc: TKT-068.
- Blocks: TKT-070, TKT-072.
