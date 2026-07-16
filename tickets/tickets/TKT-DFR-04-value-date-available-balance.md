# TKT-DFR-04 Value-date (T+n) & book vs available balance (R2)

## Epic

[EPIC-15072026 Deposit Fund — Reconcile & Lock](../epics/EPIC-15072026-deposit-fund-reconcile-lock.md)

## Summary

Xử lý **độ trễ ghi có T+n (R2)**. Populate `value_date = doc_date + settlement_days` (từ `deposit_payment_policy`) khi auto-post. Endpoint số dư + sổ chi tiết expose **đồng thời** `Số dư sổ sách` (book — theo `doc_date`, = cột `balance` real-time) và `Số dư khả dụng` (available — chỉ tính khoản đã ghi có, `value_date <= today`). Đối chiếu (DFR-02) match theo `value_date`. Mục tiêu: hết "lệch giả" khi sao kê ngày giao dịch chưa có tiền, và **chặn chi vượt tiền chưa về**.

> ⛔ **OQ-02 gates this ticket.** Nếu nghiệp vụ chốt "value-date" → làm đầy đủ như dưới. Nếu chốt "đối chiếu theo lô cuối kỳ" → `availableBalance = bookBalance` và bỏ guard available. Kế hoạch mặc định: **value-date** (ref.md R2).

## Deliverables

- `apps/api/src/modules/accounting/deposit-ledger/deposit-balance.service.ts` — `getBalances(depositAccountId, actor)` → `{ bookBalance, availableBalance, pendingClearingAmount }`.
- **Mở rộng** `deposit-ledger.service.ts` (GĐ1 `TKT-DF-04`, FR-10) + controller: mỗi màn số dư/sổ trả cả 2 con số; dòng ledger có cột `valueDate` + phân loại cleared/pending.
- **Sửa consumer auto-post GĐ1**: set `value_date = doc_date + settlement_days` (settlement_days = 0 cho tiền mặt/ghi có tức thì; T+1/T+2 cho thẻ). Cùng điểm mở rộng với DFR-03 `postFee`.
- **Guard chi vượt available** trong spending WITHDRAWAL path (DFS): khi `deposit_accounts.allow_negative=false`, so sánh với **available**, không chỉ book — chặn chi tiền chưa ghi có (R2). Gắn cờ cấu hình để OQ-07 điều chỉnh.

## Acceptance Criteria

- [ ] Auto-post: `value_date = doc_date + mapping.settlement_days`; `settlement_days=0` → `value_date = doc_date` (ghi có tức thì); thẻ T+1/T+2 → dời đúng số ngày.
- [ ] `getBalances`: `bookBalance` = Σ signed theo `doc_date` (khớp cột `balance` real-time); `availableBalance` = Σ signed **chỉ** movement `value_date <= CURRENT_DATE` (hoặc `value_date IS NULL` = ghi có tức thì); `pendingClearingAmount = book − available`.
- [ ] Sổ chi tiết + endpoint balance trả **cả 2** con số ở mọi response (FR-10 mở rộng); dòng ledger có `valueDate` + cờ `isCleared`.
- [ ] Đối chiếu match theo `value_date` (DFR-02 grid filter `dateFrom/dateTo` áp trên `value_date`) → sao kê ngày ghi có khớp giao dịch, không "lệch giả".
- [ ] Chi (WITHDRAWAL) khi `allow_negative=false` bị chặn nếu vượt **availableBalance** (không phải book) — chống chi vượt tiền chưa về; message nêu rõ available vs book.
- [ ] Tính bằng SQL `SUM` scalar (không GROUP BY/window) + running balance trong RAM (memory rule, reuse `cash-ledger` pattern).
- [ ] Mọi query lọc `organizationId` (+`branchId`); không leak (BR-PERM-01, UAT-13).
- [ ] Tiền `numeric(18,2)`, không float (NFR-06).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] Spec phủ: value_date populate T+0/T+1/T+2, book≠available khi có khoản chưa clear, guard chi vượt available, reconcile match theo value_date.
- [ ] Không đổi `synchronize`; không schema change ngoài DFR-01 (cột `value_date` đã có từ GĐ1).
- [ ] Endpoint đổi → openapi regen ở DFR-07.
- [ ] Không tiếng Việt trong backend source.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

```ts
@Injectable()
export class DepositBalanceService {
  constructor(@InjectRepository(DepositMovementEntity) private readonly movements: Repository<DepositMovementEntity>) {}

  async getBalances(depositAccountId: string, actor: ActorContext) {
    // signed(depositAccountId=X): DEPOSIT +net_amount, WITHDRAWAL −amount, TRANSFER out −, TRANSFER in (toAccountId=X) +
    // (net_amount for DEPOSIT so book reflects post-fee; align with FR-10 GĐ1 signed convention)
    const book = await this.sumSigned(depositAccountId, actor, /* clearedOnly */ false);
    const available = await this.sumSigned(depositAccountId, actor, /* clearedOnly */ true); // value_date <= CURRENT_DATE OR NULL
    return { bookBalance: book, availableBalance: available, pendingClearingAmount: round2(book - available) };
  }

  private async sumSigned(id: string, actor: ActorContext, clearedOnly: boolean): Promise<number> {
    // single SQL SUM(CASE ...) scalar, params [orgId, branchId, id]; filter (deposit_account_id=X OR to_account_id=X)
    // clearedOnly → AND (value_date <= CURRENT_DATE OR value_date IS NULL)
  }
}
```

Auto-post consumer (cùng chỗ DFR-03):

```ts
const settlementDays = policy.settlementDays ?? 0;                 // GĐ1 deposit_payment_policy
movement.valueDate = addDays(movement.docDate, settlementDays);    // R2
await this.feeService.postFee(movement, policy, m, actor);         // DFR-03
```

Spending WITHDRAWAL guard (extend DFS check):

```ts
if (!account.allowNegative) {
  const { availableBalance } = await this.balances.getBalances(account.id, actor); // R2: available, not book
  if (round2(availableBalance - amount) < 0)
    throw new BadRequestException(`Insufficient available balance (available ${availableBalance}, book ${book})`);
}
```

Reuse: `cash-ledger.service.ts` (SQL SUM + JS running balance, `(cashAccountId=X OR toAccountId=X)` filter — mirror với `(deposit_account_id=X OR to_account_id=X)`); GĐ1 `deposit-ledger.service.ts` (FR-10 base); `SELECT deposit_account FOR UPDATE` cho guard race (NFR-03).

## Testing Strategy

- Unit (`deposit-balance.service.spec.ts`): value_date = doc_date+settlement_days (0/1/2); book vs available khi có movement `value_date > today` (pending); available bỏ pending; guard chi vượt available throw; reconcile grid filter theo value_date.
- E2E: DFR-09 — kịch bản quẹt thẻ 27/04 tiền về 29/04, số dư 27/04 book>available, đối chiếu 29/04 khớp (bổ trợ UAT-09/UAT-12).

## Dependencies

- Depends on: TKT-DFR-01 (schema); GĐ1 `TKT-DF-04` (`deposit-ledger.service.ts` FR-10 + cột `value_date`), `deposit_payment_policy.settlement_days`. ⛔ **OQ-02 phải chốt trước.**
- Blocks: TKT-DFR-02 (grid match theo value_date), TKT-DFR-07 (openapi), TKT-DFR-08 (FE hiển thị 2 số dư), TKT-DFR-09 (E2E).
