# TKT-MRC-01 ReconcileDto `groups[]` + service tạo N lô trong một transaction

## Epic

[EPIC-21072026 Đối chiếu tiền gửi — nhiều tài khoản](../epics/EPIC-21072026-multi-account-deposit-reconcile.md)

## Summary

`POST /deposit-recon/reconcile` hiện chỉ nhận một `depositAccountId` cho cả lô. Ticket này đổi body sang `{ stmtFromDate, stmtToDate, groups[] }` — mỗi group là một tài khoản tiền gửi với danh sách movement, tổng sao kê và ghi chú riêng — rồi tạo N `deposit_recon_batches` trong **một** transaction. Logic đối chiếu từng lô giữ nguyên (lock, Σ net_amount, BR-REC-02, đề xuất phí BR-REC-03, audit).

## Deliverables

- `apps/api/src/modules/accounting/deposit-recon/dto/reconcile.dto.ts` — thêm `ReconcileGroupDto`, `ReconcileDto` chỉ còn `groups` + 2 mốc ngày sao kê.
- `apps/api/src/modules/accounting/deposit-recon/deposit-recon.service.ts` — `reconcileGroup()` (private, logic cũ) + `reconcile()` lặp group, `assertGroupsDisjoint()`.
- `apps/api/src/modules/accounting/deposit-recon/deposit-recon.controller.ts` — không đổi chữ ký, chỉ đổi kiểu trả về.

## Acceptance Criteria

- [ ] Mọi query vẫn lọc theo `actor.organizationId` + `actor.branchId` + `depositAccountId` của group + `reconStatus = CHUA`.
- [ ] `groups` rỗng → 400 (`ArrayMinSize(1)`); `movementIds` rỗng trong một group → 400.
- [ ] Một `depositAccountId` xuất hiện ở 2 group → 400; một `movementId` xuất hiện ở 2 group → 400.
- [ ] N group → N `deposit_recon_batches`, mỗi lô `batch_number` riêng qua `DocumentNumberingService`.
- [ ] Group nào lệch mà thiếu `note` → 400 và **không** lô nào được ghi (cùng transaction rollback).
- [ ] Idempotency kế thừa `IdempotencyInterceptor` toàn cục — không tự xử lý.
- [ ] Không đổi schema, không migration.

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- deposit-recon` xanh.
- [ ] Không có tiếng Việt trong source backend (error/comment/Swagger/log).
- [ ] OpenAPI regen để ở TKT-MRC-02.

## Tech Approach

```ts
export class ReconcileGroupDto {
  @ApiProperty() @IsUUID() depositAccountId: string;

  @ApiProperty({ type: [String] })
  @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true })
  movementIds: string[];

  @ApiProperty() @IsNumber({ maxDecimalPlaces: 2 }) stmtTotalAmount: number;

  /** Required when this group's statement total does not match (BR-REC-02). */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class ReconcileDto {
  /** One group per deposit account — a bank statement always belongs to one account. */
  @ApiProperty({ type: [ReconcileGroupDto] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ReconcileGroupDto)
  groups: ReconcileGroupDto[];

  @ApiProperty() @IsISO8601() stmtFromDate: string;
  @ApiProperty() @IsISO8601() stmtToDate: string;
}
```

```ts
async reconcile(dto: ReconcileDto, actor: ActorContext): Promise<{ results: ReconcileResult[] }> {
  this.assertGroupsDisjoint(dto.groups);
  return this.dataSource.transaction(async (manager) => {
    const results: ReconcileResult[] = [];
    for (const group of dto.groups) {
      results.push(await this.reconcileGroup(group, dto, actor, manager));
    }
    return { results };
  });
}
```

`reconcileGroup` = thân `reconcile()` cũ, thay `dto.depositAccountId/movementIds/stmtTotalAmount/note` bằng `group.*` và lấy `stmtFromDate/stmtToDate` từ dto gốc. Lặp tuần tự (không `Promise.all`) để `SELECT … FOR UPDATE` và `DocumentNumberingService` chạy nối tiếp trong cùng một transaction.

## Testing Strategy

Xem TKT-MRC-04.

## Dependencies

- Blocks: TKT-MRC-02, TKT-MRC-04.
