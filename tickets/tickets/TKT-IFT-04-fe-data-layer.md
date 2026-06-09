# TKT-IFT-04 FE data layer: useIssuableTransferOrders + export-with-lines hook

## Epic

[EPIC-08062026 Lập phiếu xuất kho từ Lệnh điều chuyển](../epics/EPIC-08062026-goods-issue-from-transfer.md)

## Layer

🟨 Frontend `backoffice-web` (data layer, no UI).

## Summary

Hook TanStack Query cho dialog picker và mutation lưu-bằng-export. `backoffice-web` dùng `apiClient` (axios) như `GoodsIssuePage` hiện tại; giữ nguyên pattern đó (không bắt buộc đổi sang `erpApi` nếu page chưa dùng).

## Deliverables

- Hook query danh sách lệnh có thể xuất (lazy — chỉ chạy khi bấm "Lấy dữ liệu"):
  ```ts
  // apps/backoffice-web/src/pages/goods-issue/useIssuableTransferOrders.ts
  export function useIssuableTransferOrders(from: string, to: string, enabled: boolean) {
    return useQuery({
      queryKey: ["transfer-orders", "issuable", from, to],
      queryFn: async () => (await apiClient.get<IssuableTransferOrderListItem[]>(
        "/inventory/transfer-orders/issuable", { params: { from, to } })).data,
      enabled,
    });
  }
  ```
- Mutation export-from-form:
  ```ts
  export function useExportTransferOrder() {
    return useMutation({
      mutationFn: async (vars: { id: string; body: ExportTransferOrderRequest }) =>
        (await apiClient.post(`/inventory/transfer-orders/${vars.id}/export`, vars.body)).data,
    });
  }
  ```
- Helper map dòng lệnh → `FormLine` (dùng ở UI ticket): item.code→`itemLabel`, item.unit→`unit`, `sourceStorageId`→`storageId` + resolve location mặc định, `requestedQty`→`quantity`, `item.purchasePrice`→`unitPrice`.
- Import type từ `@erp/shared-interfaces` (`IssuableTransferOrderListItem`, `ExportTransferOrderRequest`).

## Acceptance Criteria

- [ ] `useIssuableTransferOrders` không tự chạy khi mở dialog; chỉ fetch khi `enabled=true` (sau "Lấy dữ liệu"); `queryKey` gồm cả `from`/`to`.
- [ ] `useExportTransferOrder` POST đúng `/:id/export` với body `lines/reason/notes`; lỗi API ném ra để UI hiển thị toast.
- [ ] Sau export thành công, invalidate prefix `["transfer-orders"]` và `["goods-issues"]` để list cập nhật.

## Definition of Done

- [ ] Type-check `backoffice-web` xanh; không `any` cho payload (dùng type shared).
- [ ] Không đưa server-data vào Zustand (chỉ TanStack Query).
- [ ] Không UI trong ticket này.

## Tech Approach

`queryKey` bắt đầu bằng resource name `"transfer-orders"` + namespace `"issuable"` + filter — invalidate theo prefix. `X-Idempotency-Key`/`X-Branch-Id` do `apiClient` interceptor tự gắn (giống GoodsIssuePage).

## Dependencies

- Depends on: TKT-IFT-03 (client snapshot), TKT-IFT-01 (types).
- Blocks: TKT-IFT-05.
