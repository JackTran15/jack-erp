# TKT-053 Cash account type field

## Epic

[EPIC-009 Cash Management Enhancement](../epics/EPIC-009-cash-management-enhancement.md)

## Summary

Thêm field `type` vào `cash_accounts` để phân biệt loại két: `REGISTER` (két quầy POS gắn terminal), `SAFE` (két chính chi nhánh), `PETTY_CASH` (quỹ lẻ chi phí vặt). Hiện tại tất cả két đều ngang hàng, chỉ phân biệt qua tên — không có nghiệp vụ rõ ràng.

## Deliverables

- Migration: `1779500000000-AddCashAccountType.ts` — enum `cash_account_type_enum` + column `type` (default `REGISTER`).
- Update entity: `apps/api/src/modules/accounting/cash/cash-account.entity.ts` — thêm `CashAccountType` enum + `type` column.
- Update shared interface: `packages/shared-interfaces/src/accounting/index.ts` — thêm `CashAccountType` enum + `type` field trong `CashAccount` interface.
- Update DTO: `apps/api/src/modules/accounting/cash/dto/create-cash-account.dto.ts` — thêm `type` (`@IsEnum(CashAccountType)`).
- Update service: `CashService.listAccounts()` — hỗ trợ filter `type` query param.
- Update controller endpoint: `GET /cash-accounts?type=REGISTER`.

## Acceptance Criteria

- [ ] Migration up: thêm enum + column, default `REGISTER` cho rows hiện có; down: drop column + enum.
- [ ] `POST /cash-accounts` validate `type` — thiếu hoặc giá trị invalid → 400.
- [ ] `GET /cash-accounts?type=SAFE` chỉ trả két type=SAFE.
- [ ] Entity + interface đồng bộ — backoffice TypeScript build pass.
- [ ] Backward compat: API không truyền `type` → default `REGISTER`? **Quyết định: bắt buộc truyền type, không có default** (rõ ràng hơn cho UI/UX).

## Definition of Done

- [ ] PR có migration + entity + DTO + service + interface; pass CI lint + build + unit tests.
- [ ] Unit test: create với mỗi type → success; create thiếu type → 400; list filter by type.
- [ ] Migration test: run lên DB có rows → verify default `REGISTER`.

## Tech Approach

### Enum

```typescript
// apps/api/src/modules/accounting/cash/cash-account.entity.ts
export enum CashAccountType {
  REGISTER = 'REGISTER',     // Két quầy POS, gắn với terminal
  SAFE = 'SAFE',             // Két chính chi nhánh
  PETTY_CASH = 'PETTY_CASH', // Quỹ lẻ chi phí vặt
}
```

### Entity column

```typescript
@Column({
  type: 'enum',
  enum: CashAccountType,
  default: CashAccountType.REGISTER,
  comment: 'REGISTER=két quầy POS, SAFE=két chính chi nhánh, PETTY_CASH=quỹ lẻ',
})
type: CashAccountType;
```

### Migration

```typescript
public async up(qr: QueryRunner): Promise<void> {
  await qr.query(`CREATE TYPE cash_account_type_enum AS ENUM ('REGISTER', 'SAFE', 'PETTY_CASH')`);
  await qr.query(`ALTER TABLE cash_accounts ADD COLUMN type cash_account_type_enum NOT NULL DEFAULT 'REGISTER'`);
}

public async down(qr: QueryRunner): Promise<void> {
  await qr.query(`ALTER TABLE cash_accounts DROP COLUMN type`);
  await qr.query(`DROP TYPE cash_account_type_enum`);
}
```

### DTO

```typescript
export class CreateCashAccountDto {
  @IsString() @MaxLength(200) name: string;
  @IsEnum(CashAccountType) type: CashAccountType;
  @IsUUID() accountId: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) balance?: number;
}
```

## Testing Strategy

- Unit: create variations of type; list filter; missing type → ValidationPipe rejects.
- Migration: run up + down + up cycle, verify schema and data.

## Dependencies

- Requires: `CashAccountEntity` (existing TKT-016).
- Required by: TKT-054, TKT-056, TKT-058.
