# TKT-CVS-04 FE: `/treasury/cash/receipts-expenses` dùng search server-side

## Epic

[EPIC-21072026 Tiền mặt — gộp 1 API tìm kiếm thu/chi + lọc theo cột cho sổ quỹ](../epics/EPIC-21072026-cash-voucher-ledger-search.md)

## Summary

Bỏ toàn bộ pipeline gộp/lọc/phân trang/cộng tổng phía trình duyệt, thay bằng một request
`POST /v2/cash-vouchers/search`. Khuôn mẫu: `TreasuryDepositReceiptsPage.tsx`.

## Deliverables

- `apps/backoffice-web/src/hooks/treasury/use-cash-vouchers.ts` (mới) — `useCashVoucherSearch`.
- `apps/backoffice-web/src/hooks/treasury/treasury-query-keys.ts` — thêm `cashVouchers`.
- `apps/backoffice-web/src/pages/treasury/cash-vouchers.types.ts` — `CashVoucherDocumentKind`,
  `CashVoucherRow`.
- `.../cash/receipts-expenses/receipt-cash.constants.ts` — đổi tên filter key + `CASH_VOUCHER_SEARCH`.
- `.../cash/receipts-expenses/useReceiptCashTableColumns.tsx` — bật `filterKind` cho từng cột.
- `.../cash/receipts-expenses/TreasuryCashReceiptsPage.tsx` — nối search server-side.
- **Xóa** `apps/backoffice-web/src/hooks/treasury/use-merged-receipt-payments.ts` và các hàm chết
  trong `cash-vouchers.adapters.ts`.

## Acceptance Criteria

- [ ] Mỗi lần lọc chỉ phát **1** request (sau debounce 300ms), không còn 2 request `/cash-receipts` +
      `/cash-payments`.
- [ ] `total` (phân trang) và "Tổng tiền" lấy từ response (`total`, `totalAmount`) — đúng trên toàn
      tập, không giới hạn 100+100.
- [ ] Cột ngày là **"Ngày tạo"** render `created_at`, lọc `date-range`; kỳ (period) nạp vào
      `createdAt` khi ô lọc cột để trống.
- [ ] Cột "Loại chứng từ" lọc bằng **giá trị enum** (3 giá trị), không còn so khớp theo nhãn text.
- [ ] Cột "Trạng thái" có bộ lọc select (trước đây không lọc được).
- [ ] Cột "Tổng tiền" có bộ lọc `number-range`; "Số chứng từ" / "Đối tượng nộp/nhận" / "Lý do" lọc chuỗi.
- [ ] Đổi bất kỳ bộ lọc nào → về trang 1.
- [ ] Chọn dòng ở trang 2 vẫn mở đúng dialog phiếu thu/phiếu chi; nút Sửa/Đảo/Xóa vẫn đúng theo
      `status` và `isGoodsReceiptPayment`.
- [ ] `cashAccountId` chỉ gửi khi `useMyBranchCashAccount()` có giá trị.
- [ ] Chỉ gửi các key khai báo trong `V2SearchConfig` (BE bật `forbidNonWhitelisted`).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Không còn import chết; `use-merged-receipt-payments.ts` đã xóa.
- [ ] Chuỗi UI tiếng Việt; enum/ID giữ English.

## Tech Approach

```ts
// receipt-cash.constants.ts — key đặt trùng tên field request để buildV2Body map thẳng
export const RECEIPT_CASH_FILTER_KEYS = [
  "createdAt", "documentNumber", "documentKind",
  "status", "totalAmount", "counterparty", "reason",
] as const;

export const CASH_VOUCHER_SEARCH: V2SearchConfig = {
  path: "/v2/cash-vouchers/search",
  fields: {
    createdAt: "date-range", documentNumber: "string", documentKind: "enum",
    status: "enum", totalAmount: "compare", counterparty: "string", reason: "string",
  },
};
```

Trang: `useDebouncedValue(columnFilters, 300)` → `buildV2Body(CASH_VOUCHER_SEARCH, merged, page,
pageSize)` (kỳ nạp vào `createdAt.from/to` khi ô cột trống) → `useCashVoucherSearch`. Bỏ
`filteredRows` / `pagedRows` / `applyColumnFilter` / `toComparableText`.

`ReceiptPaymentListItem` dựng từ `CashVoucherRow`: `kind` và `isGoodsReceiptPayment` suy từ
`documentKind`, `isAutoVoucher` vẫn từ `referenceType`.

Options "Loại chứng từ" phải mang **value** enum (hiện đang mang label, vì trước đây so khớp text ở
client) — giống `RECEIPT_DEPOSIT_DOCUMENT_TYPE_FILTER_OPTIONS`.

Dọn orphan do thay đổi này tạo ra: `use-merged-receipt-payments.ts` (chỉ trang này dùng) và
`mergeReceiptPaymentLists` / `filterReceiptPaymentByPeriod` / `toReceiptListItem` /
`toPaymentListItem` trong `cash-vouchers.adapters.ts`.
**Không đụng** `receiptPaymentToLedgerRow` — code chết **trước** epic này, chỉ ghi nhận trong tổng kết.

## Testing Strategy

- Build + click-through thật: gõ từng ô lọc, xem network chỉ 1 POST/lần; đổi kỳ; sang trang 2; mở
  dialog từ dòng trang 2; kiểm "Tổng tiền" đổi theo bộ lọc.

## Dependencies

- Depends on: TKT-CVS-01, TKT-CVS-03
- Blocks: —
