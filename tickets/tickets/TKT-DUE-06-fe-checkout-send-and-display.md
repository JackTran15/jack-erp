# TKT-DUE-06 FE checkout: gửi + hiển thị dueDate/creditDays (bug KQMM)

## Epic

[EPIC-16062026 POS công nợ — Hạn thanh toán](../epics/EPIC-16062026-pos-debt-due-date.md)

## Summary

Hai phần FE trong `apps/pos-web`:

1. **Hiển thị (bug đã báo, KQMM):** sau khi confirm modal "Hạn thanh toán", hiện `Hạn thanh toán: 25/06/2026 (9 ngày)` ngay trong checkout section (hiện chỉ có nút mở modal, không hiển thị lại giá trị đã chọn).
2. **Gửi xuống BE:** đưa `paymentDueDate` + `creditDays` từ `CheckoutPaymentDraft` vào payload checkout khi `debt === true`.

> **Phối hợp với TKT-PDC-02** (EPIC partial-debt-checkout): PDC-02 sửa `buildCheckoutInvoiceApiPayload` để gửi payment lines thật khi debt. Ticket này mở rộng **cùng** hàm + `CheckoutInvoiceBody` thêm `dueDate`/`creditDays`. Land sau PDC-02 hoặc merge cẩn thận để tránh xung đột cùng file.

## Deliverables

- `apps/pos-web/src/dtos/invoice.dto.ts` — mở rộng `CheckoutInvoiceBody`: `dueDate?: string`, `creditDays?: number`.
- `apps/pos-web/src/lib/page-libs/checkout/invoicePayloadMapper.ts` — `buildCheckoutInvoiceApiPayload` nhận thêm `paymentDueDate`/`creditDays` và đưa vào body khi `debt` (chỉ set khi có giá trị).
- `apps/pos-web/src/hooks/page-hooks/checkout/use-checkout-actions.ts` — truyền `p.paymentDueDate` + `p.creditDays` vào `buildCheckoutInvoiceApiPayload`.
- `apps/pos-web/.../PaymentSection/DebtCheckRow/DebtCheckRow.tsx` (hoặc `PaymentSection.tsx`) — render dòng tóm tắt due date đã chọn dưới nút "Hạn thanh toán" khi `debt && paymentDueDate`.

## Acceptance Criteria

- [ ] Tick "Tính vào công nợ" → chọn ngày trong modal → confirm → checkout section hiển thị `Hạn thanh toán: <dd/MM/yyyy> (<N> ngày)` (format `Intl` `vi-VN`).
- [ ] Bỏ tick / clear khách → dòng hiển thị biến mất (đã reset `paymentDueDate`/`creditDays` ở `use-checkout-customer`).
- [ ] Checkout POST body mang `dueDate` + `creditDays` khi debt và có giá trị; không có giá trị → bỏ qua field (không gửi `null` rác).
- [ ] Không phá hành vi partial-debt (payment lines của PDC-02 vẫn gửi đúng).
- [ ] Hóa đơn không công nợ → không gửi due date.

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` (tsc) xanh.
- [ ] Verify thủ công flow checkout công nợ: hiển thị + payload (DevTools network) đúng.
- [ ] FE strings tiếng Việt; không hardcode type trùng `@erp/shared-interfaces`.
- [ ] Dùng client generated mới (TKT-DUE-05) cho shape `CheckoutInvoiceBody`.

## Tech Approach

`CheckoutInvoiceBody`:

```ts
export interface CheckoutInvoiceBody {
  payments: InvoicePaymentLineBody[];
  dueDate?: string;     // ISO YYYY-MM-DD
  creditDays?: number;
}
```

`buildCheckoutInvoiceApiPayload` (sau khi đã hợp nhất với PDC-02):

```ts
const body: CheckoutInvoiceBody = { payments };
if (input.debt) {
  if (input.paymentDueDate) body.dueDate = input.paymentDueDate;
  if (input.creditDays != null) body.creditDays = input.creditDays;
}
return { ok: true, body };
```

Hiển thị (DebtCheckRow, dưới nút mở modal):

```tsx
{debt && paymentDueDate && (
  <p className="text-xs text-muted-foreground">
    Hạn thanh toán: {formatDateVi(paymentDueDate)}
    {creditDays != null ? ` (${creditDays} ngày)` : ""}
  </p>
)}
```

> `formatDateVi` dùng `Intl.DateTimeFormat('vi-VN')` — tái dùng helper format ngày sẵn có của pos-web nếu đã tồn tại.

## Testing Strategy

- Manual: checkout công nợ → kiểm tra hiển thị + network payload.
- (Nếu có vitest cho pos-web settlement) thêm assert mapper đưa `dueDate`/`creditDays` vào body khi debt.

## Dependencies

- Depends on: TKT-DUE-05 (client generated); phối hợp TKT-PDC-02 (cùng file mapper).
- Blocks: TKT-DUE-08.
