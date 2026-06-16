# TKT-EPT-02 "In tạm tính": bỏ tạo draft, in thuần từ state

## Epic

[EPIC-16062026 POS "In tạm tính"](../epics/EPIC-16062026-pos-estimate-print.md)

## Summary

Bấm "In tạm tính" hiện gọi `createMutation.mutateAsync(buildCreateInvoicePayload(...))` → `POST /invoices` tạo hóa đơn draft mỗi lần in. KQMM: **không** gọi API, **không** lưu draft — chỉ build receipt payload từ state hiện tại rồi in (giữ nguyên giỏ/tab như cũ). Loại bỏ hẳn nhánh tạo draft trong `printEstimate`.

## Deliverables

- `apps/pos-web/src/hooks/page-hooks/checkout/use-checkout-estimate.ts`
  - Bỏ `useCreateInvoiceMutation` + `createMutation` + khối `try { await createMutation.mutateAsync(buildCreateInvoicePayload(...)) }` (dòng ~92-108).
  - Bỏ import `useCreateInvoiceMutation`, `buildCreateInvoicePayload`, và các read chỉ phục vụ payload tạo draft (`selectedCustomer`, `selectedSalesperson`, `purchaseCart`, `note` nếu không còn dùng).
  - `printEstimate` chỉ còn: guard giỏ rỗng → `deriveSettlement` (lấy `totalPaid` + `settlementGrandTotal`) → `buildCheckoutInvoicePayload` → `invoicePrinter.print` (try/catch) → `ui.setAnnouncement(estimatePrinted)`.
  - `isPrinting`: thay `createMutation.isPending` bằng local `useState<boolean>` quanh lời gọi `invoicePrinter.print` (set true trước, false trong `finally`).
- `apps/pos-web/src/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/CheckoutActionsSection/PaymentCTAButtons/PaymentCTAButtons.tsx`
  - Xác nhận `busy`/`disabled` của nút "In tạm tính" vẫn lấy đúng `isPrinting` mới; chỉnh nếu nguồn `busy` đổi.

## Acceptance Criteria

- [ ] Bấm "In tạm tính" → **không** có request `POST /invoices` (kiểm tra Network); không sinh bản ghi trong danh sách "Lưu tạm".
- [ ] Vẫn in ra bản "HÓA ĐƠN TẠM TÍNH" với nội dung như TKT-EPT-01 (đặt cọc/công nợ/phương thức/khuyến mãi đúng).
- [ ] Giỏ hàng, tab, customer, salesperson **không** bị reset sau khi in (giữ nguyên để thu ngân sửa tiếp).
- [ ] Giỏ rỗng → set `cartError`, không in, không lỗi.
- [ ] Nút "In tạm tính" disable trong lúc đang in (local busy), bật lại sau khi in xong/ lỗi.

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` (tsc typecheck) pass.
- [ ] Không còn import/biến orphan trong `use-checkout-estimate.ts`.
- [ ] Không file backend nào đổi; không `openapi:generate`.
- [ ] Named export, không tạo `index.ts`.
- [ ] Không TODO/FIXME ngoài plan.

## Tech Approach

```ts
// use-checkout-estimate.ts (rút gọn)
export function useCheckoutEstimate(): UseCheckoutEstimateResult {
  const invoicePrinter = useInvoicePrinter();
  const [isPrinting, setIsPrinting] = useState(false);

  const printEstimate = useCallback(async () => {
    const sessionState = usePosCheckoutSessionStore.getState();
    const ui = usePosCheckoutUiStore.getState();
    if (!selectHasAnyCartLines(sessionState)) {
      ui.setCartError(CHECKOUT_ERRORS.PRODUCT_NOT_FOUND);
      return;
    }
    const p = selectPaymentDraft(sessionState);
    const grandTotal = selectGrandTotal(sessionState);
    const pointsDiscountAmount = selectPointsDiscountAmount(sessionState);
    const { totalPaid, settlementGrandTotal } = deriveSettlement({
      grandTotal,
      deposit: p.deposit,
      returnFee: p.returnFee,
      pointsDiscountAmount,
      paymentLines: p.paymentLines,
      keepChange: p.keepChange,
      debt: p.debt,
    });
    const primaryMethod = p.paymentLines[0]?.method ?? PaymentMethodEnum.CASH;
    const primaryMethodLabel =
      PAYMENT_METHODS.find((m) => m.value === primaryMethod)?.label ??
      String(primaryMethod);

    const receiptPayload = buildCheckoutInvoicePayload({
      printInvoice: true,
      provisional: true,
      cart: computeReceiptLines(sessionState),
      grandTotal,
      settlementTotal: settlementGrandTotal,
      totalPaid,
      paymentLines: p.paymentLines,
      primaryMethodLabel,
      methods: PAYMENT_METHODS,
      keepChange: p.keepChange,
      debt: p.debt,
    });
    if (!receiptPayload) return;

    setIsPrinting(true);
    try {
      await invoicePrinter.print(receiptPayload);   // KHÔNG tạo draft, KHÔNG reset
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Lỗi in hóa đơn tạm tính:", err);
    } finally {
      setIsPrinting(false);
    }
    ui.setAnnouncement(CHECKOUT_ANNOUNCEMENTS.estimatePrinted);
  }, [invoicePrinter]);

  return { printEstimate, isPrinting };
}
```

> `CHECKOUT_TOASTS.ESTIMATE_FAILED` không còn dùng nếu không còn nhánh tạo draft — kiểm tra usage khác trước khi gỡ; nếu chỉ dùng ở đây thì để lại constant (không xóa cross-file ngoài scope).

## Testing Strategy

- Manual (TKT-EPT-03): mở DevTools → Network, bấm "In tạm tính" nhiều lần → 0 request `POST /invoices`; giỏ giữ nguyên; bản in đúng.

## Dependencies

- Depends on: TKT-EPT-01 (signature `buildCheckoutInvoicePayload` có `settlementTotal`). Cùng đụng `use-checkout-estimate.ts` → làm sau TKT-EPT-01 để tránh churn.
- Blocks: TKT-EPT-03.
