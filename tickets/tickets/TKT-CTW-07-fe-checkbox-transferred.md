# TKT-CTW-07 FE: pos-web FastStockTransfer — ngữ nghĩa checkbox + render dòng TRANSFERRED

## Epic

[EPIC-25062026 Checkout ↔ Kho tạm](../epics/EPIC-25062026-checkout-temp-warehouse-fulfillment.md)

## Summary

Trên trang **Chuyển kho tạm** (pos-web `FastStockTransfer`), khi **bỏ tích** "Hiển thị dòng cần kiểm tra" → gọi lines query với `includeTransferred=true` và render thêm dòng TRANSFERRED-by-sale (read-only, cột "Chuyển kho" đánh dấu, kèm số hóa đơn). Khi **tích** → chỉ tập cần xử lý (ACTIVE, giữ nguyên logic ẩn balanced-pair hiện có), dòng đã sale biến mất (ảnh #4). Bỏ tích → hiện lại (ảnh #6).

## Deliverables

- `apps/pos-web/src/services/temp-warehouse.service.ts` — truyền `includeTransferred` vào lines call khi checkbox OFF.
- `apps/pos-web/src/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-data.ts` — đưa `filters.showRowsNeedingReview` vào queryKey + chọn `includeTransferred = !showRowsNeedingReview`; merge dòng TRANSFERRED vào bảng khi OFF.
- `apps/pos-web/src/lib/page-libs/fast-stock-transfer/temp-warehouse-mappers.ts` — `lineMatchesTableFilters`: khi ON, ngoài ẩn balanced còn loại dòng TRANSFERRED; khi OFF, cho TRANSFERRED-by-sale vào, đánh dấu read-only.
- `apps/pos-web/src/components/page-components/FastStockTransfer/FastStockTransferTable/...` — cột/biểu tượng "Chuyển kho" (đã chuyển ra showroom) + hiển thị số hóa đơn; disable sửa/xóa cho dòng TRANSFERRED.

## Acceptance Criteria

- [ ] Tích checkbox → dòng đã sale (TRANSFERRED-by-sale) không hiển thị (ảnh #3/#4); tập ACTIVE cần kiểm tra hiển thị như cũ.
- [ ] Bỏ tích → dòng TRANSFERRED-by-sale hiển thị lại (ảnh #6), cột "Chuyển kho" đánh dấu, không cho sửa/xóa.
- [ ] Toggle checkbox refetch đúng (queryKey đổi theo `showRowsNeedingReview`), không cần reload trang.
- [ ] Tab "Trả lại" (showroom_to_warehouse) không bị ảnh hưởng.
- [ ] Số hóa đơn hiển thị từ `invoiceNumber` của dòng.

## Definition of Done

- [ ] App pos-web build (`pnpm --filter @erp/pos-web build`).
- [ ] UI strings Vietnamese; primitives từ `@erp/ui`; không để server data vào Zustand (chỉ filter state).
- [ ] Verify trực quan: chụp 2 trạng thái checkbox khớp ảnh #4 (ẩn) và #6 (hiện).

## Tech Approach

```ts
// use-fast-stock-transfer-data.ts
const includeTransferred = !filters.showRowsNeedingReview;
const linesQuery = useQuery({
  queryKey: ["temp-warehouse-lines", branchId, direction, includeTransferred],
  queryFn: () => tempWarehouseService.listLines({ branchId, direction, includeTransferred }),
});

// temp-warehouse-mappers.ts
if (filters.showRowsNeedingReview) {
  if (line.status === "TRANSFERRED") return false;       // dòng đã sale: ẩn
  if (balancedLineIds.has(line.id)) return false;        // giữ logic cũ
}
```

## Testing Strategy

- Verify thủ công theo skill `/verify`: tạo dòng kho tạm → checkout hóa đơn item đó → mở Chuyển kho tạm, toggle checkbox, đối chiếu ảnh #4/#6.

## Dependencies

- Depends on: TKT-CTW-04, TKT-CTW-06.
- Blocks: TKT-CTW-09.
