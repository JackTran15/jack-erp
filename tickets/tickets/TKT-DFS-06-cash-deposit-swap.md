# TKT-DFS-06 Swap tiền mặt ↔ tiền gửi (FR-08)

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Giai đoạn 2: Chi tiêu](../epics/EPIC-15072026-deposit-fund-spending.md)

## Summary

FR-08: luân chuyển tiền giữa quỹ tiền mặt và quỹ tiền gửi của **cùng một chi nhánh**, hai chân trong **cùng một
transaction** (BR-SWP-01). `FundSwapService` + controller ghép sẵn `BankPaymentService`/`BankReceiptService` (DFS-03/04)
với `CashService`/`CashReceiptService`/`CashPaymentService` (cash module) qua **cùng một `EntityManager`** để bảo đảm
atomic. Không tick `Tính vào doanh thu`/`Tính vào chi phí` (BR-SWP-02); phí rút tiền là dòng chi `BANK_FEE` riêng (BR-SWP-03).

## Deliverables

- `apps/api/src/modules/accounting/deposit-vouchers/fund-swaps/fund-swaps.service.ts` — `FundSwapService`.
- `.../fund-swaps.controller.ts` — `POST /fund-swaps`, perm `accounting.fund_swap.create` (+ nội bộ cần `bank_payment.create` + `cash_payment.create`).
- `.../dto/create-fund-swap.dto.ts` — `{ direction: 'DEPOSIT_TO_CASH' | 'CASH_TO_DEPOSIT', depositAccountId, cashAccountId?, amount, docDate, feeAmount?, reason }`.
- `.../fund-swaps.service.spec.ts` — unit spec.
- Cập nhật `deposit-vouchers.module.ts` — provider + controller; import `CashModule` + `CashVouchersModule` (để inject `CashService`/`CashReceiptService`/`CashPaymentService`).
- Permission seed — `accounting.fund_swap.create`, `accounting.fund_swap.read`.

## Nghiệp vụ (ref.md §6.8)

| Direction | Chân 1 | Chân 2 |
| --- | --- | --- |
| `DEPOSIT_TO_CASH` (Rút tiền gửi → tiền mặt) | `bank_payment` (`purpose=CASH_TRANSFER`) → quỹ gửi −amount | `cash_receipt` (DEPOSIT) → quỹ mặt +amount |
| `CASH_TO_DEPOSIT` (Nộp tiền mặt → tiền gửi) | `cash_payment` (WITHDRAWAL) → quỹ mặt −amount | `bank_receipt` (DEPOSIT) → quỹ gửi +amount |

## Acceptance Criteria

- [ ] **BR-SWP-01 (atomic)**: cả 2 chân ghi trong **1 transaction** (`dataSource.transaction`, cùng `manager`). Chân 1 thành công + chân 2 fail → rollback cả hai; không có trạng thái "chi xong nhưng thu fail".
- [ ] **DEPOSIT_TO_CASH**: `BankPaymentService.createAndPostInternal(CASH_TRANSFER, m)` (quỹ gửi −amount) + `CashReceiptService.createAndPostInternal(DEPOSIT, m)` (quỹ mặt +amount); cả hai cùng branch (`actor.branchId`).
- [ ] **CASH_TO_DEPOSIT**: `CashPaymentService.createAndPostInternal(WITHDRAWAL, m)` (quỹ mặt −amount) + `BankReceiptService.createAndPostInternal(DEPOSIT, m)` (quỹ gửi +amount).
- [ ] **BR-SWP-02**: cả 2 chân ép `affect_revenue=false` + `affect_expense=false` (dịch chuyển quỹ, không phải doanh thu/chi phí; kế thừa BR-CHI-05). Journal chỉ chuyển giữa TK 111x ↔ TK 112x, không đụng 511/6xx/7xx/811.
- [ ] **BR-SWP-03 (phí rút)**: nếu `feeAmount > 0` → thêm **1 dòng chi riêng** `purpose/line = BANK_FEE`, `affect_expense=true` trên chân quỹ gửi (chỉ áp dụng khi rút gửi→mặt). Số tiền thực nhận quỹ mặt = `amount − feeAmount`? — **theo ref.md R1/§6.8**: phí là bút toán riêng, quỹ mặt nhận `amount`, phí trừ thêm khỏi quỹ gửi (tổng chi quỹ gửi = `amount + feeAmount`). Ghi rõ semantics trong DTO doc + test.
- [ ] **UAT-06**: rút 5tr gửi→mặt → `deposit −5tr`, `cash +5tr`, tổng quỹ (mặt+gửi) không đổi (trừ phí nếu có), cùng thời điểm.
- [ ] **BR-CHI-01**: chân chi quỹ gửi vẫn qua guard số dư âm của `DepositService` (rút vượt số dư → 400, rollback cả swap).
- [ ] Query/scope filter `actor.organizationId` + `actor.branchId`; `cashAccountId` mặc định = két mặc định của branch nếu không truyền (reuse `CashFundResolverService`).
- [ ] Mutation kế thừa `IdempotencyInterceptor` (1 swap = 1 `X-Idempotency-Key`).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] Spec phủ: cả 2 direction, atomic rollback khi chân 2 fail, affect_revenue/expense=false, fee line BANK_FEE, insufficient deposit → 400.
- [ ] Endpoints mới → openapi regen ở TKT-DFS-07.
- [ ] Không đụng `synchronize` / migration.
- [ ] Không có tiếng Việt trong backend source.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

`FundSwapService` orchestrate qua **cùng manager** — chìa khóa BR-SWP-01 là 2 service quỹ đều nhận `manager?`
(`createAndPostInternal(dto, actor, m)`), nên compose được vào 1 tx.

```ts
@Injectable()
export class FundSwapService {
  constructor(
    private readonly bankPayment: BankPaymentService, private readonly bankReceipt: BankReceiptService,
    private readonly cashPayment: CashPaymentService, private readonly cashReceipt: CashReceiptService,
    private readonly cashResolver: CashFundResolverService, private readonly dataSource: DataSource,
  ) {}

  async swap(dto: CreateFundSwapDto, actor: ActorContext) {
    return this.dataSource.transaction(async (m) => {                          // BR-SWP-01 single tx
      const cashAccountId = dto.cashAccountId ?? (await this.cashResolver.resolveDefault(actor, m)).id;
      if (dto.direction === 'DEPOSIT_TO_CASH') {
        const lines = [{ description: 'Withdraw deposit to cash', amount: dto.amount }];
        if (dto.feeAmount) lines.push({ description: 'Bank fee', amount: dto.feeAmount, purpose: BANK_FEE }); // BR-SWP-03
        const bankPayment = await this.bankPayment.createAndPostInternal(
          { depositAccountId: dto.depositAccountId, purpose: BankPaymentPurpose.CASH_TRANSFER, affectExpense: false, lines }, actor, m); // BR-SWP-02
        const cashReceipt = await this.cashReceipt.createAndPostInternal(
          { cashAccountId, purpose: CashReceiptPurpose.OTHER, affectRevenue: false, lines: [{ description: 'From deposit', amount: dto.amount }] }, actor, m);
        return { bankPayment, cashReceipt };
      }
      // CASH_TO_DEPOSIT: cashPayment(WITHDRAWAL) + bankReceipt(DEPOSIT)
    });
  }
}
```

`createAndPostInternal` trên cash side đã tồn tại (`CashReceiptService`/`CashPaymentService`, EPIC cash-vouchers).
Reuse `CashFundResolverService` (memory "One cash fund per branch") để lấy két mặc định branch.

## Testing Strategy

- Unit (`fund-swaps.service.spec.ts`): mock 4 service quỹ + resolver. Cases: DEPOSIT_TO_CASH gọi bankPayment(CASH_TRANSFER)+cashReceipt(DEPOSIT)
  cùng manager; CASH_TO_DEPOSIT ngược lại; feeAmount → thêm BANK_FEE line; chân 2 throw → toàn tx rollback (assert manager không commit);
  affect_revenue/expense=false trên mọi chân.
- E2E (DFS-09): **UAT-06** — rút 5tr gửi→mặt: assert `deposit_accounts.balance −5tr` **và** `cash_accounts.balance +5tr`
  trong cùng response; tổng không đổi. Seed 1 deposit account + 1 cash account cùng branch, balance đủ.

## Dependencies

- Depends on: TKT-DFS-03, TKT-DFS-04 (`createAndPostInternal`); `CashService`/`CashReceiptService`/`CashPaymentService`/`CashFundResolverService` (cash module).
- Blocks: TKT-DFS-07.
