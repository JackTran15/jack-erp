# TKT-CTF-02 `CashTransferService` + DTOs

## Epic

[EPIC-21072026 Phiếu chi tiền mặt — chuyển thành tiền gửi & chuyển đến cửa hàng khác](../epics/EPIC-21072026-cash-transfer-vouchers.md)

## Summary

Service điều phối 2 chân của một lần chuyển tiền mặt liên chi nhánh, mỗi chân atomic trong phạm vi chi nhánh của nó, bắc cầu qua COA `113` "Tiền đang chuyển". Mirror trực tiếp `DepositTransferService` — khác biệt duy nhất là chân A luôn là **phiếu chi tiền mặt**, còn chân B là **phiếu thu tiền mặt hoặc phiếu thu tiền gửi** tuỳ `toFundKind`.

## Deliverables

- `apps/api/src/modules/accounting/deposit-vouchers/cash-transfer/cash-transfer.service.ts` (mới).
- `apps/api/src/modules/accounting/deposit-vouchers/cash-transfer/dto/create-cash-transfer.dto.ts` (mới).
- `apps/api/src/modules/accounting/deposit-vouchers/cash-transfer/dto/confirm-cash-transfer.dto.ts` (mới).
- `apps/api/src/modules/accounting/deposit-vouchers/cash-transfer/dto/cancel-cash-transfer.dto.ts` (mới).
- `apps/api/src/modules/accounting/deposit-vouchers/cash-transfer/dto/list-cash-transfers.query.ts` (mới).
- `apps/api/src/modules/accounting/cash-vouchers/cash-payments/cash-payments.service.ts` — `reverse()` nhận thêm `manager?: EntityManager`.

## Acceptance Criteria

- [ ] `create()` lấy `fromBranchId` từ `actor.branchId` (**không** nhận từ client) và ném `BadRequestException` khi `toBranchId === fromBranchId`.
- [ ] `create()` với `toFundKind = CASH` resolve quỹ tiền mặt của chi nhánh đích qua `cashFundResolver.resolveBranchCashFund(org, toBranchId, manager)` — fail ngay khi chi nhánh đích chưa có quỹ, không tạo chứng từ nào.
- [ ] `create()` với `toFundKind = DEPOSIT` bắt buộc có `toAccountId` và xác minh tài khoản đó `ACTIVE` **và** thuộc `toBranchId`; thiếu `toAccountId` → 400, tài khoản của chi nhánh khác → 404.
- [ ] `transferId` sinh **trước** khi tạo chân A và dùng làm `referenceId` + `transfer_pair_id` — nhờ đó guard idempotency `findByReference` trong `createAndPostInternal` có cái để so khớp.
- [ ] Contra của cả 2 chân là COA `113` lấy qua `resolveCoaAccountIdByCode(org, '113', manager)`; không hardcode uuid.
- [ ] `confirm()` khoá dòng bằng `setLock('pessimistic_write')`, ném `ForbiddenException` khi `transfer.toBranchId !== actor.branchId`, ném `ConflictException` khi status khác `DANG_CHUYEN`.
- [ ] `confirm()` sao chép party snapshot từ chân A qua `partySnapshotFromVoucher` — chứng từ thu ở chi nhánh đích không được để trống đối tượng.
- [ ] `confirm()` nhánh `DEPOSIT` truyền `source: TRANSFER`, `sourceRefLineId: 'IN'`, `transferPairId`, `transferStatus: HOAN_TAT` cho `BankReceiptsService`; nhánh `CASH` **không** truyền các field đó (`CashReceiptCreateAndPostArgs` không có).
- [ ] `cancel()` chỉ cho chi nhánh nguồn, chỉ khi `DANG_CHUYEN`, và đảo chân A qua `cashPayments.reverse(..., manager)` **trong cùng transaction** với việc cập nhật status.
- [ ] `CashPaymentsService.reverse` giữ nguyên hành vi khi gọi không kèm `manager` (mọi caller hiện có không đổi).
- [ ] Mọi truy vấn lọc theo `actor.organizationId`; `list()` mặc định lọc theo `actor.branchId` với `direction=OUT|IN` chọn chiều, không có `direction` thì `(from = :b OR to = :b)`.

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- cash-transfer.service.spec.ts` pass.
- [ ] `pnpm --filter @erp/api test -- cash-payments` pass (không hồi quy `reverse`).
- [ ] `pnpm --filter @erp/api build` + `lint` pass.
- [ ] Không đổi schema ngoài migration của TKT-CTF-01.
- [ ] Không có tiếng Việt trong source backend, trừ chuỗi `description` của chứng từ (hiển thị cho người dùng, đúng tiền lệ `DepositTransferService`: `'Chuyển tiền gửi liên chi nhánh'`).

## Tech Approach

**Vị trí file:** đặt trong `deposit-vouchers/` chứ không phải `cash-vouchers/`. Chân B có thể là phiếu thu tiền gửi nên service cần cả 4 voucher service; `DepositVouchersModule` đã import `CashVouchersModule` (do `FundSwapsService`), đặt ngược lại sẽ tạo circular module. Ghi rõ lý do này trong doc comment của class.

```ts
const IN_TRANSIT_COA_CODE = '113';
const IN_LEG_LINE_ID = 'IN';

async create(dto: CreateCashTransferDto, actor: ActorContext): Promise<CashTransferEntity> {
  const fromBranchId = actor.branchId!;
  if (dto.toBranchId === fromBranchId) {
    throw new BadRequestException('Source and destination branch must differ');
  }

  return this.dataSource.transaction(async (manager) => {
    const fromCashAccountId = await this.cashFundResolver.resolveOrDefault(
      actor.organizationId, fromBranchId, dto.fromCashAccountId, manager,
    );
    const contraAccountId = await this.cashFundResolver.resolveCoaAccountIdByCode(
      actor.organizationId, IN_TRANSIT_COA_CODE, manager,
    );

    let toCashAccountId: string | null = null;
    let toDepositAccountId: string | null = null;
    if (dto.toFundKind === CashTransferFundKind.CASH) {
      toCashAccountId = await this.cashFundResolver.resolveBranchCashFund(
        actor.organizationId, dto.toBranchId, manager,
      );
    } else {
      if (!dto.toAccountId) {
        throw new BadRequestException('toAccountId is required when toFundKind is DEPOSIT');
      }
      const account = await this.assertDepositAccountInBranch(
        manager, dto.toAccountId, dto.toBranchId, actor.organizationId,
      );
      toDepositAccountId = account.id;
    }

    // Generated up-front so it can be the referenceId of leg A (and later leg B),
    // which is what createAndPostInternal's findByReference guard matches on.
    const transferId = randomUUID();
    const party = await resolvePartySnapshot(manager, this.partnerResolver, {
      partnerType: dto.partnerType, partnerId: dto.partnerId,
      personName: dto.payeeName, address: dto.address,
      staffId: dto.paidBy, reason: dto.note,
    }, actor.organizationId);

    const payment = await this.cashPayments.createAndPostInternal({
      purpose: CashPaymentPurpose.INTER_BRANCH_OUT,
      cashAccountId: fromCashAccountId,
      contraAccountId,
      amount: dto.amount,
      actor,
      voucherDate: dto.docDate,
      referenceType: CashPaymentReferenceType.TRANSFER,
      referenceId: transferId,
      partnerType: party.partnerType, partnerId: party.partnerId,
      partnerName: party.partnerName, partnerAddress: party.partnerAddress,
      payeeName: party.personName, staffId: party.staffId,
      reason: dto.note,
      description: 'Chuyển tiền mặt liên chi nhánh',
      lines: dto.lines?.map((l) => ({
        description: l.description || 'Chuyển tiền mặt liên chi nhánh',
        amount: l.amount, categoryId: l.categoryId,
      })),
    }, manager);

    const transfer = this.repo.create({
      id: transferId, organizationId: actor.organizationId,
      fromBranchId, toBranchId: dto.toBranchId,
      fromCashAccountId, toFundKind: dto.toFundKind,
      toCashAccountId, toDepositAccountId,
      amount: dto.amount, status: DepositTransferStatus.DANG_CHUYEN,
      fromPaymentId: payment.voucherId, toReceiptId: null,
      transferPairId: transferId,
      initiatedBy: actor.userId, initiatedAt: new Date(),
      note: dto.note ?? null,
    });
    return manager.getRepository(CashTransferEntity).save(transfer);
  });
}
```

`confirm()` — khoá dòng, kiểm chi nhánh/status, rồi rẽ nhánh:

```ts
const outLeg = await manager.findOne(CashPaymentEntity, { where: { id: transfer.fromPaymentId } });
const party = partySnapshotFromVoucher({
  partnerType: outLeg?.partnerType, partnerId: outLeg?.partnerId,
  partnerNameSnapshot: outLeg?.partnerNameSnapshot,
  partnerAddressSnapshot: outLeg?.partnerAddressSnapshot,
  personName: outLeg?.payeeName, staffId: outLeg?.staffId,
});

const receiptId = transfer.toFundKind === CashTransferFundKind.CASH
  ? (await this.cashReceipts.createAndPostInternal({
      purpose: CashReceiptPurpose.INTER_BRANCH_IN,
      cashAccountId: transfer.toCashAccountId!, contraAccountId,
      amount: Number(transfer.amount), actor,
      referenceType: CashReceiptReferenceType.TRANSFER, referenceId: transfer.id,
      partnerType: party.partnerType, /* … */ payerName: party.personName,
      staffId: party.staffId, reason: dto.note,
      description: 'Nhận tiền mặt liên chi nhánh',
    }, manager)).voucherId
  : (await this.bankReceipts.createAndPostInternal({
      purpose: BankReceiptPurpose.INTER_BRANCH_IN,
      depositAccountId: transfer.toDepositAccountId!, contraAccountId,
      amount: Number(transfer.amount), actor, affectRevenue: false,
      referenceType: BankReceiptReferenceType.TRANSFER, referenceId: transfer.id,
      source: DepositMovementSource.TRANSFER, sourceRefLineId: IN_LEG_LINE_ID,
      transferPairId: transfer.id, transferStatus: DepositTransferStatus.HOAN_TAT,
      partnerType: party.partnerType as unknown as BankVoucherPartnerType, /* … */
      payerName: party.personName, collectedBy: party.staffId, reason: dto.note,
      description: 'Nhận tiền mặt liên chi nhánh vào tiền gửi',
    }, manager)).voucherId;
```

Nhánh `CASH` **không** cập nhật `cash_movements` — bảng đó không có cột `transfer_pair_id`/`transfer_status` và ticket này không thêm. Trạng thái sống ở `cash_transfer`, đủ cho trang theo dõi.

`CashPaymentsService.reverse` — refactor đúng shape `BankPaymentsService.reverse` (`bank-payments.service.ts:387-394`):

```ts
async reverse(id: string, reason: string, actor: ActorContext, manager?: EntityManager) {
  const run = (m: EntityManager) => this.reverseInTx(id, reason, actor, m);
  return manager ? run(manager) : this.dataSource.transaction(run);
}
private async reverseInTx(id, reason, actor, manager) { /* thân hàm cũ, nguyên vẹn */ }
```

`CreateCashTransferDto`: `toBranchId` (UUID, bắt buộc), `toFundKind` (enum, bắt buộc), `toAccountId?` (UUID, bắt buộc khi DEPOSIT — validate trong service để thông báo lỗi rõ nghĩa), `amount` (min 0.01, tối đa 2 chữ số thập phân), `fromCashAccountId?`, `docDate?`, `note?` (≤500), `partnerType?`, `partnerId?`, `payeeName?`, `address?`, `paidBy?`, `lines?`. Global `ValidationPipe` là `whitelist: true, forbidNonWhitelisted: true` — khai báo đủ mọi field FE gửi.

## Testing Strategy

Unit (`cash-transfer.service.spec.ts`), mock `cashPayments`/`cashReceipts`/`bankReceipts`/`cashFundResolver`/`partnerResolver`:
- `create` CASH: resolve quỹ đích, tạo đúng 1 `cash_payment`, lưu row `DANG_CHUYEN`.
- `create` DEPOSIT: xác minh tài khoản thuộc chi nhánh đích; tài khoản chi nhánh khác → `NotFoundException`; thiếu `toAccountId` → `BadRequestException`.
- `create` với `toBranchId === actor.branchId` → `BadRequestException`, không mutation nào được gọi.
- `confirm` CASH → gọi `cashReceipts`, không gọi `bankReceipts`; status `HOAN_TAT`, `toReceiptId` được set.
- `confirm` DEPOSIT → gọi `bankReceipts` kèm `transferPairId`/`transferStatus`; không gọi `cashReceipts`.
- `confirm` bởi chi nhánh nguồn → `ForbiddenException`; `confirm` khi đã `HOAN_TAT` → `ConflictException`.
- `cancel` bởi chi nhánh đích → `ForbiddenException`; `cancel` hợp lệ → `cashPayments.reverse` được gọi **kèm manager**, status `DA_HUY`.

## Dependencies

- Depends on: [TKT-CTF-01](./TKT-CTF-01-schema-enums.md)
- Blocks: [TKT-CTF-03](./TKT-CTF-03-controller-permissions.md)
