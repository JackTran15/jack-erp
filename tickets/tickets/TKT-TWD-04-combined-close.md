# TKT-TWD-04 Combined close + net-offset eligibility (service + controller)

## Epic

[EPIC-25062026 Kho tạm theo hướng phiên](../epics/EPIC-25062026-temp-warehouse-session-direction.md)

## Summary

Thay `POST sessions/:id/close` (đóng 1 phiên, netting trong-phiên — vô nghĩa khi phiên single-direction) bằng `POST sessions/close` đóng **gộp theo chi nhánh** `{ branchId, mode }`. `NET_OFFSET` chỉ chạy khi **cả 2 phiên ACTIVE tồn tại và cùng cặp `warehouse_location`/`showroom_location`** (đối cộng trừ span 2 phiên, như flow cũ); ngược lại từ chối `NET_OFFSET` (400) — các mode khác chuyển thẳng single từng phiên. `CREATE_TRANSFERS` publish event riêng cho từng phiên (theo direction + location của chính phiên). `NONE` chỉ đóng.

## Deliverables

- `apps/api/src/modules/inventory/temp-warehouse/dto/close-session.dto.ts` — `CloseBranchSessionsDto { branchId, mode }`.
- `apps/api/src/modules/inventory/temp-warehouse/temp-warehouse.service.ts` — `closeBranchSessions()`; refactor `buildAutoBalancedLines` nhận 2 phiên + lines gộp; gỡ `closeSession(byId)`.
- `apps/api/src/modules/inventory/temp-warehouse/temp-warehouse.controller.ts` — thêm `POST sessions/close`; gỡ `POST sessions/:id/close`.

## Acceptance Criteria

- [ ] `POST sessions/close { branchId, mode }` (perm `inventory.temp-warehouse.close`) load phiên ACTIVE w2s + s2w của branch.
- [ ] `netOffsetEligible = bothPresent && w2s.warehouseLocationId===s2w.warehouseLocationId && w2s.showroomLocationId===s2w.showroomLocationId`.
- [ ] `mode=NET_OFFSET` && `!eligible` → `400 TEMP_WAREHOUSE_NET_OFFSET_NOT_ELIGIBLE`. Khi eligible: net per item span lines ACTIVE của **cả 2** phiên; AUTO_BALANCED line gắn vào phiên có direction trùng hướng bù; đóng cả 2 phiên (`processing=NONE`).
- [ ] `mode=CREATE_TRANSFERS`: mỗi phiên có lines ACTIVE → publish `TEMP_WAREHOUSE_TRANSFER_REQUESTED` theo direction + location **của chính phiên**, set `processing=PENDING`; phiên rỗng → `processing=NONE`. Đóng tất cả phiên hiện diện.
- [ ] `mode=NONE`: đóng phiên, không event, không AUTO_BALANCED.
- [ ] Case-2 (2 phiên khác location) + Case-3 (1 phiên): không đối cộng trừ; `CREATE_TRANSFERS` ra phiếu single từng phiên.
- [ ] Idempotent: replay cùng mode khi đã CLOSED → trả trạng thái hiện tại; khác mode → `409`. Publish event sau commit, eventId tất định `uuidv5(sessionId:direction)`.
- [ ] `actor.organizationId` lọc mọi truy vấn.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh.
- [ ] Spec phủ: eligible→NET_OFFSET, khác loc→reject NET_OFFSET + CREATE single, 1 phiên→single, replay/idempotency, NONE.
- [ ] Gỡ sạch `closeSession(byId)` + route `:id/close` + (nếu thành orphan) `CloseSessionResult`.
- [ ] No Vietnamese trong source; openapi regen ở TWD-06.

## Tech Approach

```ts
// close-session.dto.ts
export class CloseBranchSessionsDto {
  @ApiProperty() @IsUUID() branchId: string;
  @ApiProperty({ enum: TempWarehouseCloseMode }) @IsEnum(TempWarehouseCloseMode)
  mode: TempWarehouseCloseMode;
}
```

```ts
// controller
@Post('sessions/close')
@ApiOperation({ summary: 'Close both direction sessions of a branch. NET_OFFSET requires both sessions sharing locations; otherwise single transfers per session.' })
@RequirePermission('inventory.temp-warehouse.close')
closeBranchSessions(@Body() dto: CloseBranchSessionsDto, @Actor() actor: ActorContext) {
  return this.service.closeBranchSessions(dto, actor);
}
```

```ts
// service.closeBranchSessions (shape)
async closeBranchSessions(dto: CloseBranchSessionsDto, actor: ActorContext): Promise<CloseBranchSessionsResult> {
  // load both ACTIVE sessions
  const sessions = await this.sessionRepo.find({
    where: { branchId: dto.branchId, organizationId: actor.organizationId, status: TempWarehouseSessionStatus.ACTIVE },
  });
  const w2s = sessions.find(s => s.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM) ?? null;
  const s2w = sessions.find(s => s.direction === TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE) ?? null;
  const eligible = !!w2s && !!s2w
    && w2s.warehouseLocationId === s2w.warehouseLocationId
    && w2s.showroomLocationId === s2w.showroomLocationId;

  if (dto.mode === TempWarehouseCloseMode.NET_OFFSET && !eligible) {
    throw new BadRequestException({ code: 'TEMP_WAREHOUSE_NET_OFFSET_NOT_ELIGIBLE',
      message: 'NET_OFFSET requires two active sessions (w2s + s2w) sharing warehouse and showroom locations' });
  }
  // tx: per mode → tái dùng buildAutoBalancedLines (gộp lines 2 phiên) / buildEventPayload (per session)
  //   - NET_OFFSET: aggregate lines của w2s+s2w theo item; AUTO_BALANCED line → gắn sessionId theo direction bù
  //   - CREATE_TRANSFERS: for each present session → publishPlan.push({ direction: session.direction, payload: buildEventPayload(session, session.direction, sessionLines, actor) })
  //   - close mọi phiên hiện diện (status=CLOSED, closeMode=mode, closedBy/At)
  // publish sau commit (giống closeSession cũ); trả { sessions, netOffsetEligible, autoBalancedLines?, publishedEvents? }
}
```

> `buildAutoBalancedLines` đổi chữ ký nhận `sessions: { w2s; s2w }` + `combinedActiveLines`; map item→{w2s,s2w} không đổi (đang lọc theo `l.direction`), chỉ khác nguồn lines (2 phiên) và `sessionId` của compensating line = phiên trùng direction bù. `buildEventPayload` giữ nguyên (đã đọc `session.warehouse/showroomLocationId`) → tự nhiên dùng location riêng từng phiên cho case khác-location.

## Testing Strategy

- Unit (`temp-warehouse.service.spec.ts`): bảng case eligible/khác-loc/1-phiên × mode.
- E2E (TWD-09): full flow publish→consume.

## Dependencies

- Depends on: TKT-TWD-02, TKT-TWD-03
- Blocks: TKT-TWD-05, TKT-TWD-06, TKT-TWD-09
