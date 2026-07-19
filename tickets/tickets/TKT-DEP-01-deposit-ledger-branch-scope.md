# TKT-DEP-01 Deposit ledger — bỏ ràng buộc một quỹ, số dư gộp chi nhánh

## Epic

[EPIC-19072026 Deposit Screens — Branch Scope & MISA Parity](../epics/EPIC-19072026-deposit-screens-branch-scope.md)

## Summary

`GET /deposit-ledger` hiện bắt buộc `depositAccountId` (`@IsUUID()` không `@IsOptional()`, kèm ghi chú `BR-LEDG-03: one account`), và `DepositLedgerService` phụ thuộc vào giả định "đúng một quỹ" ở nhiều chỗ về mặt cấu trúc. Ticket này cho phép **bỏ trống** `depositAccountId` để lấy toàn bộ giao dịch tiền gửi của chi nhánh, với số dư luỹ kế **gộp chung** cả chi nhánh. Khi tham số **có** giá trị, hành vi giữ **nguyên xi** như hiện tại.

Đây là ticket backend duy nhất của epic — ba endpoint kia đã hỗ trợ sẵn.

## Deliverables

- `apps/api/src/modules/accounting/deposit/deposit-ledger/dto/deposit-ledger-query.dto.ts` — `depositAccountId` thành `@IsOptional() @IsUUID() depositAccountId?: string`; cập nhật `@ApiProperty` (`required: false`, mô tả "omit to include every active deposit account of the branch").
- `apps/api/src/modules/accounting/deposit/deposit-ledger/deposit-ledger.service.ts` — hỗ trợ phạm vi nhiều quỹ (chi tiết ở Tech Approach).
- `apps/api/src/modules/accounting/deposit/deposit-ledger/deposit-ledger.service.spec.ts` — bổ sung ca kiểm thử chế độ Tất cả.
- Không migration, không entity mới, không permission mới.

## Acceptance Criteria

- [ ] Mọi truy vấn lọc theo `actor.organizationId` **và** `actor.branchId`; không rò rỉ quỹ của chi nhánh khác kể cả khi bỏ trống `depositAccountId`.
- [ ] Bỏ trống `depositAccountId` → phạm vi = mọi `deposit_accounts` có `status = ACTIVE` thuộc `(org, branch)` hiện tại.
- [ ] Truyền `depositAccountId` → kết quả **byte-for-byte y hệt** hành vi hiện tại (kiểm bằng test hồi quy dùng lại fixture cũ).
- [ ] Truyền `depositAccountId` của quỹ **thuộc chi nhánh khác** → vẫn `NotFoundException` như cũ.
- [ ] `Số dư đầu kỳ` chế độ Tất cả = `SUM(opening_balance)` của các quỹ trong phạm vi + tổng phát sinh có dấu trước `dateFrom`.
- [ ] Chuyển quỹ **nội bộ** (cả `deposit_account_id` lẫn `to_account_id` đều trong phạm vi) sinh **đúng 2 dòng**: `−amount` ở quỹ nguồn, `+amount` ở quỹ đích; tổng ảnh hưởng số dư = 0.
- [ ] Chuyển quỹ **liên chi nhánh** (chỉ một chân trong phạm vi) sinh **đúng 1 dòng**, dấu tính theo chân nằm trong phạm vi.
- [ ] Mỗi dòng trả về `depositAccountNo` (và `depositAccountName`) của **chính quỹ dòng đó**, không phải của một quỹ được fetch sẵn.
- [ ] Phân trang đúng: `running` của dòng đầu trang N+1 nối tiếp dòng cuối trang N; thứ tự ổn định, không nhảy giữa các lần gọi.
- [ ] `Số dư cuối kỳ` chế độ Tất cả == `SUM(deposit_accounts.balance)` của các quỹ trong phạm vi khi khoảng ngày phủ toàn bộ lịch sử.
- [ ] `/deposit-ledger/export` chấp nhận cùng bộ tham số và xuất đúng tập dòng như `/deposit-ledger`.
- [ ] Phạm vi rỗng (chi nhánh chưa có quỹ nào) → trả `openingBalance: 0`, `rows: []`, `total: 0`; **không** ném lỗi.

## Definition of Done

- [ ] PR pass `pnpm --filter @erp/api test` và `pnpm --filter @erp/api lint`.
- [ ] Spec phủ: happy path 1 quỹ (hồi quy), happy path nhiều quỹ, chuyển nội bộ, chuyển liên chi nhánh, phạm vi rỗng, phân trang bắc cầu, quỹ khác chi nhánh → 404.
- [ ] Không đổi schema; `synchronize` vẫn false.
- [ ] Không có tiếng Việt trong source backend (lỗi/comment/Swagger/log).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

### Điểm phải sửa trong `deposit-ledger.service.ts`

Các chỗ đang hardcode "một quỹ" (`$1 = accountId`):

| Vị trí | Hiện tại | Cần thành |
| --- | --- | --- |
| `accountRepo.findOne` (~:109) | fetch 1 quỹ, 404 nếu không thuộc branch | có id → giữ nguyên; không id → `find()` mọi quỹ ACTIVE của `(org, branch)` |
| `buildWhere` (~:74) | `(m.deposit_account_id = $1 OR m.to_account_id = $1)` | `(m.deposit_account_id = ANY($1) OR m.to_account_id = ANY($1))` |
| `signedCase()` (~:53) / `signedJs()` (~:329) | dấu theo `$1` | dấu theo **quỹ của dòng đang phát sinh** |
| opening balance (~:119) | `account.openingBalance + sumSigned(<dateFrom)` | `Σ openingBalance` toàn phạm vi + `sumSigned(<dateFrom)` toàn phạm vi |
| row output (~:145) | `depositAccountNo: account.accountNo` | tra từ `accountById.get(row.depositAccountId)` |
| `sumSignedBeforeOffset` (~:235) | replay theo 1 quỹ | replay theo cùng phép tách chân + cùng thứ tự |

### Tách hai chân của chuyển quỹ nội bộ

Một `TRANSFER` là **một** dòng `deposit_movements` mang cả `deposit_account_id` (nguồn) và `to_account_id` (đích). Ở chế độ Tất cả, nếu **cả hai** đầu nằm trong phạm vi thì phải hiện **hai** dòng để mỗi dòng có `Số tài khoản` riêng.

Làm bằng `UNION ALL` hai nhánh ở tầng SQL — **không** fetch-all rồi tách trong JS, vì `LIMIT/OFFSET` phải chạy trên luồng dòng **đã** tách thì phân trang mới đúng; sổ chi tiết có thể rất dài nên không nạp hết vào RAM được:

```sql
-- leg 0: chân "quỹ đứng tên dòng" (mọi loại chứng từ)
SELECT m.*, m.deposit_account_id AS ledger_account_id, 0 AS leg,
       <signed_expr_for_source> AS signed
FROM deposit_movements m
WHERE m.organization_id = $org AND m.branch_id = $branch
  AND m.deposit_account_id = ANY($ids)

UNION ALL

-- leg 1: chân nhận, chỉ với TRANSFER có đích nằm trong phạm vi
SELECT m.*, m.to_account_id AS ledger_account_id, 1 AS leg,
       m.amount AS signed
FROM deposit_movements m
WHERE m.organization_id = $org AND m.branch_id = $branch
  AND m.movement_type = 'TRANSFER'
  AND m.to_account_id = ANY($ids)

ORDER BY occurred_at, id, leg
```

> Thứ tự **bắt buộc** gồm `leg` ở cuối để hai dòng tách ra từ cùng một chứng từ luôn có thứ tự xác định — nếu không, phân trang sẽ nhảy dòng giữa các lần gọi.

Ở chế độ **một quỹ**, `$ids` chỉ có một phần tử: nhánh `leg 1` tự nhiên không khớp gì (chuyển nội bộ khi đó có `to_account_id` nằm ngoài phạm vi), nên **cùng một câu SQL phục vụ được cả hai chế độ** — không cần rẽ nhánh code, giảm rủi ro hồi quy. Cần test hồi quy khẳng định điều này.

### Chữ ký service

```ts
interface LedgerScope {
  accountIds: string[];
  accountById: Map<string, DepositAccountEntity>;
  openingBalanceSum: string; // numeric as string
}

private async resolveScope(
  query: DepositLedgerQueryDto,
  actor: ActorContext,
): Promise<LedgerScope> {
  // depositAccountId set  -> findOne + NotFoundException (unchanged path)
  // depositAccountId unset -> find all ACTIVE accounts for (org, branch)
}
```

`getLedger` giữ nguyên chữ ký công khai và shape response; chỉ bổ sung `depositAccountName` vào mỗi dòng nếu FE cần hiển thị "Tên (Số TK)".

### Rủi ro cần canh

- **Tiền chính xác:** cộng dồn `running` phải dùng cùng kiểu số đang dùng (numeric-as-string → tránh trôi số dấu phẩy động). Không đổi cách hiện tại đang làm.
- **`deposit_movements.branch_id` NOT NULL** nên lọc branch ở SQL an toàn; không dựa vào `deposit_accounts` để suy branch.
- Chỉ lấy quỹ `status = ACTIVE`. Nếu một quỹ bị khoá giữa kỳ, phát sinh cũ của nó sẽ **rơi khỏi** chế độ Tất cả — ghi rõ giới hạn này vào docstring và mở ticket riêng nếu nghiệp vụ cần khác.

## Testing Strategy

- Unit (`deposit-ledger.service.spec.ts`), seed 2 quỹ cùng chi nhánh + 1 quỹ chi nhánh khác:
  - hồi quy: truyền `depositAccountId` → khớp snapshot hành vi cũ;
  - Tất cả: đủ dòng của cả 2 quỹ, không dính quỹ chi nhánh khác;
  - chuyển nội bộ → 2 dòng, `Số dư cuối kỳ` không đổi;
  - chuyển liên chi nhánh → 1 dòng, dấu đúng;
  - `openingBalance` = tổng 2 quỹ;
  - phân trang: gọi trang 1 và 2, khẳng định `running` bắc cầu;
  - phạm vi rỗng → không ném lỗi.
- E2E gộp ở [TKT-DEP-07](./TKT-DEP-07-e2e-test-plan.md).

## Dependencies

- Depends on: —
- Blocks: [TKT-DEP-02](./TKT-DEP-02-openapi-snapshot.md), [TKT-DEP-05](./TKT-DEP-05-fe-ledger-all-accounts.md)
