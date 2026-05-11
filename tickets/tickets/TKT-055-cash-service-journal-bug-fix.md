# TKT-055 CashService journal bug fix

## Epic

[EPIC-009 Cash Management Enhancement](../epics/EPIC-009-cash-management-enhancement.md)

## Summary

Fix bug nghiêm trọng trong `CashService.recordMovement()`: hiện tại post journal entry với **cùng `cashAccount.accountId`** cho cả debit và credit line → bút toán tự triệt tiêu, vô nghĩa. Khi có `toAccountId` (TKT-054), TRANSFER có thể fix đúng (DR `toAccount`, CR `fromAccount`). Cho DEPOSIT/WITHDRAWAL/ADJUSTMENT, cần thêm `contraAccountId` (tài khoản đối ứng) trong DTO hoặc derive từ business rule.

## Deliverables

- Update DTO: `RecordCashMovementDto` thêm `contraAccountId` (required cho DEPOSIT/WITHDRAWAL/ADJUSTMENT).
- Refactor `CashService.recordMovement()` — build journal lines đúng theo type.
- Update API docs / OpenAPI để client biết phải truyền `contraAccountId`.
- Test cases cho 4 type với journal verify.

## Acceptance Criteria

- [ ] **TRANSFER**: journal có 2 lines — DR `toAccount.accountId`, CR `fromAccount.accountId`.
- [ ] **DEPOSIT**: journal có 2 lines — DR `cashAccount.accountId` (tăng tiền mặt), CR `contraAccountId` (ví dụ doanh thu 511, tạm ứng, vốn góp...).
- [ ] **WITHDRAWAL**: journal có 2 lines — DR `contraAccountId` (chi phí 642, công nợ 331...), CR `cashAccount.accountId`.
- [ ] **ADJUSTMENT (variance)**: journal có 2 lines — DR/CR variance account (ví dụ TK 711 thừa, TK 811 thiếu) vs `cashAccount.accountId`.
- [ ] DTO validation: thiếu `contraAccountId` cho DEPOSIT/WITHDRAWAL/ADJUSTMENT → 400.
- [ ] Validate `contraAccountId` khác `cashAccount.accountId` để không tự triệt tiêu.

## Definition of Done

- [ ] PR có DTO + service fix + tests; pass CI.
- [ ] Unit test mỗi type với assertion journal lines đúng accounts/amounts.
- [ ] Integration test: record DEPOSIT 1000 → query `journal_lines` → có DR cash 1000 + CR contra 1000.

## Tech Approach

### Current bug

```typescript
// CURRENT (BROKEN) — both lines use cashAccount.accountId
const isDebit = type === DEPOSIT || type === ADJUSTMENT;
lines: [
  { accountId: cashAccount.accountId, debitAmount: isDebit ? amount : 0, creditAmount: isDebit ? 0 : amount },
  { accountId: cashAccount.accountId, debitAmount: isDebit ? 0 : amount, creditAmount: isDebit ? amount : 0 }, // SAME ACCOUNT!
]
```

### Fixed approach

```typescript
private buildJournalLines(
  type: CashMovementType,
  amount: number,
  cashAccountId: string,
  contraAccountId: string,
  toAccountId?: string,
): JournalLineInput[] {
  const amt = Number(amount);

  switch (type) {
    case CashMovementType.TRANSFER:
      // DR destination (money in), CR source (money out)
      return [
        { accountId: toAccountId!, debitAmount: amt, creditAmount: 0, lineOrder: 1 },
        { accountId: cashAccountId, debitAmount: 0, creditAmount: amt, lineOrder: 2 },
      ];

    case CashMovementType.DEPOSIT:
      // DR cash (money in), CR contra (revenue/loan/etc.)
      return [
        { accountId: cashAccountId, debitAmount: amt, creditAmount: 0, lineOrder: 1 },
        { accountId: contraAccountId, debitAmount: 0, creditAmount: amt, lineOrder: 2 },
      ];

    case CashMovementType.WITHDRAWAL:
      // DR contra (expense/payable), CR cash (money out)
      return [
        { accountId: contraAccountId, debitAmount: amt, creditAmount: 0, lineOrder: 1 },
        { accountId: cashAccountId, debitAmount: 0, creditAmount: amt, lineOrder: 2 },
      ];

    case CashMovementType.ADJUSTMENT:
      // Variance: positive = over (DR cash, CR other income 711), negative is recorded as separate WITHDRAWAL
      // For simplicity, treat ADJUSTMENT as a positive adjustment to cash
      return [
        { accountId: cashAccountId, debitAmount: amt, creditAmount: 0, lineOrder: 1 },
        { accountId: contraAccountId, debitAmount: 0, creditAmount: amt, lineOrder: 2 },
      ];
  }
}
```

### DTO update

```typescript
export class RecordCashMovementDto {
  @IsUUID() cashAccountId: string;
  @IsEnum(CashMovementType) type: CashMovementType;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;

  @ValidateIf(o => o.type === CashMovementType.TRANSFER)
  @IsUUID() toAccountId?: string;

  @ValidateIf(o => o.type !== CashMovementType.TRANSFER)
  @IsUUID() contraAccountId?: string;

  @IsOptional() @IsString() @MaxLength(255) reference?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
```

### Service validation

```typescript
if (dto.type !== CashMovementType.TRANSFER) {
  if (!dto.contraAccountId) throw new BadRequestException('contraAccountId required');
  if (dto.contraAccountId === cashAccount.accountId) {
    throw new BadRequestException('contra account must differ from cash account');
  }
}
```

## Testing Strategy

- Unit test 4 types — verify lines structure (accountId, debit/credit amounts, lineOrder).
- Verify totalDebits === totalCredits cho mọi type (JournalService.validateBalance pass).
- Integration: record movement → query journal_entries + journal_lines → verify structure.

## Dependencies

- Requires: TKT-054 (toAccountId cho TRANSFER).
- Required by: TKT-058 (integration với checkout).
