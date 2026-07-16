# TKT-DFS-03 BankReceiptService + Controller (Phiếu thu tiền gửi)

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Giai đoạn 2: Chi tiêu](../epics/EPIC-15072026-deposit-fund-spending.md)

## Summary

`BankReceiptService` + `BankReceiptController` cho Phiếu thu tiền gửi (FR-04) — **mirror `CashReceiptsService` /
`CashReceiptsController` 1:1**. CRUD DRAFT (PATCH upsert `lines[]`) + `POST /:id/post` (sinh `deposit_movements(DEPOSIT)`
+ journal entry qua `DepositService.recordMovement`) + `POST /:id/reverse` (copy lines giữ `amount > 0`, movement type đảo
`WITHDRAWAL`, journal `reverse`, lưu `reversal_reason`). Ship 2 internal method `createAndPostInternal()` +
`createVoucherForMovement()` để DFS-05 (saga NCC) và DFS-06 (swap) tái dùng.

## Deliverables

- `apps/api/src/modules/accounting/deposit-vouchers/bank-receipts/bank-receipts.service.ts` — `BankReceiptService` mirror `cash-receipts.service.ts`.
- `deposit-vouchers/bank-receipts/bank-receipts.controller.ts` — `BankReceiptController`, base route `bank-receipts`, `@UseGuards(PermissionGuard, BranchScopeGuard)`, `@RequireBranchScope()`, `@Actor()`, `@UseInterceptors(AuditInterceptor)`.
- `deposit-vouchers/bank-receipts/bank-receipts.service.spec.ts` — unit spec.
- Cập nhật `deposit-vouchers/deposit-vouchers.module.ts` — thêm `BankReceiptService` provider + `BankReceiptController`, export `BankReceiptService`.
- Permissions seed — `accounting.bank_receipt.{create,read,update,delete,post,reverse}` cạnh perms accounting hiện có (seeder RBAC).

## Endpoints (mirror cash-receipts)

| Method | Path | Perm | Ghi chú |
| --- | --- | --- | --- |
| POST | `/bank-receipts` | `accounting.bank_receipt.create` | Tạo DRAFT; validate `depositAccountId` thuộc org+branch; `total = Σlines` |
| GET | `/bank-receipts` | `accounting.bank_receipt.read` | List, filter `search`/`purpose`/`status`/`depositAccountId`/date; scope org+branch |
| GET | `/bank-receipts/:id` | `accounting.bank_receipt.read` | Detail + lines |
| PATCH | `/bank-receipts/:id` | `accounting.bank_receipt.update` | Chỉ khi DRAFT; upsert `lines[]`; re-validate total |
| DELETE | `/bank-receipts/:id` | `accounting.bank_receipt.delete` | Soft-delete, chỉ khi DRAFT |
| POST | `/bank-receipts/:id/post` | `accounting.bank_receipt.post` | DRAFT→POSTED; sinh movement(DEPOSIT)+JE |
| POST | `/bank-receipts/:id/reverse` | `accounting.bank_receipt.reverse` | POSTED→REVERSED + reversal voucher |

## Acceptance Criteria

- [ ] **BR-THU-01**: `create`/`update`/`post` validate `total_amount === Σ lines.amount` và `> 0`; lệch → 400.
- [ ] **FR-04 (gap §13)**: `depositAccountId` bắt buộc; service validate account tồn tại, `status=ACTIVE`, cùng `actor.organizationId` + `actor.branchId`; sai → 400/404.
- [ ] **Purposes**: `OTHER` / `DEBT_COLLECTION` (Thu nợ) / `OTHER_INCOME` / `INTER_BRANCH_IN` (stub GĐ4, chấp nhận nhưng không mở luồng xác nhận ở GĐ2).
- [ ] **BR-THU-02**: `purpose = DEBT_COLLECTION` → bắt buộc `partnerType`+`partnerId` (khách/NCC) + `referenceType`+`referenceId` (công nợ); mỗi allocation `amount ≤ remaining debt`, vượt → 400.
- [ ] **BR-THU-03**: Phiếu thu thủ công mặc định `recon_status = CHUA` (do movement mang recon_status; verify default GĐ1).
- [ ] **POST**: mở tx, `DepositService.recordMovement({DEPOSIT, depositAccountId, amount: total}, actor, manager)` → `{movement, journalEntryId}`; set `status=POSTED`, link `deposit_movement_id` + `journal_entry_id`; `deposit_accounts.balance` +total.
- [ ] **REVERSE**: chỉ POSTED; tạo reversal voucher header `reverses_voucher_id=original.id`, `reference_type=REVERSAL`, `reference_id=original.id`, lines **copy giữ amount>0**, `total_amount` dương; movement type đảo `WITHDRAWAL`; `JournalService.reverse(original.journalEntryId, manager)`; set original `status=REVERSED` + `reversed_by_voucher_id`; balance tự khôi phục. Idempotent qua `uniq_bank_receipts_reversal`.
- [ ] `createAndPostInternal(dto, actor, manager)` — tạo movement+JE+voucher POSTED atomic trong tx caller (dùng cho swap/variance).
- [ ] `createVoucherForMovement({depositMovementId, journalEntryId, ...}, manager)` — chỉ tạo voucher document link vào movement+JE có sẵn (không sinh movement mới).
- [ ] Mọi query filter `actor.organizationId` + `actor.branchId` (BR-PERM-01, UAT-13); không leak.
- [ ] Mutation kế thừa `IdempotencyInterceptor` (không tự implement).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] Spec phủ: create total-mismatch 400, DEBT_COLLECTION over-remaining 400, post → balance+JE, reverse → REVERSED + balance khôi phục, reverse lần 2 no-op/409.
- [ ] Endpoints mới → openapi regen ở TKT-DFS-07.
- [ ] Không đụng `synchronize` / migration.
- [ ] Không có tiếng Việt trong backend source.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

Mirror `cash-receipts.service.ts` (~29KB). Thay `CashService.recordMovement` → `DepositService.recordMovement`
(GĐ1, cùng signature `(dto, actor, manager?) => {movement, journalEntryId}`), `CashReceiptEntity` → `BankReceiptEntity`,
`DocumentType.CASH_RECEIPT` → `DocumentType.BANK_RECEIPT` (prefix `NTTK`).

```ts
@Injectable()
export class BankReceiptService {
  constructor(
    @InjectRepository(BankReceiptEntity) private readonly repo: Repository<BankReceiptEntity>,
    private readonly deposit: DepositService,               // GĐ1
    private readonly journal: JournalService,
    private readonly docNumber: DocumentNumberingService,
    private readonly accountResolver: AccountResolverService,
    private readonly dataSource: DataSource,
  ) {}

  async post(id: string, actor: ActorContext) {
    return this.dataSource.transaction(async (m) => {
      const v = await m.findOne(BankReceiptEntity, { where: { id, organizationId: actor.organizationId, branchId: actor.branchId }, relations: ['lines'], lock: { mode: 'pessimistic_write' } });
      if (!v || v.status !== BankVoucherStatus.DRAFT) throw new BadRequestException('...');
      this.assertTotalMatchesLines(v);                     // BR-THU-01
      const number = await this.docNumber.generate(DocumentType.BANK_RECEIPT, actor.branchId, actor);
      const contra = await this.accountResolver.resolveContraAccount('BANK_RECEIPT', actor, v.contraAccountId);
      const { movement, journalEntryId } = await this.deposit.recordMovement(
        { type: DepositMovementType.DEPOSIT, depositAccountId: v.depositAccountId, amount: v.totalAmount, source: 'MANUAL', /*journal contra*/ }, actor, m);
      Object.assign(v, { status: BankVoucherStatus.POSTED, documentNumber: number, depositMovementId: movement.id, journalEntryId });
      return m.save(v);
    });
  }

  async reverse(id: string, reason: string, actor: ActorContext) { /* copy lines amount>0, DEPOSIT→WITHDRAWAL, journal.reverse; dedupe via uniq_bank_receipts_reversal */ }

  async createAndPostInternal(dto, actor, m: EntityManager) { /* movement+JE+voucher POSTED atomic — used by swap DFS-06 */ }
  async createVoucherForMovement(args, m: EntityManager) { /* link voucher to existing movement+JE */ }
}
```

Controller mirror `cash-receipts.controller.ts` (base route đổi `cash-receipts`→`bank-receipts`, perms `bank_receipt.*`).

## Testing Strategy

- Unit (`bank-receipts.service.spec.ts`): mirror `cash-receipts.service.spec.ts`. Mock `DepositService.recordMovement`,
  `JournalService`, `DocumentNumberingService`. Cases: total-mismatch → 400; post → recordMovement(DEPOSIT) gọi đúng args
  + voucher POSTED link movement/JE; reverse → lines copy amount>0, recordMovement(WITHDRAWAL), journal.reverse, original REVERSED;
  DEBT_COLLECTION over-remaining → 400; cross-branch fetch → not found.
- E2E: post + balance assertion nằm ở DFS-09 (UAT chi tiêu). Reverse-idempotency verify qua unique index (spec mock hoặc e2e).

## Dependencies

- Depends on: TKT-DFS-02 (entities/DTOs); EPIC foundation (`DepositService.recordMovement`).
- Blocks: TKT-DFS-05 (saga dùng `createAndPostInternal`), TKT-DFS-06 (swap dùng `createVoucherForMovement`), TKT-DFS-07.
