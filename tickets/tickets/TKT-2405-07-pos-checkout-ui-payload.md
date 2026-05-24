# TKT-2405-07 POS checkout UI ("Tài khoản thu") + payload cleanup

## Epic

[EPIC2405 payment_accounts + auto-resolve revenueAccountId](../EPIC2405.md)

## Layer

🟩 Frontend only (pos-web).

## Summary

Hoàn thiện UI checkout: dropdown "Tài khoản thu" theo từng phương thức (giống mockup), bỏ `revenueAccountId` khỏi payload, và **xóa hardcode `f29226ef...`** + khôi phục validate. `payments[].accountId` giờ là COA account thật lấy từ `payment_accounts`.

## Deliverables

- `lib/page-libs/checkout/invoicePayloadMapper.ts`:
  - **Xóa** dòng hardcode `line.cashAccountId = "f29226ef..."` (line ~131).
  - Bỏ `revenueAccountId` khỏi `BuildCheckoutInvoiceApiPayloadInput` và khỏi `body` trả về.
  - **Khôi phục** validate (uncomment ~139-147): line chưa chọn account → trả `missing_cash_account`.
  - `payments[].accountId` = `PaymentAccountRow.accountId` (COA id) của account được chọn.
- `dtos/invoice.dto.ts` — bỏ `revenueAccountId` khỏi `CheckoutInvoiceBody`.
- `components/.../PaymentSection/PaymentSection.tsx` — truyền `branchId` vào `usePaymentAccountsQuery`; effect auto-assign **theo method** (chọn `PaymentAccountRow` active đầu tiên khớp `paymentMethod` của dòng).
- `components/common/PosPaymentMethodRow/PosPaymentMethodRow.tsx` — `PosSelect` chỉ liệt kê account khớp method của dòng; render label `{accountNumber} - {bankCode} - {bankName}` (fallback `label`, vd "Tiền mặt"); chọn → set `line.cashAccountId = option.accountId`.
- `hooks/page-hooks/checkout/use-checkout-actions.ts` — bỏ `useRevenueAccountsQuery` + arg `revenueAccountId` khi gọi `buildCheckoutInvoiceApiPayload`; truyền `branchId` vào `usePaymentAccountsQuery`; giữ resolve receivable.

## Acceptance Criteria

- [ ] Dropdown "Tài khoản thu" hiển thị tài khoản ngân hàng đúng format như mockup (`4242... - ABB - Ngân hàng TMCP An Bình`), lọc theo method của dòng.
- [ ] Body `POST /invoices/:id/checkout` **không còn** `revenueAccountId`; `payments[].accountId` là COA account thật từ `payment_accounts`.
- [ ] Chưa chọn tài khoản thu → chặn + báo lỗi, không gửi request.
- [ ] Hardcode `f29226ef...` đã bị xóa; flow debt (`payments:[]`) vẫn chạy.

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` pass.
- [ ] Manual: mở checkout → chọn "Tài khoản thu" → thanh toán → invoice PAID; kiểm tra request body không có `revenueAccountId`.

## Tech Approach

- `PaymentLine.cashAccountId` tiếp tục mang COA account id; khi chọn option thì gán `option.accountId`. (Lưu ý: mỗi ngân hàng nên là một COA sub-account riêng để duplicate-prevention theo `cashAccountId` không gom nhầm.)

## Dependencies

- Requires: TKT-2405-06 (data layer), TKT-2405-04 (DTO BE đã bỏ `revenueAccountId`).
