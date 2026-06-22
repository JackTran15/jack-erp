# TKT-CPD-06 FE: Nhập kho + Xuất kho — hiển thị + rehydrate Đối tượng (3 loại)

## Epic

[EPIC-22062026 Hiển thị "Đối tượng" trên Nhập / Xuất / Chuyển kho](../epics/EPIC-22062026-counterparty-display-inventory-docs.md)

## Summary

FE đọc `counterparty` mới từ row search để: (1) cột "Đối tượng" hiện tên cho cả 3 loại (hết `—`), (2) mở lại phiếu → picker hiện đúng đối tượng đã lưu. Xuất kho hiện chưa có `counterpartyKind` trong interface và không rehydrate kind khi sửa → bổ sung. Picker đã wired sẵn ở EPIC-21062026.

## Deliverables

- `apps/backoffice-web/src/pages/purchase-orders/PurchaseOrdersPage.tsx`
  - `interface GoodsReceipt`: thêm `counterparty?: { kind: "supplier"|"customer"|"employee"; id: string; code: string|null; name: string } | null`.
  - Cột "party": render `row.counterparty?.name ?? row.provider?.name ?? (row.providerId ? providerNameById.get(row.providerId) ?? row.providerId : "—")`.
  - `initialProvider` / rehydrate: ưu tiên `initial.counterparty` (name + code) khi mở lại (đối tượng customer/employee không nằm trong cache `providers`).
- `apps/backoffice-web/src/pages/goods-issue/GoodsIssuePage.tsx`
  - `interface GoodsIssue`: thêm `counterpartyKind?`, `counterpartyId?`, `counterparty?` (như trên).
  - Form init: `setCounterpartyKind(initial.counterpartyKind ?? "")`; tên từ `initial.counterparty?.name`.
  - Cột "party": `row.counterparty?.name ?? row.provider?.name ?? (row.purpose === "TRANSFER_OUT" ? row.targetBranch?.name : null) ?? "—"`.
  - **Fix**: thêm `counterpartyKind` vào dependency array của `handleSave` (đang thiếu → stale closure).

## Acceptance Criteria

- [ ] Nhập kho: tạo phiếu với Khách hàng (Image #2 repro) → danh sách hiện **tên khách hàng**, không `—`; mở lại phiếu picker hiện đúng tên + loại. Tương tự NCC + Nhân viên.
- [ ] Xuất kho: tương tự cho 3 loại; phiếu TRANSFER_OUT vẫn hiện tên chi nhánh đích.
- [ ] Sửa phiếu rồi lưu lại **không mất** loại đối tượng (`counterpartyKind` không bị rớt do stale closure).
- [ ] UI strings tiếng Việt; số/tiền `Intl` `vi-VN`.

## Definition of Done

- [ ] FE `tsc` xanh; không regression phiếu supplier hiện có.
- [ ] Verify trực quan: screenshot danh sách + mở lại phiếu cho customer/employee.

## Tech Approach

```tsx
// PurchaseOrdersPage — cột Đối tượng
render: (row) =>
  row.counterparty?.name ??
  row.provider?.name ??
  (row.providerId ? providerNameById.get(row.providerId) ?? row.providerId : "—"),

// rehydrate khi mở lại (initialProvider)
if (initial?.counterparty) return { code: initial.counterparty.code ?? "", name: initial.counterparty.name };
```

```tsx
// GoodsIssuePage — fix dep array
}, [customerId, counterpartyKind, lines, notes, deliveryPerson, references,
    docDate, docTime, purpose, reasonId, targetBranchId, sourceTransferOrderId, onSaved]);
```

## Dependencies

- Depends on: TKT-CPD-02, TKT-CPD-03, TKT-CPD-05.
- Blocks: TKT-CPD-08.
