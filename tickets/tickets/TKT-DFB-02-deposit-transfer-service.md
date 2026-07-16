# TKT-DFB-02 `DepositTransferService` + controller (FR-07)

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Chuyển tiền liên chi nhánh (GĐ4)](../epics/EPIC-15072026-deposit-fund-inter-branch.md)

## Summary

Hiện thực FR-07: dịch vụ chuyển tiền gửi liên chi nhánh theo mô hình **2 chân + trạng thái trung gian**. **Chân A** (khởi tạo tại A): tạo `bank_payment` purpose `INTER_BRANCH_OUT`, **ghi giảm quỹ A NGAY khi lưu** (BR-TRF-01), `deposit_transfer.status = DANG_CHUYEN`; khoản tiền đọng ở TK 113, **quỹ B chưa tăng**. **Chân B** (B xác nhận nhận tiền): tạo `bank_receipt` purpose `INTER_BRANCH_IN` ghi tăng quỹ B, set `status = HOAN_TAT`, đóng khoản in-transit. Hỗ trợ **hủy** chỉ khi còn `DANG_CHUYEN` (reverse chân A). Sau khi B xác nhận, A **không** sửa/hủy được (BR-TRF-03). Cả hai chân **không** ảnh hưởng doanh thu/chi phí (BR-TRF-05). Mỗi chân atomic trong phạm vi 1 chi nhánh; phần liên-chi-nhánh cố ý 2-bước.

## Deliverables

- `apps/api/src/modules/accounting/deposit-vouchers/deposit-transfer/deposit-transfer.service.ts` — `DepositTransferService` với `create` / `confirm` / `cancel` / `list`.
- `apps/api/src/modules/accounting/deposit-vouchers/deposit-transfer/deposit-transfer.controller.ts` — `DepositTransferController` (`@UseGuards(PermissionGuard, BranchScopeGuard)`, `@RequireBranchScope()`, `@Actor()`, `@UseInterceptors(AuditInterceptor)`).
- `apps/api/src/modules/accounting/deposit-vouchers/deposit-transfer/dto/create-deposit-transfer.dto.ts` — `toBranchId`, `toAccountId`, `amount`, `note?` (validate + `@ApiProperty`).
- `.../dto/confirm-deposit-transfer.dto.ts` — `note?` (chân B có thể ghi chú); `.../dto/cancel-deposit-transfer.dto.ts` — `reason` (required).
- `.../dto/list-deposit-transfers.query.ts` — `status?`, `branchId?`, `direction?(OUT|IN)`, `dateFrom?`, `dateTo?`, `page?`, `pageSize?`.
- `apps/api/src/modules/accounting/deposit-vouchers/deposit-vouchers.module.ts` — provide `DepositTransferService`, register `DepositTransferController`, import `BankPaymentService`/`BankReceiptService`/`DepositService` (GĐ1-GĐ2), `TypeOrmModule.forFeature([DepositTransferEntity])`.
- `apps/api/src/modules/rbac/seeders/*` (hoặc nơi seed permission accounting) — seed `accounting.deposit_transfer.create`, `.confirm`, `.cancel`, `.read`.

## Acceptance Criteria

- [ ] **BR-TRF-01**: `create` ghi giảm `deposit_accounts.balance` của A **ngay** (qua `recordMovement(WITHDRAWAL)` với `SELECT deposit_account FOR UPDATE`); quỹ B **không** đổi. Response `status = DANG_CHUYEN`.
- [ ] **BR-TRF-02 / R5**: chân A sinh JE `DR 113 / CR 112(A)` → tiền nằm ở TK 113 (tài khoản trung gian), không "mất" khỏi sổ tổng. Chân B sinh `DR 112(B) / CR 113` → clear 113.
- [ ] **BR-TRF-03**: `cancel` chỉ chạy khi `status = DANG_CHUYEN`; nếu `HOAN_TAT` → `409 Conflict` (A khóa sau khi B xác nhận). `confirm` chỉ chạy khi `status = DANG_CHUYEN`; gọi lần 2 → 409.
- [ ] **BR-TRF-04**: (ngưỡng cảnh báo quá hạn hiện ở báo cáo TKT-DFB-03 — ticket này chỉ đảm bảo `initiated_at` được set để tính tuổi khoản; không cron).
- [ ] **BR-TRF-05**: không có dòng JE nào đụng tài khoản doanh thu/chi phí (511/6xx/7xx/8xx) ở cả 2 chân — chỉ 112x ↔ 113. Không có cờ "Tính vào doanh thu/chi phí".
- [ ] **BR-PERM-01**: `create` yêu cầu `actor.branchId === fromBranchId` (A là chi nhánh đang đăng nhập); `confirm` yêu cầu `actor.branchId === toBranchId` (B). `toBranchId`/`toAccountId` phải thuộc cùng `organizationId`; sai → 400/403. `list` lọc theo chi nhánh user được gán.
- [ ] `create` validate: `toAccountId` là `deposit_accounts` ACTIVE thuộc `toBranchId`; `fromAccountId` = default deposit account của A (hoặc nhận tường minh, validate thuộc A); `amount > 0`; A ≠ B.
- [ ] `confirm` set `to_receipt_id`, `confirmed_by`/`confirmed_at`, `status = HOAN_TAT`, cập nhật `transfer_status` của movement chân A → `HOAN_TAT` (status flag, không sửa cột tài chính → giữ append-only).
- [ ] Số dư âm bị chặn ở chân A nếu `allow_negative=false` (reuse guard `recordMovement`): số dư A không đủ → 400 với message số dư khả dụng (UAT-04 pattern).
- [ ] Idempotent: `create`/`confirm`/`cancel` kế thừa `IdempotencyInterceptor` (`X-Idempotency-Key`); ngoài ra unique `deposit_movements(source='TRANSFER', source_ref_id=transfer.id, source_ref_line_id)` chặn tạo trùng chân (line `'OUT'` cho A, `'IN'` cho B) — replay confirm không tạo movement thứ 2 (D2).
- [ ] Mỗi chân atomic: chân A (payment + JE + movement + insert header) trong **1 TX**; chân B (receipt + JE + movement + update header) trong **1 TX**. Cross-branch là 2 lời gọi riêng theo thiết kế.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] Spec phủ: create giảm A / B không đổi, confirm tăng B / status HOAN_TAT, cancel khi DANG_CHUYEN, cancel/confirm sau HOAN_TAT → 409, cross-tenant/cross-branch chặn, số dư âm chặn, replay idempotent.
- [ ] Không đổi schema ngoài migration DFB-01; `synchronize` giữ `false`.
- [ ] Endpoint mới → openapi regen ở TKT-DFB-04.
- [ ] Không có tiếng Việt trong backend source.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

Service (compose vào TX của các service GĐ2; `createAndPostInternal` / `reverse` nhận `manager?`):

```ts
@Injectable()
export class DepositTransferService {
  constructor(
    @InjectRepository(DepositTransferEntity) private readonly repo: Repository<DepositTransferEntity>,
    private readonly dataSource: DataSource,
    private readonly bankPayments: BankPaymentService,   // GĐ2
    private readonly bankReceipts: BankReceiptService,   // GĐ2
    private readonly depositAccounts: DepositAccountService, // GĐ1 (validate/resolve)
  ) {}

  /** Chân A — khởi tạo tại CN A. Giảm quỹ A ngay (BR-TRF-01). */
  async create(dto: CreateDepositTransferDto, actor: ActorContext) {
    if (dto.toBranchId === actor.branchId) throw new BadRequestException('Source and destination branch must differ');
    const from = await this.depositAccounts.resolveDefault(actor.branchId, actor); // deposit_accounts @ A
    const to   = await this.depositAccounts.getForBranch(dto.toAccountId, dto.toBranchId, actor); // validate org+branch
    return this.dataSource.transaction(async (m) => {
      const transferId = randomUUID();
      // Leg A: bank_payment INTER_BRANCH_OUT → WITHDRAWAL movement (SELECT FOR UPDATE, guard negative), JE DR 113 / CR 112(A)
      const { voucher: payment } = await this.bankPayments.createAndPostInternal({
        purpose: DepositVoucherPurpose.INTER_BRANCH_OUT,
        depositAccountId: from.id,
        contraRole: 'INTER_BRANCH_OUT',          // → resolveContraAccount = 113
        amount: dto.amount,
        source: DepositMovementSource.TRANSFER,
        sourceRefId: transferId,
        sourceRefLineId: 'OUT',                   // D2 idempotency grain
        transferPairId: transferId,
        transferStatus: DepositTransferStatus.DANG_CHUYEN,
        note: dto.note,
      }, actor, m);
      return m.getRepository(DepositTransferEntity).save({
        id: transferId, organizationId: actor.organizationId,
        fromBranchId: actor.branchId, toBranchId: dto.toBranchId,
        fromAccountId: from.id, toAccountId: to.id,
        amount: dto.amount, status: DepositTransferStatus.DANG_CHUYEN,
        fromPaymentId: payment.id, toReceiptId: null,
        transferPairId: transferId, initiatedBy: actor.userId, initiatedAt: new Date(),
        note: dto.note ?? null,
      });
    });
  }

  /** Chân B — CN B xác nhận nhận tiền. Tăng quỹ B, đóng in-transit. */
  async confirm(id: string, dto: ConfirmDepositTransferDto, actor: ActorContext) {
    return this.dataSource.transaction(async (m) => {
      const t = await m.getRepository(DepositTransferEntity).findOne({
        where: { id, organizationId: actor.organizationId }, lock: { mode: 'pessimistic_write' } });
      if (!t) throw new NotFoundException();
      if (t.toBranchId !== actor.branchId) throw new ForbiddenException('Only destination branch can confirm');
      if (t.status !== DepositTransferStatus.DANG_CHUYEN) throw new ConflictException('Transfer is not in transit'); // BR-TRF-03
      // Leg B: bank_receipt INTER_BRANCH_IN → DEPOSIT movement, JE DR 112(B) / CR 113
      const { voucher: receipt } = await this.bankReceipts.createAndPostInternal({
        purpose: DepositVoucherPurpose.INTER_BRANCH_IN,
        depositAccountId: t.toAccountId,
        contraRole: 'INTER_BRANCH_IN',            // → 113
        amount: t.amount,
        source: DepositMovementSource.TRANSFER,
        sourceRefId: t.id, sourceRefLineId: 'IN', // D2: chặn confirm-trùng
        transferPairId: t.id, transferStatus: DepositTransferStatus.HOAN_TAT,
        note: dto.note,
      }, actor, m);
      // flip leg-A movement transfer_status (status flag mutable, giống recon_status → append-only tài chính giữ nguyên)
      await m.query(
        `UPDATE deposit_movements SET transfer_status = 'HOAN_TAT' WHERE transfer_pair_id = $1 AND source_ref_line_id = 'OUT'`, [t.id]);
      Object.assign(t, { status: DepositTransferStatus.HOAN_TAT, toReceiptId: receipt.id,
        confirmedBy: actor.userId, confirmedAt: new Date() });
      return m.getRepository(DepositTransferEntity).save(t);
    });
  }

  /** Hủy — chỉ khi còn DANG_CHUYEN, chỉ CN A (reverse chân A, khôi phục quỹ A + clear 113). */
  async cancel(id: string, dto: CancelDepositTransferDto, actor: ActorContext) {
    return this.dataSource.transaction(async (m) => {
      const t = await m.getRepository(DepositTransferEntity).findOne({
        where: { id, organizationId: actor.organizationId }, lock: { mode: 'pessimistic_write' } });
      if (!t) throw new NotFoundException();
      if (t.fromBranchId !== actor.branchId) throw new ForbiddenException();
      if (t.status !== DepositTransferStatus.DANG_CHUYEN) throw new ConflictException('Cannot cancel a completed transfer'); // BR-TRF-03
      await this.bankPayments.reverse(t.fromPaymentId, dto.reason, actor, m); // DEPOSIT khôi phục A, JE đảo
      Object.assign(t, { status: DepositTransferStatus.DA_HUY, cancelledBy: actor.userId,
        cancelledAt: new Date(), cancelReason: dto.reason });
      return m.getRepository(DepositTransferEntity).save(t);
    });
  }

  async list(q: ListDepositTransfersQuery, actor: ActorContext) { /* org + branch-scoped; xem DFB-03 filter */ }
}
```

Controller:

```ts
@UseGuards(PermissionGuard, BranchScopeGuard)
@UseInterceptors(AuditInterceptor)
@Controller('deposit-transfers')
export class DepositTransferController {
  @Post() @RequireBranchScope() @RequirePermission('accounting.deposit_transfer.create')
  create(@Body() dto: CreateDepositTransferDto, @Actor() a: ActorContext) { return this.svc.create(dto, a); }

  @Post(':id/confirm') @RequireBranchScope() @RequirePermission('accounting.deposit_transfer.confirm')
  confirm(@Param('id') id: string, @Body() dto: ConfirmDepositTransferDto, @Actor() a: ActorContext) { return this.svc.confirm(id, dto, a); }

  @Post(':id/cancel') @RequireBranchScope() @RequirePermission('accounting.deposit_transfer.cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelDepositTransferDto, @Actor() a: ActorContext) { return this.svc.cancel(id, dto, a); }

  @Get() @RequirePermission('accounting.deposit_transfer.read')
  list(@Query() q: ListDepositTransfersQuery, @Actor() a: ActorContext) { return this.svc.list(q, a); }
}
```

**Reuse chính**: `BankPaymentService.createAndPostInternal()` / `reverse()` + `BankReceiptService.createAndPostInternal()` (GĐ2, mirror `cash-vouchers/cash-payments|cash-receipts` `createAndPostInternal`), `DepositService.recordMovement(dto, actor, manager)` (GĐ1, mirror `cash.service.recordMovement` — `SELECT FOR UPDATE` + guard số dư âm), `account-resolver.resolveContraAccount('INTER_BRANCH_*') = 113`, `document-numbering.generate(BANK_PAYMENT|BANK_RECEIPT, branch, actor)`. Nếu chữ ký `createAndPostInternal` GĐ2 chưa có tham số `transferPairId`/`transferStatus`/`sourceRefLineId`, mở rộng DTO nội bộ đó (thuộc GĐ2 nhưng nằm trong reuse hợp lý; nêu trong PR).

## Testing Strategy

- Unit (`deposit-transfer.service.spec.ts`, mock `BankPaymentService`/`BankReceiptService`/repo/dataSource):
  - `create` → gọi `bankPayments.createAndPostInternal` với purpose `INTER_BRANCH_OUT`, line `'OUT'`, insert header `DANG_CHUYEN`, `toReceiptId=null`; A≠B enforced.
  - `confirm` (status DANG_CHUYEN) → gọi `bankReceipts.createAndPostInternal` `INTER_BRANCH_IN` line `'IN'`, header → HOAN_TAT + `to_receipt_id`, UPDATE movement transfer_status; branch B enforced.
  - `confirm`/`cancel` khi status=HOAN_TAT → `ConflictException` (BR-TRF-03).
  - `cancel` (DANG_CHUYEN) → gọi `bankPayments.reverse`, header → DA_HUY; branch A enforced.
  - cross-org `toAccountId` → 400/403; số dư A không đủ → 400 (mock recordMovement throw).
- E2E: đầy đủ cân bằng số dư/UAT-07 nằm ở **TKT-DFB-06** (cross-module, 2 chi nhánh).

## Dependencies

- Depends on: TKT-DFB-01 (`deposit_transfer` + COA 113 + contra), EPIC GĐ2 (`BankPaymentService`/`BankReceiptService` + purpose `INTER_BRANCH_*`), EPIC GĐ1 (`DepositService.recordMovement`).
- Blocks: TKT-DFB-03, TKT-DFB-04.
