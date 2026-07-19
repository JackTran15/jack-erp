# TKT-FSW-03 DepositPaymentVoucherDialog — checkbox thật

## Epic

[EPIC-19072026 Chuyển quỹ — cho phép bỏ tự động sinh phiếu thu tiền mặt](../epics/EPIC-19072026-fund-swap-optional-receipt.md)

## Summary

Checkbox "Tự động sinh phiếu thu tiền ngay sau khi chi" trong sub-mode "Chuyển tiền gửi thành tiền mặt" (`purpose === CASH_TRANSFER`) hiện luôn tick + disabled (từ epic trước). Đổi thành state thật, mặc định tick (giữ hành vi cũ), người dùng bỏ tick được, gửi `autoCreateReceipt` vào body `fundSwap`.

## Deliverables

- `apps/backoffice-web/src/pages/treasury/documents/deposit-payment-voucher-dialog/DepositPaymentVoucherDialog.tsx` — sửa checkbox + `handleSave`'s `fundSwap` dispatch.

## Acceptance Criteria

- [ ] Thêm state `autoCreateReceipt` (mặc định `true`), reset về `true` mỗi khi mở dialog CREATE mới hoặc đổi sang purpose khác rồi quay lại CASH_TRANSFER (không rò rỉ trạng thái bỏ tick từ lần trước).
- [ ] Checkbox không còn `disabled` khi `purpose === CASH_TRANSFER` — người dùng tick/bỏ tick tự do.
- [ ] Bỏ tick → caption đổi nội dung phù hợp (vd: "Tiền sẽ treo ở tài khoản 'Tiền đang chuyển' — tự tạo Phiếu thu tiền mặt riêng sau khi đã đếm tiền.") thay cho caption cũ.
- [ ] Chỉ hiện checkbox này khi `purpose === CASH_TRANSFER` — **không** hiện (hoặc hiện dạng chỉ-đọc như cũ) khi `purpose === INTER_BRANCH_OUT`, vì field này không áp dụng cho chiều đó (theo epic Scope: chỉ DEPOSIT_TO_CASH).
- [ ] `handleSave`'s nhánh `fundSwap`: thêm `autoCreateReceipt` vào body gửi lên.
- [ ] Bỏ tick + Lưu thành công → toast thành công vẫn hiện, nhưng nội dung nên phản ánh đúng thực tế (vd: "Đã chuyển quỹ — chưa tạo phiếu thu tiền mặt." thay vì "Đã chuyển quỹ." chung chung dễ hiểu nhầm là đã xong cả 2 bước).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Giữ tick (mặc định) → hành vi y hệt trước ticket, không hồi quy.

## Tech Approach

```ts
const [autoCreateReceipt, setAutoCreateReceipt] = useState(true);
```

Reset trong effect CREATE-mode reset (dòng đã có `setPurposeGroup(...)`, `setPurpose(...)`) và trong `handlePurposeChange` khi đổi sang purpose khác CASH_TRANSFER (để không giữ trạng thái bỏ tick cũ nếu người dùng đổi qua lại).

JSX (thay khối checkbox cứng hiện có, chỉ khi `purpose === BankPaymentPurpose.CASH_TRANSFER`):

```tsx
{purpose === BankPaymentPurpose.CASH_TRANSFER ? (
  <div className="flex flex-col gap-1">
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={autoCreateReceipt}
        onChange={(e) => setAutoCreateReceipt(e.target.checked)}
      />
      Tự động sinh phiếu thu tiền ngay sau khi chi
    </label>
    {!autoCreateReceipt ? (
      <p className="pl-6 text-xs text-muted-foreground">
        Tiền sẽ treo ở tài khoản "Tiền đang chuyển" — tự tạo Phiếu thu tiền mặt riêng sau khi đã đếm tiền.
      </p>
    ) : null}
  </div>
) : isBranchTransfer ? (
  /* giữ nguyên khối checkbox chỉ-đọc hiện có cho INTER_BRANCH_OUT */
) : null}
```

`handleSave`, nhánh `CASH_TRANSFER`:

```ts
onSave({
  kind: "fundSwap",
  body: {
    direction: FundSwapDirection.DEPOSIT_TO_CASH,
    depositAccountId,
    amount: lineTotal,
    docDate,
    reason: reason || undefined,
    autoCreateReceipt,
  },
});
toast.success(
  autoCreateReceipt ? "Đã chuyển quỹ." : "Đã chuyển quỹ — chưa tạo phiếu thu tiền mặt.",
);
```

Thêm `autoCreateReceipt` vào dependency array của `handleSave`.

## Testing Strategy

Thủ công: bỏ tick, Lưu, kiểm `bank_payments` có dòng mới, `cash_receipts` không có dòng mới, quỹ tiền mặt không đổi. Giữ tick, Lưu, kiểm hành vi cũ không đổi.

## Dependencies

- Depends on: [TKT-FSW-02](./TKT-FSW-02-openapi-fe-type.md)
- Blocks: [TKT-FSW-05](./TKT-FSW-05-test-plan.md)
