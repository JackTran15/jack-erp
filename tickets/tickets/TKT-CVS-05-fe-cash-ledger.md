# TKT-CVS-05 FE: `/treasury/cash/ledger` lọc theo cột trên server

## Epic

[EPIC-21072026 Tiền mặt — gộp 1 API tìm kiếm thu/chi + lọc theo cột cho sổ quỹ](../epics/EPIC-21072026-cash-voucher-ledger-search.md)

## Summary

Bật bộ lọc theo cột cho sổ quỹ tiền mặt (hiện mọi cột đều `filterKind: "none"`), chạy qua
`POST /v2/cash-ledger/search`. Khuôn mẫu: `LedgerDepositPage.tsx`.

## Deliverables

- `apps/backoffice-web/src/hooks/treasury/use-cash-ledger.ts` — thêm `useCashLedgerSearch`.
- `apps/backoffice-web/src/hooks/treasury/treasury-query-keys.ts` — thêm `cashLedgerSearch`.
- `.../pages/treasury/ledger-cash/LedgerCashPage.tsx` — state bộ lọc + debounce + `buildV2Body`.
- `.../pages/treasury/ledger-cash/components/ledger/LedgerCashTable.tsx` — nhận và chuyển tiếp
  `columnFilterControl`.
- `.../pages/treasury/ledger-cash/components/ledger/useLedgerCashTableColumns.tsx` — bật `filterKind`.
- `.../pages/treasury/cash-vouchers.adapters.ts` — `cashLedgerRowToUiRow`: map `staff` vào
  `employee`, và fallback nhãn `'(Chưa có chứng từ)'` khi `voucherNumber` null.
- `.../pages/treasury/cash-vouchers.types.ts` — `CashLedgerRow.voucherNumber: string | null`.

## Acceptance Criteria

- [ ] Lọc được: Ngày chứng từ (date-range trên `createdAt`), Số phiếu thu / Số phiếu chi (cả hai
      cùng map vào `documentNumber`), Diễn giải, Đối tượng nộp/nhận, Đối tượng thu/chi (staff),
      Số tiền thu / Số tiền chi (`number-range`).
- [ ] "Số tiền còn lại" (`balance`) **không** có bộ lọc — tính theo trang từ dòng đã sắp xếp.
- [ ] Dòng "Số dư đầu kỳ" chỉ hiện ở trang 1 và không tính vào `total`.
- [ ] Số dư lũy kế vẫn đúng khi sang trang 2+ và khi có bộ lọc.
- [ ] Cột "Đối tượng thu/chi" hiển thị tên nhân viên thật (trước đây hard-code `""`) — không ship bộ
      lọc trên một cột rỗng vĩnh viễn.
- [ ] Debounce 300ms → mỗi đợt gõ chỉ 1 request.
- [ ] Đổi bộ lọc → về trang 1.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Chuỗi UI tiếng Việt.
- [ ] Không đổi cấu trúc bảng/summary hiện có (tổng thu/chi/số dư cuối kỳ vẫn ở chỗ cũ).

## Tech Approach

```ts
const LEDGER_CASH_SEARCH: V2SearchConfig = {
  path: "/v2/cash-ledger/search",
  fields: {
    createdAt: "date-range", documentNumber: "string", description: "string",
    counterparty: "string", staff: "string",
    amountIn: "compare", amountOut: "compare",
  },
};
```

Hai cột `receiptNo` / `paymentNo` cùng render một `document_number`; ô nào người dùng điền thì ô đó
thắng (không dòng nào vừa có số phiếu thu vừa có số phiếu chi) — đúng thủ thuật `LedgerDepositPage`
đang dùng.

`useCashLedgerSearch` giữ nguyên phần map `openingRow` / `transactionRows` / totals của
`useCashLedgerOffsetPage`, nên bảng không phải đổi.

Nhãn `'(Chưa có chứng từ)'` chuyển từ backend về đây (xem TKT-CVS-02).

## Testing Strategy

- Build + click-through: lọc "Diễn giải" chứa một từ khóa → chỉ dòng khớp; lọc "Số tiền chi ≤ N" →
  chỉ dòng chi; sang trang 2 kiểm số dư lũy kế nối tiếp; xóa hết bộ lọc → khớp kết quả v1 cũ.

## Dependencies

- Depends on: TKT-CVS-02, TKT-CVS-03
- Blocks: —
