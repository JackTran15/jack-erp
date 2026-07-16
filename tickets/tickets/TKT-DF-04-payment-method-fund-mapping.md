# TKT-DF-04 Deposit routing + payment policy (reuse payment_accounts)

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Nền tảng](../epics/EPIC-15072026-deposit-fund-foundation.md)

## Summary

FR-02: dịch vụ quyết định một dòng thanh toán POS **phi tiền mặt** có chảy vào **quỹ tiền gửi (DEPOSIT)** hay không, kèm thông số kinh tế (phí, ngày ghi có). **Không** dựng bảng map `payment_method → account` mới: `payment_accounts` (`apps/api/src/modules/accounting/payment-accounts/payment-account.entity.ts`) **đã** map `payment_method [+ nhãn NH] → account_id (COA 112x)`, org-wide (`branch_id NULL`) hoặc branch override, và checkout **đã** resolve nó qua `AccountResolverService.resolvePaymentAccount()` rồi lưu COA đã chọn vào `invoice_payments.account_id`. Vì thế `target_fund` được **suy ra từ COA** (không lưu): một dòng phi tiền mặt route vào DEPOSIT **iff** COA của nó khớp một `deposit_accounts.account_id` ACTIVE cùng org+branch. `DepositRoutingService.resolveDepositTarget(...)` làm phép suy ra đó rồi tra bảng mỏng `deposit_payment_policy` (TKT-DF-01) để lấy phí/settlement/effective + (khi COA nhập nhằng) override quỹ. Đây là input của auto-post POS (DF-05), tách split-payment **per line** (BR-MAP-01), non-retroactive theo `effective_from` (BR-MAP-02).

> **SUPERSEDES ý tưởng bảng-map riêng trước đây.** Bản kế hoạch cũ thêm một **bảng map phương thức→quỹ riêng** mang cột `payment_method → target_fund/account` — **trùng vai trò** với `payment_accounts` (đã map method→COA sẵn). Dữ liệu thực tế cho thấy `bank_transfer` và `card` **cùng** trỏ về **một** COA ngân hàng, nên khóa định tuyến đúng là **COA đã resolve trên `invoice_payments`**, không phải method. Do đó: reuse `payment_accounts` nguyên trạng, suy ra `target_fund` theo COA, và chỉ giữ `deposit_payment_policy` cho phần **đặc thù tiền gửi** (fee/settlement/effective + override quỹ khi 1 COA ↔ nhiều quỹ).

## Deliverables

- `apps/api/src/modules/accounting/deposit/deposit-routing.service.ts` — `resolveDepositTarget()` + helper `matchPolicy`. (Provider khai báo ở `DepositModule` — DF-03.)
- `apps/api/src/modules/accounting/deposit/dto/deposit-payment-policy.dto.ts` — create/update DTO cho generic CRUD `deposit_payment_policy` (class-validator + `@ApiProperty`, khai báo mọi field vì `whitelist:true`).
- (nếu cần) mở rộng `CrudEntityConfig` của `deposit_payment_policy` để expose `effective_from/to`, `fee_rate`, `fee_bearer`, `settlement_days`, `deposit_account_id` (override quỹ) trên admin form. **Không** expose cột method→account ở đây — ánh xạ phương thức→COA vẫn là màn `payment_accounts` hiện có.
- **(Optional, orthogonal)** `apps/api/src/modules/pos/entities/invoice.entity.ts` — mở rộng `InvoicePaymentMethod` thêm `EWALLET`/`QR` **nếu** nghiệp vụ cần method mới; định tuyến quỹ **không** phụ thuộc method enum (suy ra theo COA) nên GĐ1 không bắt buộc. Nếu extend enum → migration `ALTER TYPE ... ADD VALUE` riêng (tách khỏi DF-01).

## Acceptance Criteria

- [ ] `resolveDepositTarget({ paymentMethod, cardType, resolvedAccountId, branchId, docDate }, actor)` trả đúng `ResolveDepositTargetResult` (shape ở DF-02); scope `organizationId` (+ `branchId`).
- [ ] **Suy ra target_fund theo COA (không lưu):** `funds = deposit_accounts WHERE org+branch AND account_id = resolvedAccountId AND status = ACTIVE`. `funds.length === 0` → `{ fund: OTHER }` (không phải quỹ tiền gửi → DF-05 bỏ qua auto-post deposit).
- [ ] **Policy match** `deposit_payment_policy` theo `paymentMethod` [+ `cardType`]: ưu tiên `branch_id = branch` trước `branch_id IS NULL` (org-wide), trong đó ưu tiên `card_type` khớp trước `card_type IS NULL`; hiệu lực tại `docDate` (`effective_from <= docDate` và (`effective_to IS NULL` hoặc `docDate < effective_to`)) — BR-MAP-02 non-retroactive, dùng **ngày hóa đơn** không phải hôm nay.
- [ ] **Chọn quỹ:** `funds.length === 1` → `depositAccountId = funds[0].id`. `funds.length > 1` (1 COA ↔ nhiều quỹ ACTIVE → nhập nhằng) → `depositAccountId = policy?.depositAccountId`; thiếu override → lỗi rõ ràng (DF-05 đẩy DLQ, không block sale).
- [ ] Trả kèm kinh tế: `feeRate = policy?.feeRate ?? '0'`, `feeBearer = policy?.feeBearer ?? null`, `settlementDays = policy?.settlementDays ?? 0`.
- [ ] **BR-MAP-01**: resolve **per payment line** (không gộp) — caller (DF-05) gọi 1 lần / dòng thanh toán phi tiền mặt; split 500k tiền mặt + 635k chuyển khoản → dòng tiền mặt do quỹ tiền mặt xử lý (không qua service này), dòng chuyển khoản → quỹ tiền gửi nếu COA khớp (nền UAT-02).
- [ ] Money field (`feeRate`) trả `string`; không float (NFR-06).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] Spec phủ: COA khớp 1 quỹ → DEPOSIT + đúng quỹ; COA không khớp quỹ nào → OTHER; COA nhập nhằng + policy override → đúng quỹ; nhập nhằng thiếu override → throw; policy branch override vs org default; effective window (in/out of range); phí/settlement default khi không policy.
- [ ] Không đổi schema ngoài TKT-DF-01.
- [ ] Endpoint CRUD `deposit_payment_policy` đổi field → openapi regen ở TKT-DF-08.
- [ ] Không có tiếng Việt trong backend source.
- [ ] Không có TODO/FIXME ngoài kế hoạch.

## Tech Approach

Reuse `payment_accounts` (method→COA đã có) + `AccountResolverService.resolvePaymentAccount()`
(`apps/api/src/modules/accounting/payment-accounts/account-resolver.service.ts`) — checkout đã set
`invoice_payments.account_id` = COA ngân hàng. `resolveDepositTarget` chỉ **join ngược COA → quỹ** và đọc
`deposit_payment_policy` cho phần kinh tế:

```ts
@Injectable()
export class DepositRoutingService {
  constructor(
    @InjectRepository(DepositAccountEntity) private accounts: Repository<DepositAccountEntity>,
    @InjectRepository(DepositPaymentPolicyEntity) private policies: Repository<DepositPaymentPolicyEntity>,
  ) {}

  async resolveDepositTarget(
    input: {
      paymentMethod: string;
      cardType?: string | null;   // GĐ1 luôn null (invoice_payments chưa có cột cardType)
      resolvedAccountId: string;  // = invoice_payments.account_id (COA 112x đã resolve)
      branchId: string;
      docDate: string;            // BR-MAP-02: ngày hóa đơn, không phải hôm nay
    },
    actor: ActorContext,
  ): Promise<ResolveDepositTargetResult> {
    // 1. COA → quỹ tiền gửi ACTIVE cùng org+branch
    const funds = await this.accounts.find({
      where: {
        organizationId: actor.organizationId, branchId: input.branchId,
        accountId: input.resolvedAccountId, status: DepositAccountStatus.ACTIVE,
      },
    });
    // 2. Không khớp quỹ nào → không phải tiền gửi (DF-05 skip auto-post)
    if (funds.length === 0) return { fund: TargetFund.OTHER, feeRate: '0', settlementDays: 0 };

    // 3. policy hiệu lực tại docDate (branch override > org-wide; card_type khớp > null)
    const policy = await this.matchPolicy(input, actor); // effective_from <= docDate < effective_to|∞

    // 4. COA đơn quỹ → dùng luôn; nhập nhằng → cần override từ policy
    const depositAccountId = funds.length === 1 ? funds[0].id : policy?.depositAccountId;
    if (!depositAccountId)
      throw new BadRequestException('Ambiguous deposit COA: policy override required'); // DF-05 → DLQ

    // 5.
    return {
      fund: TargetFund.DEPOSIT,
      depositAccountId,
      feeRate: policy?.feeRate ?? '0',
      feeBearer: policy?.feeBearer ?? null,
      settlementDays: policy?.settlementDays ?? 0,
    };
  }
}
```

`matchPolicy` rank branch>org + card>null + newest `effective_from` — ordering-by-boolean-expression cần cast
(`(branch_id IS NOT NULL)::int`) tùy dialect; verify TypeORM sinh SQL hợp lệ, hoặc rank trong RAM sau `find`
(memory rule "aggregate/rank trong RAM" khi QueryBuilder không dịch được biểu thức).

## Testing Strategy

- **Unit** (`deposit-routing.service.spec.ts`): COA khớp đúng 1 quỹ ACTIVE → `DEPOSIT` + `depositAccountId` = quỹ đó; COA không khớp quỹ nào → `OTHER`; COA khớp >1 quỹ + policy override → dùng override; nhập nhằng thiếu override → `BadRequestException`; policy `branch` override thắng org-wide; `docDate` trước `effective_from` → không áp policy (BR-MAP-02); không policy → `feeRate='0'`, `settlementDays=0`.
- Tách split-payment (tiền mặt vs chuyển khoản) verify end-to-end ở **TKT-DF-11 UAT-02**.

## Dependencies

- Depends on: TKT-DF-03 (`DepositRoutingService` provider, `deposit_payment_policy` entity, module); reuse `payment_accounts` + `AccountResolverService` (đã có sẵn).
- Blocks: TKT-DF-05 (POS auto-post gọi `resolveDepositTarget`).
