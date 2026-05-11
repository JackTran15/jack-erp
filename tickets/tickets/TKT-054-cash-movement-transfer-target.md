# TKT-054 Cash movement transfer target

## Epic

[EPIC-009 Cash Management Enhancement](../epics/EPIC-009-cash-management-enhancement.md)

## Summary

Thêm field `toAccountId` vào `cash_movements` để hỗ trợ nghiệp vụ TRANSFER giữa 2 két (ví dụ: chuyển từ quầy POS về két chính). Hiện tại entity chỉ có 1 `cashAccountId` → TRANSFER không biết tiền đi vào két nào. Update `recordMovement()` để khi TRANSFER: trừ balance source + cộng balance destination trong cùng DB transaction.

## Deliverables

- Migration: `1779510000000-AddCashMovementTransferTarget.ts` — column `to_account_id` (nullable, FK → cash_accounts).
- Update entity: `apps/api/src/modules/accounting/cash/cash-movement.entity.ts` — thêm `toAccountId` + `toAccount` relation.
- Update DTO: `apps/api/src/modules/accounting/cash/dto/record-cash-movement.dto.ts` — thêm `toAccountId` (required khi type=TRANSFER, dùng `@ValidateIf`).
- Update service: `CashService.recordMovement()` — khi TRANSFER, load + update cả 2 accounts atomically.
- Validation: source != destination, cùng `organizationId`, cùng `branchId` (transfer trong cùng chi nhánh).

## Acceptance Criteria

- [ ] Migration up/down idempotent; FK constraint trỏ về `cash_accounts(id)`.
- [ ] DTO validation: `type=TRANSFER` mà thiếu `toAccountId` → 400.
- [ ] DTO validation: `type≠TRANSFER` mà có `toAccountId` → 400 (hoặc ignore? **Quyết định: 400 cho rõ ràng**).
- [ ] `source = destination` → 400.
- [ ] 2 accounts khác `branchId` → 400 (chỉ transfer trong cùng chi nhánh).
- [ ] TRANSFER: source.balance giảm, destination.balance tăng đúng `amount`, trong 1 transaction.
- [ ] Source balance không đủ → 400 (không cho transfer âm).

## Definition of Done

- [ ] PR có migration + entity + DTO + service update + tests; pass CI.
- [ ] Unit test: TRANSFER happy path → 2 balances update; thiếu toAccountId → 400; source=destination → 400; source insufficient → 400.
- [ ] Integration test: create 2 accounts → TRANSFER → query DB → verify cả 2 balances.

## Tech Approach

### Entity

```typescript
@Column({ name: 'to_account_id', type: 'uuid', nullable: true, comment: 'Destination cash account when type=TRANSFER' })
toAccountId?: string;

@ManyToOne(() => CashAccountEntity, { nullable: true })
@JoinColumn({ name: 'to_account_id' })
toAccount?: CashAccountEntity;
```

### DTO

```typescript
export class RecordCashMovementDto {
  @IsUUID() cashAccountId: string;
  @IsEnum(CashMovementType) type: CashMovementType;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;

  @ValidateIf(o => o.type === CashMovementType.TRANSFER)
  @IsUUID()
  toAccountId?: string;

  @IsOptional() @IsString() @MaxLength(255) reference?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
```

### Service refactor

```typescript
async recordMovement(dto: RecordCashMovementDto, actor: ActorContext): Promise<CashMovementEntity> {
  const source = await this.getAccountForUpdate(dto.cashAccountId, actor);

  if (dto.type === CashMovementType.TRANSFER) {
    if (!dto.toAccountId) throw new BadRequestException('toAccountId required for TRANSFER');
    if (dto.toAccountId === dto.cashAccountId) throw new BadRequestException('source and destination must differ');

    const dest = await this.getAccountForUpdate(dto.toAccountId, actor);
    if (source.branchId !== dest.branchId) throw new BadRequestException('Cross-branch transfer not allowed');
    if (Number(source.balance) < Number(dto.amount)) throw new BadRequestException('Insufficient balance');

    return this.dataSource.transaction(async (m) => {
      source.balance = Number(source.balance) - Number(dto.amount);
      dest.balance = Number(dest.balance) + Number(dto.amount);
      await m.save([source, dest]);

      const movement = m.create(CashMovementEntity, {
        cashAccountId: source.id,
        toAccountId: dest.id,
        type: CashMovementType.TRANSFER,
        amount: dto.amount,
        reference: dto.reference,
        notes: dto.notes,
        organizationId: actor.organizationId,
        branchId: source.branchId,
        createdBy: actor.userId,
      });
      const saved = await m.save(movement);

      // Journal: DR dest.accountId, CR source.accountId — fix bug in TKT-055
      await this.journalService.post({
        source: JournalSource.CASH_MOVEMENT,
        sourceReferenceId: saved.id,
        description: `Transfer ${dto.amount}: ${source.name} → ${dest.name}`,
        lines: [
          { accountId: dest.accountId, debitAmount: Number(dto.amount), creditAmount: 0, lineOrder: 1 },
          { accountId: source.accountId, debitAmount: 0, creditAmount: Number(dto.amount), lineOrder: 2 },
        ],
      }, actor);

      return saved;
    });
  }

  // Non-TRANSFER: existing flow (DEPOSIT/WITHDRAWAL/ADJUSTMENT) — see TKT-055 for journal fix
  return this.recordSingleAccountMovement(dto, source, actor);
}
```

## Testing Strategy

- Unit: TRANSFER updates both balances; throws on validation failures; rollback on journal post failure.
- Integration: 2 accounts → TRANSFER 1000 → query → source -1000, dest +1000.

## Dependencies

- Requires: TKT-053 (type field — TRANSFER thường giữa REGISTER ↔ SAFE).
- Required by: TKT-055, TKT-058.
