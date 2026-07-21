# TKT-FSW-04 FundSwapDialog — checkbox thật

## Epic

[EPIC-19072026 Chuyển quỹ — cho phép bỏ tự động sinh phiếu thu tiền mặt](../epics/EPIC-19072026-fund-swap-optional-receipt.md)

## Summary

`FundSwapDialog.tsx` (nút toolbar "Chuyển quỹ" độc lập trên trang Thu-chi tiền gửi) hiện **không có** checkbox này — cả 2 chiều đều atomic hoàn toàn ẩn (BE tự làm, không hỏi). Thêm checkbox khi `direction === DEPOSIT_TO_CASH` (dùng biến `isWithdrawal` đã có sẵn trong file) để đồng nhất với `DepositPaymentVoucherDialog`.

## Deliverables

- `apps/backoffice-web/src/pages/treasury/documents/fund-swap-dialog/FundSwapDialog.tsx` — thêm state + checkbox + field vào body gửi lên.

## Acceptance Criteria

- [ ] Thêm state `autoCreateReceipt`, mặc định `true`, reset về `true` mỗi khi dialog mở (cùng effect reset hiện có ở `useEffect(() => {... }, [open])`).
- [ ] Checkbox chỉ hiện khi `isWithdrawal` (tức `direction === DEPOSIT_TO_CASH`) — ẩn hoàn toàn khi chiều `CASH_TO_DEPOSIT` (khớp epic Scope: field không áp dụng chiều đó).
- [ ] Đổi chiều từ DEPOSIT_TO_CASH sang CASH_TO_DEPOSIT rồi quay lại: `autoCreateReceipt` reset về `true` (không giữ trạng thái bỏ tick cũ gây hiểu nhầm).
- [ ] `handleConfirm`: thêm `autoCreateReceipt: isWithdrawal ? autoCreateReceipt : undefined` vào `body` — không gửi field khi chiều là CASH_TO_DEPOSIT (tránh phụ thuộc vào validate 400 ở BE, tuy có sẵn ở TKT-FSW-01).
- [ ] Toast thành công phản ánh đúng: bỏ tick → nội dung khác giữ tick (cùng cách xử lý như TKT-FSW-03).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Chiều CASH_TO_DEPOSIT không đổi hành vi/UI so với trước ticket.

## Tech Approach

```ts
const [autoCreateReceipt, setAutoCreateReceipt] = useState(true);

useEffect(() => {
  if (!open) return;
  // ... reset hiện có ...
  setAutoCreateReceipt(true);
}, [open]);
```

JSX, ngay sau field "Phí rút tiền" (chỉ hiện khi `isWithdrawal`):

```tsx
{isWithdrawal ? (
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
) : null}
```

`handleConfirm`:

```ts
const body: CreateFundSwapBody = {
  direction,
  depositAccountId,
  cashAccountId: cashAccount?.id,
  amount,
  docDate,
  feeAmount: isWithdrawal && feeAmount > 0 ? feeAmount : undefined,
  reason: reason || undefined,
  autoCreateReceipt: isWithdrawal ? autoCreateReceipt : undefined,
};
// ...
toast.success(
  isWithdrawal && !autoCreateReceipt ? "Đã chuyển quỹ — chưa tạo phiếu thu tiền mặt." : "Đã chuyển quỹ.",
);
```

## Testing Strategy

Thủ công: mở "Chuyển quỹ" từ toolbar, chiều Tiền gửi → Tiền mặt, bỏ tick, xác nhận cùng kết quả DB như TKT-FSW-03. Chiều Tiền mặt → Tiền gửi: không thấy checkbox, hành vi không đổi.

## Dependencies

- Depends on: [TKT-FSW-02](./TKT-FSW-02-openapi-fe-type.md)
- Blocks: [TKT-FSW-05](./TKT-FSW-05-test-plan.md)
