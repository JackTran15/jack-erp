# TKT-DFS-08 FE — Thu/chi tiền gửi + dialogs + luồng NCC/swap

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Giai đoạn 2: Chi tiêu](../epics/EPIC-15072026-deposit-fund-spending.md)

## Summary

Frontend backoffice cho GĐ2: trang "Thu/chi tiền gửi" (**clone `TreasuryCashReceiptsPage`**) + dialog Phiếu thu /
Phiếu chi tiền gửi (**clone `receipt-voucher-dialog` / `payment-voucher-dialog`**), bổ sung component mới
`DepositAccountSelect` (chọn `deposit_account` của branch — trường "Tài khoản nhận / Tài khoản chi" bắt buộc, gap ref.md §13).
Thêm luồng trả NCC bằng tiền gửi và swap tiền mặt ↔ tiền gửi. Thay 3 link WIP `treasury-deposit` trong nav + routes.
Toàn bộ string tiếng Việt; gọi API qua `erpApi` + `@erp/api-client` (generated ở DFS-07), bọc TanStack Query.

## Deliverables

- `apps/backoffice-web/src/pages/treasury/deposit/receipts-expenses/TreasuryDepositReceiptsPage.tsx` — clone `cash/receipts-expenses/TreasuryCashReceiptsPage.tsx`; list Phiếu thu/chi tiền gửi, filter theo `depositAccountId`, badge trạng thái + "Đảo bút".
- `apps/backoffice-web/src/pages/treasury/deposit/receipts-expenses/` — `receipt-deposit.constants.ts`, `receipt-deposit.types.ts`, `receipt-deposit.utils.ts`, `ReceiptDepositDetailPanel.tsx`, `useReceiptDepositTableColumns.tsx` (clone bộ `receipt-cash.*`).
- `apps/backoffice-web/src/pages/treasury/documents/deposit-receipt-voucher-dialog/DepositReceiptVoucherDialog.tsx` — clone `receipt-voucher-dialog/ReceiptVoucherDialog.tsx` + `DepositAccountSelect`; purpose OTHER/DEBT_COLLECTION/OTHER_INCOME; reuse `DebtCollectionPickDialog` cho Thu nợ (BR-THU-02).
- `apps/backoffice-web/src/pages/treasury/documents/deposit-payment-voucher-dialog/DepositPaymentVoucherDialog.tsx` — clone `payment-voucher-dialog/PaymentVoucherDialog.tsx` + `DepositAccountSelect`; purpose full set; **disable+uncheck `Tính vào chi phí`** khi purpose ∈ {CASH_TRANSFER, INTER_BRANCH_OUT} (BR-CHI-05); reuse `DebtRepaymentPickDialog`/`supplier-debt` cho Trả NCC.
- `apps/backoffice-web/src/pages/treasury/documents/_shared/DepositAccountSelect.tsx` — component mới: dropdown `deposit_accounts` theo branch, mặc định chọn `is_default`, hiển thị `name (account_no · bank)`.
- `apps/backoffice-web/src/pages/treasury/documents/fund-swap-dialog/FundSwapDialog.tsx` — dialog swap tiền mặt ↔ tiền gửi (direction toggle, `DepositAccountSelect` + `CashAccountSelect`, feeAmount, BR-SWP-02 ẩn tick doanh thu/chi phí).
- `apps/backoffice-web/src/hooks/treasury/use-deposit-accounts.ts`, `use-bank-receipts.ts`, `use-bank-payments.ts`, `use-supplier-deposit-payment.ts`, `use-fund-swap.ts` — clone `use-cash-*.ts`, dùng `erpApi`/`requireErpData`; queryKey bắt đầu resource name (`['bank-receipts', ...]`).
- Cập nhật `apps/backoffice-web/src/hooks/treasury/treasury-query-keys.ts` — thêm keys deposit.
- `apps/backoffice-web/src/components/layout/navConfig.ts` — thay 3 link WIP `treasury-deposit` (`/treasury/wip/:slug`) bằng route thật.
- `apps/backoffice-web/src/App.tsx` — thêm `<Route>` cho trang deposit receipts/expenses (thay `/treasury/wip/:slug` → `TreasuryWipPage` cho các slug đã build).
- Nút "Thanh toán bằng tiền gửi" trong màn Phiếu nhập / Công nợ phải trả (nếu đã có nút cash, thêm option nguồn quỹ = Tiền gửi; reuse `goods-receipt-payment-dialog`).

## Acceptance Criteria

- [ ] Trang Thu/chi tiền gửi render list (thu + chi) theo `depositAccountId` chọn ở filter; phân trang + search hoạt động; scope theo branch đang active (`X-Branch-Id`).
- [ ] Dialog Phiếu thu/chi: `DepositAccountSelect` **bắt buộc** (submit thiếu → block, thông báo "Vui lòng chọn tài khoản nhận/chi"), khớp required BE (gap §13).
- [ ] Purpose dropdown Phiếu chi có option "Trả NCC / Mua hàng" (SUPPLIER_PAYMENT/PURCHASE — bổ sung so với màn hiện tại, ref.md §13); Phiếu thu có "Nhận tiền từ chi nhánh khác" (INTER_BRANCH_IN, disabled/badge "GĐ4" nếu chưa mở).
- [ ] **BR-CHI-05**: chọn purpose CASH_TRANSFER/INTER_BRANCH_OUT → checkbox "Tính vào chi phí" **disabled + unchecked cứng** (UI), không gửi `affectExpense=true`.
- [ ] **BR-THU-02**: purpose Thu nợ → bắt buộc chọn đối tượng + link công nợ (reuse `DebtCollectionPickDialog`), số tiền ≤ dư nợ (validate client-side + BE).
- [ ] **FR-06**: từ màn Phiếu nhập/Công nợ phải trả chọn nguồn quỹ = Tiền gửi + tài khoản → gọi `POST /supplier-deposit-payment`; hỗ trợ partial + multi-doc (BR-BUY-02); mixed cash+deposit (BR-BUY-03) qua `legs`.
- [ ] **FR-08**: FundSwapDialog gọi `POST /fund-swaps`; direction DEPOSIT_TO_CASH / CASH_TO_DEPOSIT; feeAmount optional; không hiển thị tick doanh thu/chi phí (BR-SWP-02); sau khi swap invalidate cả query keys cash + deposit balance.
- [ ] Số dư khả dụng hiển thị trên dialog Phiếu chi; server trả 400 chi vượt số dư → toast lỗi rõ (UAT-04) không crash.
- [ ] Mọi mutation gửi `X-Idempotency-Key` (do `erpApi` auto-inject); reverse render badge "Đảo bút".
- [ ] Import primitives từ `@erp/ui`; icons `lucide-react`; số/tiền format `Intl` `vi-VN`; named exports; không put server data vào Zustand.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh (type-check với client generated ở DFS-07).
- [ ] Nav 3 link deposit trỏ route thật; điều hướng + reload đúng.
- [ ] String user-facing tiếng Việt; enum/id giữ English.
- [ ] Verify visual: screenshot list + dialog Phiếu thu + Phiếu chi (BR-CHI-05 checkbox disabled) + FundSwapDialog.
- [ ] Không có tiếng Việt lọt vào payload gửi BE (chỉ label UI).

## Tech Approach

Clone theo cây `treasury/cash/*` + `treasury/documents/*`. Component `DepositAccountSelect` là mảnh mới duy nhất
đáng kể; phần còn lại là clone + đổi hook/endpoint (`cash-receipts`→`bank-receipts`, thêm `depositAccountId`).

```tsx
// DepositAccountSelect.tsx (new)
export function DepositAccountSelect({ value, onChange, branchId }: Props) {
  const { data: accounts = [] } = useDepositAccounts(branchId);   // GET /deposit-accounts (GĐ1)
  useEffect(() => { if (!value && accounts.length) onChange(accounts.find(a => a.isDefault)?.id ?? accounts[0].id); }, [accounts]);
  return (
    <Select value={value} onValueChange={onChange}>
      {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} · {a.accountNo} · {a.bankShortName}</SelectItem>)}
    </Select>
  );
}

// DepositPaymentVoucherDialog — BR-CHI-05
const isFundMove = purpose === 'CASH_TRANSFER' || purpose === 'INTER_BRANCH_OUT';
<Checkbox checked={isFundMove ? false : affectExpense} disabled={isFundMove} onCheckedChange={setAffectExpense} />
```

Hooks clone `use-cash-receipts.ts` etc., dùng `requireErpData(erpApi.POST('/bank-receipts', {...}))`. Query keys prefix
resource (`['bank-receipts', branchId, depositAccountId, page, search]`); invalidate theo prefix sau mutation + sau swap
invalidate cả `['cash-accounts']` + `['deposit-accounts']` (balance đổi 2 quỹ).

## Testing Strategy

- Không unit test FE (web app `test` là echo). Gate = `build` type-check + verify visual (screenshots).
- Manual: tạo Phiếu thu tiền gửi → POST → balance tăng; tạo Phiếu chi vượt số dư → toast 400; swap gửi→mặt → cả 2 số dư đổi;
  trả NCC bằng tiền gửi → công nợ giảm. (Các assertion số liệu chính thức nằm ở E2E DFS-09.)

## Dependencies

- Depends on: TKT-DFS-07 (generated client + snapshot); GĐ1 (`GET /deposit-accounts`, nav section `treasury-deposit`).
- Blocks: TKT-DFS-09 (E2E chạy sau khi FE + BE đủ; E2E chủ yếu hit API nhưng cần contract ổn định).
