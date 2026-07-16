# TKT-DFS-02 Entities + DTOs chứng từ tiền gửi

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Giai đoạn 2: Chi tiêu](../epics/EPIC-15072026-deposit-fund-spending.md)

## Summary

TypeORM entities + class-validator DTOs cho 4 bảng của DFS-01, **mirror 1:1** các entity/DTO trong
`accounting/cash-vouchers/cash-receipts/` và `cash-payments/`. Điểm khác biệt chính so với cash: mọi voucher tiền gửi
**bắt buộc `depositAccountId`** (FR-04 "Tài khoản nhận" / FR-05 "Tài khoản chi" — gap ref.md §13, chưa có ở cash),
và enum purpose theo ref.md §6.4/§6.5. Bao gồm cả `DepositVouchersModule` skeleton (chưa wire service — DFS-03/04 wire).

## Deliverables

- `apps/api/src/modules/accounting/deposit-vouchers/enums.ts` — mirror `cash-vouchers/enums.ts`:
  `BankVoucherStatus` (DRAFT/PENDING_APPROVAL/POSTED/REVERSED), `BankReceiptPurpose` (OTHER/DEBT_COLLECTION/OTHER_INCOME/INTER_BRANCH_IN),
  `BankReceiptReferenceType` (INVOICE_DEBT/RECEIVABLE/TRANSFER/MANUAL/REVERSAL),
  `BankPaymentPurpose` (SUPPLIER_PAYMENT/PURCHASE/EXPENSE/CASH_TRANSFER/INTER_BRANCH_OUT/REFUND/BANK_FEE/OTHER),
  `BankPaymentReferenceType` (GOODS_RECEIPT/PAYABLE/INVOICE/TRANSFER/EXPENSE/MANUAL/REVERSAL),
  `BankVoucherPartnerType` (CUSTOMER/SUPPLIER/EMPLOYEE/OTHER). Values khớp Postgres enums của DFS-01.
- `deposit-vouchers/bank-receipts/bank-receipt.entity.ts` — `BankReceiptEntity` (`@Entity('bank_receipts')`) mirror `cash-receipt.entity.ts`;
  thêm `@Column('uuid') depositAccountId` (NOT NULL), `@ManyToOne(() => DepositAccountEntity)`, `depositMovementId`, `journalEntryId`, `approval*` KHÔNG có ở receipt.
- `deposit-vouchers/bank-receipts/bank-receipt-line.entity.ts` — `BankReceiptLineEntity` mirror `cash-receipt-line.entity.ts` (`@OneToMany` từ header, `cascade`).
- `deposit-vouchers/bank-payments/bank-payment.entity.ts` — `BankPaymentEntity` mirror `cash-payment.entity.ts`; thêm `depositAccountId` NOT NULL + `approvalStatus`/`approvedBy`/`approvedAt` (BR-CHI-03 stub).
- `deposit-vouchers/bank-payments/bank-payment-line.entity.ts` — `BankPaymentLineEntity`.
- `deposit-vouchers/bank-receipts/dto/` — `create-bank-receipt.dto.ts`, `update-bank-receipt.dto.ts`, `query-bank-receipt.dto.ts`, `reverse-bank-receipt.dto.ts`, `bank-receipt-line.dto.ts`, `index.ts` — mirror `cash-receipts/dto/*` + thêm required `depositAccountId`.
- `deposit-vouchers/bank-payments/dto/` — đối xứng: `create-bank-payment.dto.ts` (thêm optional `affectExpense`), `update`, `query`, `reverse`, `bank-payment-line.dto.ts`, `index.ts`.
- `deposit-vouchers/deposit-vouchers.module.ts` — `@Module` khai `TypeOrmModule.forFeature([BankReceiptEntity, BankReceiptLineEntity, BankPaymentEntity, BankPaymentLineEntity])`; import `DepositModule` (GĐ1), `JournalModule`, `DocumentNumberingModule`, `PaymentAccountsModule`. Providers/controllers thêm ở DFS-03/04. Import module vào `AccountingModule`.

## Acceptance Criteria

- [ ] `depositAccountId` là field **required** (`@IsUUID`, `@IsNotEmpty`, `@ApiProperty`) trên create Phiếu thu **và** Phiếu chi (FR-04/05 gap §13); update DTO cho phép đổi khi DRAFT.
- [ ] DTO khai báo **mọi** field (global `whitelist:true` + `forbidNonWhitelisted`); mỗi field có `@ApiProperty`/`@ApiPropertyOptional` + validator (mirror cash DTO chính xác).
- [ ] `create-bank-receipt.dto` có `lines: BankReceiptLineDto[]` (`@ValidateNested({each:true})`, `@ArrayMinSize(1)`); mỗi line `amount` `@IsPositive` (BR-THU-01).
- [ ] `purpose` validate bằng `@IsEnum(BankReceiptPurpose)` / `@IsEnum(BankPaymentPurpose)`; giá trị khớp enum Postgres của DFS-01.
- [ ] `create-bank-payment.dto` có `affectExpense?: boolean` (mặc định false) — DFS-04 sẽ ép false cho CASH_TRANSFER/INTER_BRANCH_OUT (BR-CHI-05).
- [ ] `reverse-*.dto` chỉ có `reason: string` (`@IsString`, `@MaxLength`) — mirror `reverse-cash-receipt.dto.ts`.
- [ ] Entities: PK uuid, `numeric(18,2)` money, `@CreateDateColumn`/`@UpdateDateColumn`, `@DeleteDateColumn` trên header; enum column dùng type Postgres của DFS-01.
- [ ] Module build được (`pnpm --filter @erp/api build`) khi import vào `AccountingModule`, chưa cần controller/service.
- [ ] Không có tiếng Việt trong entity/DTO/enum (identifiers + Swagger English).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] `pnpm --filter @erp/api build` xanh với module đã import.
- [ ] Không đụng `synchronize` / migration (schema từ DFS-01).
- [ ] Không có tiếng Việt trong backend source.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

Copy `cash-receipt.entity.ts` / `cash-payment.entity.ts` + toàn bộ `dto/`, đổi tên `Cash*`→`Bank*`, `cash_receipts`→`bank_receipts`,
thêm cột deposit-specific.

```ts
// bank-receipt.entity.ts (mirror cash-receipt.entity.ts + depositAccountId)
@Entity('bank_receipts')
export class BankReceiptEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') organizationId: string;
  @Column('uuid') branchId: string;
  @Column('uuid') depositAccountId: string;                       // FR-04 required (gap §13)
  @ManyToOne(() => DepositAccountEntity) @JoinColumn({ name: 'deposit_account_id' }) depositAccount?: DepositAccountEntity;
  @Column({ type: 'enum', enum: BankReceiptPurpose }) purpose: BankReceiptPurpose;
  @Column({ type: 'enum', enum: BankVoucherStatus, default: BankVoucherStatus.DRAFT }) status: BankVoucherStatus;
  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 }) totalAmount: string;
  @Column('uuid', { nullable: true }) depositMovementId?: string;
  @Column('uuid', { nullable: true }) journalEntryId?: string;
  @Column('uuid', { nullable: true }) reversesVoucherId?: string;
  @Column({ type: 'text', nullable: true }) reversalReason?: string;
  @OneToMany(() => BankReceiptLineEntity, (l) => l.bankReceipt, { cascade: true }) lines: BankReceiptLineEntity[];
  @CreateDateColumn() createdAt: Date; @UpdateDateColumn() updatedAt: Date; @DeleteDateColumn() deletedAt?: Date;
  // ...doc_date, payer_*, partner_*, reason, collected_by, reference, affect_revenue, contra_account_id, reference_type/id...
}

// create-bank-receipt.dto.ts
export class CreateBankReceiptDto {
  @ApiProperty() @IsUUID() @IsNotEmpty() depositAccountId: string;   // required — the §13 gap
  @ApiProperty({ enum: BankReceiptPurpose }) @IsEnum(BankReceiptPurpose) purpose: BankReceiptPurpose;
  @ApiProperty() @IsDateString() docDate: string;
  @ApiProperty({ type: [BankReceiptLineDto] }) @ValidateNested({ each: true }) @ArrayMinSize(1) @Type(() => BankReceiptLineDto) lines: BankReceiptLineDto[];
  // ...payerName?, partnerType?, partnerId?, reason, collectedBy, reference?, affectRevenue?, contraAccountId?...
}
```

`BankPaymentEntity` thêm `approvalStatus`/`approvedBy`/`approvedAt` (BR-CHI-03 stub) + `affectExpense`. Reuse
`DepositAccountEntity` từ GĐ1 (`accounting/deposit/deposit-account.entity.ts`).

## Testing Strategy

- Không spec riêng (entity/DTO thuần). Validation được cover gián tiếp ở DFS-03/04 service specs + DFS-09 E2E (400 khi thiếu `depositAccountId`).
- `pnpm --filter @erp/api build` là gate chính (TypeORM metadata + circular import check).

## Dependencies

- Depends on: TKT-DFS-01 (tables/enums); EPIC foundation (`DepositAccountEntity`, `DepositMovementEntity`).
- Blocks: TKT-DFS-03, TKT-DFS-04.
