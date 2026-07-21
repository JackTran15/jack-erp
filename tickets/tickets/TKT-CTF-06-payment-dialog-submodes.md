# TKT-CTF-06 `PaymentVoucherDialog` — bật 2 sub-mode chuyển tiền

## Epic

[EPIC-21072026 Phiếu chi tiền mặt — chuyển thành tiền gửi & chuyển đến cửa hàng khác](../epics/EPIC-21072026-cash-transfer-vouchers.md)

## Summary

Bỏ bộ lọc đang ẩn 2 sub-option "Chuyển tiền mặt thành tiền gửi" / "Chuyển tiền đến cửa hàng khác", dựng đủ field cho mỗi mode, và chuyển `onSave` sang discriminated union để trang gọi đúng endpoint. Mirror 1:1 cách `DepositPaymentVoucherDialog` đã làm cho `CASH_TRANSFER` / `INTER_BRANCH_OUT`.

## Deliverables

- `apps/backoffice-web/src/pages/treasury/documents/payment-voucher-dialog/PaymentVoucherDialog.tsx` — 2 sub-mode + union `CashPaymentSaveResult`.
- `apps/backoffice-web/src/pages/treasury/documents/_shared/voucher-dialog.constants.ts` — bỏ stub `subOptionToApiPurpose`, map sub-option ↔ `CashPaymentPurpose` thật.
- `apps/backoffice-web/src/pages/treasury/cash/receipts-expenses/TreasuryCashReceiptsPage.tsx` — `handleSaveVoucher` dispatch theo `result.kind`.

## Acceptance Criteria

- [ ] Dropdown "Mục đích chi" (khi radio = "Khác") hiện đủ 3 lựa chọn; `.filter((o) => !isTransferSubOption(o.value))` và comment "follow-up work" bị xoá hẳn.
- [ ] Đổi sub-option thì tự điền `reason` + đặt **1 dòng chi tiết khoá** — làm trong handler, **không** dùng `useEffect` (đúng lý do đã ghi ở `DepositPaymentVoucherDialog.handlePurposeChange`).
- [ ] `CASH_TO_DEPOSIT`: hiện "Tài khoản thu" bằng `DepositAccountSelect`; `<select>` cũ dựng từ `usePaymentAccounts()` bị **thay thế** (đó là UI chết và sai nguồn dữ liệu — payment_accounts, không phải deposit_accounts).
- [ ] `CASH_TO_DEPOSIT`: checkbox "Tự động sinh phiếu thu tiền ngay sau khi chi" là checkbox **thật**; bỏ tick hiện dòng hint về TK 113.
- [ ] `BRANCH_TRANSFER`: "Cửa hàng nhận" bắt buộc (`useBranches()` lọc bỏ chi nhánh hiện tại) + "Hình thức nhận" (`Thu tiền mặt` / `Thu tiền gửi`).
- [ ] `BRANCH_TRANSFER` + `Thu tiền gửi`: hiện "Tài khoản nhận" lấy từ `useDepositDashboard()` lọc theo `toBranchId`, kèm cảnh báo amber khi danh sách rỗng.
- [ ] `BRANCH_TRANSFER`: checkbox hiển thị tick + `disabled` + hint "Chi nhánh đích tự xác nhận nhận tiền sau" — nhất quán với nhánh `isBranchTransfer` của deposit dialog.
- [ ] Đổi "Cửa hàng nhận" thì reset "Tài khoản nhận" về rỗng.
- [ ] Validate trước khi `onSave`: tổng tiền > 0; `BRANCH_TRANSFER` thiếu `toBranchId` → toast lỗi; `Thu tiền gửi` thiếu `toAccountId` → toast lỗi. Không gọi API khi chưa hợp lệ.
- [ ] `onSave` nhận `CashPaymentSaveResult` (union 4 nhánh); `TreasuryCashReceiptsPage` dispatch bằng `switch (result.kind)`.
- [ ] `LedgerCashPage` không phải sửa — nó render dialog ở VIEW mode và không truyền `onSave` (đã kiểm chứng).
- [ ] Chế độ VIEW: `referenceType === TRANSFER` → `useCashTransfer(referenceId)` nạp lại Cửa hàng nhận / Hình thức nhận / Tài khoản nhận (các field này sống trên `cash_transfer`, không trên `cash_payments`); `referenceType === FUND_SWAP` → `useFundSwapLegs()` điền ô "Tham chiếu".
- [ ] Chuỗi hiển thị tiếng Việt; số/tiền format `vi-VN`; icon từ `lucide-react`; primitive import từ `@erp/ui`.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Click-through thật trên trình duyệt cả 3 mục đích (ảnh chụp trước/sau) — không chỉ dựa vào diff.
- [ ] Không tạo trang `*-v2` song song; sửa thẳng dialog v1.
- [ ] Không còn nhánh code chết liên quan `usePaymentAccounts()` trong file này (nếu import trở nên thừa thì xoá).

## Tech Approach

```ts
export type CashPaymentSaveResult =
  | { kind: "voucher";             body: CreateCashPaymentBody }
  | { kind: "supplierDebtPayment"; body: CreateSupplierDebtPaymentBody }
  | { kind: "fundSwap";            body: CreateFundSwapBody }
  | { kind: "cashTransfer";        body: CreateCashTransferBody };
```

```ts
const handleSubOptionChange = useCallback((next: PaymentOtherSubOption) => {
  setPaymentSubOption(next);
  setPaymentPurpose(subOptionToApiPurpose(next));
  setTransferAccountId(""); setToBranchId(""); setToFundKind(CashTransferFundKind.CASH);
  setToAccountId(""); setAutoCreateReceipt(true);
  if (next === PaymentOtherSubOption.CASH_TO_DEPOSIT) {
    const text = "Chi tiền mặt nhập quỹ tiền gửi";
    setReason(text);
    setLines([{ description: text, amount: 0, category: "Chi gửi tiền vào ngân hàng", categoryId: undefined }]);
  } else if (next === PaymentOtherSubOption.BRANCH_TRANSFER) {
    const text = "Chi chuyển tiền sang cửa hàng khác";
    setReason(text);
    setLines([{ description: text, amount: 0, category: "Chi chuyển tiền sang cửa hàng khác", categoryId: undefined }]);
  }
}, []);
```

`subOptionToApiPurpose` bỏ stub, trả giá trị thật:

```ts
export function subOptionToApiPurpose(sub: PaymentOtherSubOption): CashPaymentPurpose {
  switch (sub) {
    case PaymentOtherSubOption.CASH_TO_DEPOSIT: return CashPaymentPurpose.DEPOSIT_TRANSFER;
    case PaymentOtherSubOption.BRANCH_TRANSFER: return CashPaymentPurpose.INTER_BRANCH_OUT;
    default: return CashPaymentPurpose.OTHER;
  }
}
```

`handleSave` rẽ nhánh theo thứ tự: `isDebtRepayment` → `supplierDebtPayment`; `CASH_TO_DEPOSIT` → `fundSwap` (`direction: CASH_TO_DEPOSIT`, `depositAccountId: transferAccountId`, `autoCreateReceipt`); `BRANCH_TRANSFER` → `cashTransfer`; còn lại → `voucher`.

`lockRowCount = isDebtRepayment || isTransferSubOption(paymentSubOption)` — grid khoá 1 dòng, diễn giải/mục chi read-only, chỉ "Số tiền" nhập được (mode Trả nợ khoá luôn cả Số tiền, giữ nguyên).

Trang `TreasuryCashReceiptsPage`:

```ts
switch (result.kind) {
  case "cashTransfer": {
    const created = await cashTransferMutations.create.mutateAsync(result.body);
    setSelectedId(created.fromPaymentId);
    break;
  }
  case "fundSwap": {
    const created = await fundSwapMutation.mutateAsync(result.body);
    if (created.cashPaymentId) setSelectedId(created.cashPaymentId);
    break;
  }
  // "supplierDebtPayment" / "voucher": nhánh cũ, giữ nguyên logic
}
```

## Testing Strategy

Không có test tự động cho FE trong repo này (`pnpm test` ở web app chỉ `echo`). Xác minh bằng click-through thật ở [TKT-CTF-08](./TKT-CTF-08-tests.md) bước 2-6, kèm kiểm dữ liệu trong DB sau mỗi thao tác.

## Dependencies

- Depends on: [TKT-CTF-05](./TKT-CTF-05-openapi-fe-types-hooks.md)
- Blocks: [TKT-CTF-08](./TKT-CTF-08-tests.md)
