# TKT-DF-03 DepositModule + DepositService.recordMovement + DepositFundResolverService + CRUD register

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Nền tảng](../epics/EPIC-15072026-deposit-fund-foundation.md)

## Summary

Xây phần lõi backend của quỹ tiền gửi: entity classes cho 4 bảng (TKT-DF-01), `DepositModule` skeleton, và
`DepositService.recordMovement(dto, actor, manager?)` — **mirror 1:1 `CashService.recordMovement`**: trả
`{ movement, journalEntryId }`, chặn số dư âm qua `SELECT deposit_account FOR UPDATE` (NFR-03), post journal entry
qua `JournalService.post()` với `source = BANK_MOVEMENT`, cập nhật `deposit_account.balance` real-time. Thêm
`DepositFundResolverService.resolveBranchDefaultAccount()` (mirror `CashFundResolverService`) để tìm tài khoản mặc
định của chi nhánh (BR-ACC-03). Đăng ký `banks`, `deposit_accounts`, `deposit_payment_policy` qua
`EntityRegistryService` (generic CRUD — không hand-build admin page). Ship sẵn 2 internal method
`createAndPostInternal()` + `createVoucherForMovement()` cho FR-03 (DF-05) và GĐ2.

## Deliverables

- `apps/api/src/modules/accounting/deposit/deposit.module.ts` — `@Module` + `OnModuleInit` đăng ký CRUD entity; providers gồm `DepositFundResolverService` + `DepositRoutingService` (logic resolve ở DF-04).
- `apps/api/src/modules/accounting/deposit/deposit-account.entity.ts` — mirror `cash-account.entity.ts`.
- `apps/api/src/modules/accounting/deposit/deposit-movement.entity.ts` — mirror `cash-movement.entity.ts` + cột recon/fee/value_date.
- `apps/api/src/modules/accounting/deposit/bank.entity.ts` — catalog ngân hàng.
- `apps/api/src/modules/accounting/deposit/deposit-payment-policy.entity.ts` — bảng FR-02 mỏng (fee/settlement/effective + override quỹ tùy chọn); `DepositRoutingService` dùng ở DF-04.
- `apps/api/src/modules/accounting/deposit/deposit.service.ts` — `recordMovement` + `createAndPostInternal` + `createVoucherForMovement`.
- `apps/api/src/modules/accounting/deposit/deposit-fund-resolver.service.ts` — mirror `cash-fund-resolver.service.ts`.
- `apps/api/src/modules/accounting/deposit/dto/record-movement.dto.ts` — internal DTO (class-validator + `@ApiProperty`).
- `apps/api/src/modules/accounting/deposit/crud/*.crud-config.ts` — `CrudEntityConfig` cho `banks`, `deposit_accounts`, `deposit_payment_policy`.
- Wire `DepositModule` vào `accounting.module.ts` (hoặc `AppModule` nếu accounting là barrel).

## Acceptance Criteria

- [ ] `recordMovement(dto, actor, manager?)` trả `{ movement: DepositMovementEntity, journalEntryId: string }` (mirror contract cash sau TKT-CV-00). Truyền `manager?` → compose vào TX caller; không truyền → tự mở `dataSource.transaction`.
- [ ] `SELECT deposit_account ... FOR UPDATE` trước khi tính balance; `WITHDRAWAL`/`TRANSFER` làm `newBalance < 0` và `allow_negative = false` → `throw BadRequestException` (thông điệp English, align với chuỗi E2E assert) (BR-CHI-01 / NFR-03).
- [ ] JE post qua `JournalService.post({ source: JournalSource.BANK_MOVEMENT, ... }, manager)`; `journal_entry_id` được set trên movement cùng TX.
- [ ] `deposit_account.balance` cập nhật real-time trong cùng TX với insert movement (không drift).
- [ ] Signed balance đúng convention: `DEPOSIT` → `+amount`; `WITHDRAWAL` → `−amount`; `TRANSFER` (1 row, `deposit_account_id`=nguồn, `to_account_id`=đích) → nguồn `−amount` + đích `+amount` (mirror cash TRANSFER 1-row).
- [ ] Mọi query filter `actor.organizationId` (+ `branchId` khi scope demands); không leak cross-branch (BR-PERM-01 / UAT-13).
- [ ] `DepositFundResolverService.resolveBranchDefaultAccount(orgId, branchId)` trả tài khoản `is_default = true, status = ACTIVE` của chi nhánh; không có → `throw` lỗi rõ ràng (BR-ACC-03; consumer DF-05 xử lý, không block sale).
- [ ] `banks`, `deposit_accounts`, `deposit_payment_policy` đăng ký `registerEntity(config, token)` trong `onModuleInit` → tự có `/admin/entities/:entityKey/records` + route `/admin/:entityKey`.
- [ ] CRUD config: `deposit_accounts` `scopingPolicy = BRANCH`, `deletionPolicy = SOFT`; `banks`/`deposit_payment_policy` `scopingPolicy = ORGANIZATION`. `deposit_accounts` xóa cứng bị chặn nếu đã có movement (BR-ACC-01 → chỉ INACTIVE; enforce ở service hoặc soft-delete guard).
- [ ] `createAndPostInternal()` (movement + JE + set journal_entry_id atomic) và `createVoucherForMovement()` (chỉ tạo/link voucher vào movement+JE có sẵn) tồn tại, signature mirror cash, dùng được ở DF-05/GĐ2.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] Spec phủ happy path (DEPOSIT/WITHDRAWAL/TRANSFER balance) + edge (số dư âm bị chặn, allow_negative bypass, resolver không có default account, cross-branch scope).
- [ ] Không đổi schema ngoài TKT-DF-01; `synchronize` giữ false.
- [ ] Endpoint generic-CRUD mới → openapi regen ở **TKT-DF-08**.
- [ ] Không có tiếng Việt trong backend source.
- [ ] Không có TODO/FIXME ngoài kế hoạch.

## Tech Approach

Mirror `apps/api/src/modules/accounting/cash/cash.service.ts` (`recordMovement`, negative guard `cash.service.ts:201-205`,
`SELECT cash_account FOR UPDATE`) và `cash-fund-resolver.service.ts`. JE qua `accounting/journal/journal.service.ts`
(`post`/`reverse` nhận `manager?` sau TKT-CV-00). Contra COA lấy qua caller (DF-05 truyền `contraAccountId`), account debit =
`deposit_account.account_id` (COA 112x seeded ở `accounting/seeders/coa-seeder.service.ts`).

```ts
@Injectable()
export class DepositService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly journal: JournalService,
  ) {}

  async recordMovement(
    dto: RecordDepositMovementDto,
    actor: ActorContext,
    manager?: EntityManager,
  ): Promise<{ movement: DepositMovementEntity; journalEntryId: string }> {
    const run = async (m: EntityManager) => {
      const acc = await m.findOne(DepositAccountEntity, {
        where: { id: dto.depositAccountId, organizationId: actor.organizationId },
        lock: { mode: 'pessimistic_write' }, // SELECT ... FOR UPDATE (NFR-03)
      });
      if (!acc) throw new NotFoundException('Deposit account not found');
      const signed = this.signedDelta(dto.type, dto.amount);       // DEPOSIT +, WITHDRAWAL/TRANSFER(src) −
      const newBalance = Number(acc.balance) + signed;
      if (newBalance < 0 && !acc.allowNegative)
        throw new BadRequestException('Insufficient deposit balance'); // align w/ E2E assert
      const je = await this.journal.post(
        { source: JournalSource.BANK_MOVEMENT, referenceType: 'DEPOSIT_MOVEMENT',
          organizationId: actor.organizationId, branchId: acc.branchId,
          lines: this.buildLines(dto, acc) }, m);
      const movement = await m.save(m.create(DepositMovementEntity, {
        ...dto, organizationId: actor.organizationId, branchId: acc.branchId,
        feeAmount: 0, netAmount: dto.amount, journalEntryId: je.id, reconStatus: ReconStatus.CHUA }));
      acc.balance = String(newBalance);
      await m.save(acc);
      // TRANSFER: mirror-credit to_account within same TX
      return { movement, journalEntryId: je.id };
    };
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  // FR-03 (DF-05) + GĐ2: create movement + JE + voucher atomically
  async createAndPostInternal(dto, actor, manager?) { /* recordMovement + optional voucher */ }
  // GĐ2: only build voucher document linking an existing movement + JE
  async createVoucherForMovement(args: { depositMovementId; journalEntryId; ... }, actor, manager?) { /* ... */ }
}
```

Resolver:

```ts
@Injectable()
export class DepositFundResolverService {
  constructor(@InjectRepository(DepositAccountEntity) private repo: Repository<DepositAccountEntity>) {}
  async resolveBranchDefaultAccount(organizationId: string, branchId: string): Promise<DepositAccountEntity> {
    const acc = await this.repo.findOne({
      where: { organizationId, branchId, isDefault: true, status: DepositAccountStatus.ACTIVE },
    });
    if (!acc) throw new NotFoundException(`No default deposit account for branch ${branchId}`); // BR-ACC-03
    return acc;
  }
}
```

CRUD register (mirror `accounting/coa/coa.service.ts` `ACCOUNT_ENTITY_CONFIG`):

```ts
onModuleInit() {
  this.registry.registerEntity(BANK_ENTITY_CONFIG, BANK_SERVICE);
  this.registry.registerEntity(DEPOSIT_ACCOUNT_ENTITY_CONFIG, DEPOSIT_ACCOUNT_SERVICE); // ScopingPolicy.BRANCH, DeletionPolicy.SOFT
  this.registry.registerEntity(DEPOSIT_PAYMENT_POLICY_ENTITY_CONFIG, DEPOSIT_PAYMENT_POLICY_SERVICE);
}
```

## Testing Strategy

- **Unit** (`deposit.service.spec.ts`): DEPOSIT → balance +; WITHDRAWAL đủ số dư → balance −; WITHDRAWAL vượt số dư & `allow_negative=false` → `BadRequestException`; `allow_negative=true` → cho âm; TRANSFER → nguồn −, đích +; JE post gọi với `source=BANK_MOVEMENT`; `manager?` compose không mở TX lồng.
- **Unit** (`deposit-fund-resolver.service.spec.ts`): trả default account; không có → throw; scope theo org/branch.
- **Unit** CRUD config: `deposit_accounts` = BRANCH scope + SOFT delete; `banks`/`deposit_payment_policy` = ORG scope.
- Số dư âm race + auto-post idempotent → **E2E** ở TKT-DF-11 (UAT-03; và UAT-04/05 semantic verify ở GĐ2).

## Dependencies

- Depends on: TKT-DF-01 (schema), TKT-DF-02 (enums + JournalSource.BANK_MOVEMENT).
- Blocks: TKT-DF-04 (`DepositRoutingService` resolve logic), TKT-DF-06 (ledger reads entity), TKT-DF-07 (permissions cho controller).
