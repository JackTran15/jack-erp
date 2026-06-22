# TKT-CPD-07 FE: Chuyển kho — thay transporter bằng picker Đối tượng

## Epic

[EPIC-22062026 Hiển thị "Đối tượng" trên Nhập / Xuất / Chuyển kho](../epics/EPIC-22062026-counterparty-display-inventory-docs.md)

## Summary

`StockTransferPage` đang dùng trường Người vận chuyển (`transporterUserId`) cho cột "Đối tượng". Theo yêu cầu, đổi sang `CounterpartyPickerField` (NCC/KH/NV) như Nhập/Xuất kho: gửi `counterpartyKind` + `counterpartyId` khi lưu, hiển thị `counterparty.name`. Phiếu legacy (chưa có counterparty) **fallback** hiển thị transporter.

## Deliverables

- `apps/backoffice-web/src/pages/stock-transfer/StockTransferPage.tsx`
  - `interface Transfer`: thêm `counterpartyKind?`, `counterpartyId?`, `counterparty?: { kind; id; code; name } | null`.
  - Form Thêm mới/Sửa: thay field chọn Người vận chuyển bằng `CounterpartyPickerField` (`allowedTypes={["supplier","customer","employee"]}`) cho trường "Đối tượng"; lưu `counterpartyKind` + `counterpartyId` vào payload create/update.
  - Cột "party": render `row.counterparty?.name ?? row.transporter?.fullName ?? "—"`.
  - Rehydrate picker khi mở lại từ `initial.counterparty`.

## Acceptance Criteria

- [ ] Tạo/sửa phiếu Chuyển kho chọn được NCC / Khách hàng / Nhân viên; lưu xong danh sách hiện đúng tên đối tượng; mở lại picker hiện đúng.
- [ ] Phiếu Chuyển kho **cũ** (counterparty NULL) vẫn hiện tên Người vận chuyển (fallback), không vỡ.
- [ ] Payload create/update gửi `counterpartyKind` + `counterpartyId` (qua axios `apiClient`); idempotency header giữ nguyên.
- [ ] UI strings tiếng Việt.

## Definition of Done

- [ ] FE `tsc` xanh; không regression form Chuyển kho hiện có (kho xuất/nhập, vị trí, dòng hàng).
- [ ] Verify trực quan: tạo phiếu với customer → list + mở lại; mở 1 phiếu legacy có transporter → vẫn hiện tên.

## Tech Approach

```tsx
// cột Đối tượng
render: (row) => row.counterparty?.name ?? row.transporter?.fullName ?? "—",

// form: thay select transporter → picker
<CounterpartyPickerField
  allowedTypes={["supplier", "customer", "employee"]}
  onSelect={(c) => { setCounterpartyId(c.id); setCounterpartyKind(c.kind); markDirty(); }}
/>

// payload create/update
{ ...rest, counterpartyKind: counterpartyKind || undefined, counterpartyId: counterpartyId || undefined }
```

> Quyết định: **không** gửi `transporterUserId` nữa từ form (cột giữ lại trong DB cho phiếu cũ). Nếu sau này cần cả "Người vận chuyển" lẫn "Đối tượng" là 2 trường tách biệt → tách ticket riêng (ngoài scope epic này).

## Dependencies

- Depends on: TKT-CPD-04, TKT-CPD-05.
- Blocks: TKT-CPD-08.
