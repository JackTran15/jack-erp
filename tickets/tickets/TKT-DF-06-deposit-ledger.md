# TKT-DF-06 DepositLedgerService + GET /deposit-ledger + Excel export

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Nền tảng](../epics/EPIC-15072026-deposit-fund-foundation.md)

## Summary

FR-10: Sổ chi tiết tiền gửi — báo cáo read-only theo tài khoản tiền gửi, có dòng `Số dư đầu kỳ`, các dòng phát sinh với
running balance (`Số tiền còn lại`), và dòng tổng cuối. **Mirror 1:1 `CashLedgerService`**: SQL scalar `SUM`/`COUNT`
(không GROUP BY/window), running balance tính trong RAM per-page, opening balance = số dư đầu kỳ tài khoản + tổng phát
sinh trước `dateFrom`. Điểm khác cash cần đặc biệt cẩn thận: filter `(deposit_account_id = X OR to_account_id = X)` để
**không sót transfer đến** (TRANSFER lưu 1 row), và **loại dòng đầu kỳ khỏi bộ đếm phân trang** (ref.md §6.10 gap:
màn hiện tại đếm sai "1-4 trên 4" cho 3 dòng).

## Deliverables

- `apps/api/src/modules/accounting/deposit/deposit-ledger/deposit-ledger.service.ts` — `getLedger(dto, actor)` + `exportExcel(dto, actor)`.
- `apps/api/src/modules/accounting/deposit/deposit-ledger/deposit-ledger.controller.ts` — `GET /deposit-ledger` + `GET /deposit-ledger/export` (`@UseGuards(PermissionGuard, BranchScopeGuard)`, `@RequirePermission('accounting.deposit_ledger.read')`, `@RequireBranchScope()`, `@Actor()`).
- `apps/api/src/modules/accounting/deposit/deposit-ledger/dto/deposit-ledger-query.dto.ts` — filter DTO (`depositAccountId`, `dateFrom`, `dateTo`, `page`, `pageSize`, `search?`); class-validator + `@ApiProperty`.
- Wire providers vào `DepositModule`.

## Acceptance Criteria

- [ ] `GET /deposit-ledger?depositAccountId&dateFrom&dateTo&page&pageSize` trả `DepositLedgerResponse` (shape DF-02): `openingBalance`, `rows[]`, `totalIn`, `totalOut`, `closingBalance`, `page/pageSize/total`.
- [ ] **BR-LEDG-02 opening balance** = `deposit_account.opening_balance` + tổng **signed** movement có `doc_date < dateFrom` (SQL `SUM`). Đúng cho mọi khoảng ngày (nền UAT-12).
- [ ] **BR-LEDG-01 running balance** = dòng N-1 + Thu − Chi; **sort deterministic `doc_date ASC, document_number ASC`** rồi tie-break `id ASC` — running balance không nhảy loạn giữa các lần load. Running tính trong RAM per-page, page ≥ 2 nối tiếp `pageOpeningBalance` (opening + signed sum của các dòng trước offset — `sumSignedBeforeOffset`).
- [ ] **Signed convention** (mirror cash, filter phải `OR to_account_id`): `DEPOSIT` → `+`; `WITHDRAWAL` → `−`; `TRANSFER` khi `deposit_account_id = X` → `−` (chuyển đi); `TRANSFER` khi `to_account_id = X` → `+` (nhận về); `ADJUSTMENT` theo dấu amount. **Bỏ `to_account_id` sẽ sót transfer đến → sai opening/running/closing.**
- [ ] Filter dòng phát sinh: `(deposit_account_id = :acc OR to_account_id = :acc)` — KHÔNG chỉ `deposit_account_id`.
- [ ] **ref.md §6.10 gap**: dòng `Số dư đầu kỳ` **KHÔNG** tính vào `total` (bộ đếm phân trang) — `total` = COUNT movement thật trong range; dòng đầu kỳ là header của response, không phải record. FE hiển thị nó tách khỏi "X trên Y kết quả".
- [ ] `totalIn`/`totalOut` = SQL `SUM` riêng theo direction (không GROUP BY); `closingBalance` = `openingBalance + totalIn − totalOut`.
- [ ] JOIN inline per-row: `document_number`/`receiptNo`/`paymentNo`, `depositAccountNo`, counterparty name, staff name, `reconStatus` — **không** trả root `{[id]: X}` map.
- [ ] **NFR-01**: query trang đầu (~50k dòng/năm) < 2s — dùng index `(organization_id, branch_id, deposit_account_id, doc_date, id)`; offset pagination.
- [ ] Mọi query filter `actor.organizationId` + `branchId` (BR-PERM-01 / UAT-13); `depositAccountId` phải thuộc org+branch của actor.
- [ ] **Excel export (S12 / BR-LEDG-04 / NFR-02)**: `GET /deposit-ledger/export` giữ nguyên dòng đầu kỳ + running balance; tiền `numeric` format đúng. GĐ1 export đồng bộ (dataset chi nhánh/năm vừa phải); ≥100k dòng background-job note để GĐ sau (NFR-02).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] Spec phủ: opening với date range, running per-page (page 2 nối tiếp), transfer đến (`to_account_id`) không sót, đếm phân trang loại dòng đầu kỳ, scope branch.
- [ ] Không đổi schema; `synchronize` giữ false.
- [ ] Endpoint mới → openapi regen ở TKT-DF-08.
- [ ] Không có tiếng Việt trong backend source.
- [ ] Không có TODO/FIXME ngoài kế hoạch.

## Tech Approach

Mirror `apps/api/src/modules/accounting/cash-vouchers/cash-ledger/cash-ledger.service.ts` (`getLedger`: SQL scalar
`SUM`/`COUNT`, running balance JS per page, `sumSignedBeforeOffset`, filter `cashAccountId=X OR toAccountId=X`) và
controller `cash-ledger.controller.ts` (`GET /cash-ledger`). Signed-sum SQL dùng `CASE` theo type + branch account:

```ts
// Signed expression reused across opening / totals / rows (X = :accId)
// DEPOSIT: +amount; WITHDRAWAL: -amount;
// TRANSFER & deposit_account_id=X: -amount; TRANSFER & to_account_id=X: +amount
const SIGNED = `CASE
  WHEN m.type = 'DEPOSIT' THEN m.amount
  WHEN m.type = 'WITHDRAWAL' THEN -m.amount
  WHEN m.type = 'TRANSFER' AND m.deposit_account_id = :accId THEN -m.amount
  WHEN m.type = 'TRANSFER' AND m.to_account_id = :accId THEN m.amount
  WHEN m.type = 'ADJUSTMENT' THEN m.amount
  ELSE 0 END`;

async getLedger(dto: DepositLedgerQueryDto, actor: ActorContext): Promise<DepositLedgerResponse> {
  const scope = { org: actor.organizationId, branch: actor.branchId, accId: dto.depositAccountId };
  const account = await this.accountRepo.findOneOrFail({ where: { id: dto.depositAccountId, organizationId: scope.org, branchId: scope.branch } });
  // opening = account.opening_balance + Σ signed WHERE doc_date < dateFrom
  const openingSum = await this.sumSigned({ ...scope, before: dto.dateFrom });
  const openingBalance = Number(account.openingBalance) + openingSum;
  // totals within [dateFrom, dateTo]
  const { totalIn, totalOut } = await this.sumInOut({ ...scope, from: dto.dateFrom, to: dto.dateTo });
  const total = await this.countMovements({ ...scope, from: dto.dateFrom, to: dto.dateTo }); // excludes opening row
  // page rows ORDER BY doc_date ASC, document_number ASC, id ASC  LIMIT/OFFSET
  const raw = await this.fetchRows({ ...scope, from: dto.dateFrom, to: dto.dateTo, page: dto.page, pageSize: dto.pageSize });
  const pageOpening = openingBalance + await this.sumSignedBeforeOffset({ ...scope, from: dto.dateFrom, offset: (dto.page - 1) * dto.pageSize });
  let bal = pageOpening;
  const rows = raw.map((r) => { bal += r.amountIn - r.amountOut; return { ...r, runningBalance: String(bal) }; });
  return { openingBalance: String(openingBalance), rows, totalIn: String(totalIn), totalOut: String(totalOut),
           closingBalance: String(openingBalance + totalIn - totalOut), page: dto.page, pageSize: dto.pageSize, total };
}
```

Excel: reuse pattern export tiền mặt / `inventory/csv` (streaming/exceljs). GĐ1 đồng bộ.

## Testing Strategy

- **Unit** (`deposit-ledger.service.spec.ts`): mock `manager.query` → opening = account opening + signed sum trước dateFrom (UAT-12); running per-page page 2 nối tiếp `pageOpeningBalance`; `to_account_id` transfer đến cộng vào (không sót); `total` không đếm dòng đầu kỳ; scope org+branch (khác branch → không thấy).
- **E2E** (TKT-DF-11): UAT-12 (lọc 01/05–31/05, opening = số dư đến hết 30/04, running chính xác); UAT-13 (branch isolation).

## Dependencies

- Depends on: TKT-DF-03 (entity `deposit_movements`/`deposit_accounts`, module).
- Blocks: TKT-DF-08 (openapi), TKT-DF-11 (E2E UAT-12/13).
