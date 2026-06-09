# TKT-IFT-05 FE UI: Tiện ích dropdown + SelectTransferOrderDialog + prefill + save-as-export

## Epic

[EPIC-08062026 Lập phiếu xuất kho từ Lệnh điều chuyển](../epics/EPIC-08062026-goods-issue-from-transfer.md)

## Layer

🟨 Frontend `backoffice-web` (UI).

## Summary

Phần MISA-style: thêm dropdown **Tiện ích** vào toolbar `GoodsIssueFormDialog`, dialog **Chọn lệnh điều chuyển**, logic pre-fill form, và đổi đường Lưu thành **export** khi form được nạp từ lệnh điều chuyển.

## Deliverables

- `apps/backoffice-web/src/pages/goods-issue/GoodsIssuePage.tsx`:
  - Thêm `ToolbarAction` **"Tiện ích"** vào mảng toolbar của `GoodsIssueFormDialog` (icon `lucide-react` như `Wrench`), `options: [{ id: 'from-transfer', label: 'Lập từ lệnh điều chuyển', onClick: () => setPickerOpen(true) }]`. Chỉ hiện khi **tạo mới** (không `isView`); **không** render 3 mục MISA còn lại.
  - State mới: `sourceTransferOrderId: string | null`, `pickerOpen: boolean`.
  - `prefillFromTransferOrder(detail)`: set `purpose='TRANSFER_OUT'` (khóa select), `targetBranchId=detail.destinationBranchId`, `referenceNumber=detail.documentNumber`, `sourceTransferOrderId=detail.id`, `lines = detail.lines.map(mapTransferLineToFormLine)`.
  - "Tham chiếu": hiển thị `referenceNumber` + nút `(x)` gỡ liên kết khi `sourceTransferOrderId` set (clear `sourceTransferOrderId`/`referenceNumber`, giữ dòng đã nạp như phiếu xuất thường). Mở rộng resolver tham chiếu hiện có (đang xử lý `STOCK_TAKE`) để cũng hiện mã `LDC` từ `sourceTransferOrderId` in-session.
  - `handleSave`: nếu `sourceTransferOrderId` → gọi `useExportTransferOrder().mutate({ id: sourceTransferOrderId, body: { lines: resolvedLines.map(toExportLine), notes } })` thay cho `POST /inventory/goods-issues`. Thành công → đóng form/chuyển read-mode phiếu xuất kho vừa post; toast; invalidate list. Nếu **không** `sourceTransferOrderId` → giữ nguyên luồng tạo phiếu xuất kho cũ.
- `apps/backoffice-web/src/pages/goods-issue/SelectTransferOrderDialog.tsx` (mới):
  - Header lọc: preset khoảng ngày ("Tháng này" mặc định) + `Từ ngày`/`Đến ngày` (input date) + nút **"Lấy dữ liệu"** (set `enabled=true` cho `useIssuableTransferOrders`).
  - Bảng cột **Ngày / Số chứng từ / Lý do / Điều chuyển đến / Trạng thái**; chọn 1 dòng (radio/row-click); empty state "KHÔNG CÓ DỮ LIỆU".
  - Footer: **Chọn** (disabled tới khi có dòng chọn) / **Hủy bỏ**. Bấm Chọn → `GET /inventory/transfer-orders/:id` lấy detail (lines + item) rồi gọi `onSelect(detail)` (đóng dialog, prefill form).
  - Dùng primitive `@erp/ui` (`Dialog`, `Button`, table), format ngày `Intl` `vi-VN`, icon `lucide-react`, token Tailwind semantic.

## Acceptance Criteria

- [ ] Toolbar form phiếu xuất kho (tạo mới) có nút **Tiện ích** → mở dropdown 1 mục "Lập từ lệnh điều chuyển".
- [ ] Dialog mặc định preset "Tháng này"; bấm "Lấy dữ liệu" mới gọi API; bảng đúng 5 cột; chỉ lệnh `DRAFT` của chi nhánh nguồn hiện ra.
- [ ] Chọn 1 lệnh → form nạp `purpose=TRANSFER_OUT` (khóa), `targetBranchId`, "Tham chiếu LDC…(x)", đủ dòng (SKU/tên/kho/đơn vị/số lượng).
- [ ] Bấm `(x)` ở Tham chiếu → gỡ `sourceTransferOrderId`, Lưu quay lại luồng phiếu xuất kho thường.
- [ ] Lưu khi có `sourceTransferOrderId` → gọi export (không gọi `POST /goods-issues`); thành công hiển thị phiếu đã post; lỗi `409`/`403`/`400` hiển thị toast tiếng Việt.

## Definition of Done

- [ ] Type-check + build `backoffice-web` xanh; named exports, `interface Props` tách rời (theo convention).
- [ ] Chuỗi UI tiếng Việt; enum/ID English; số/ngày format `vi-VN`.
- [ ] Verify trực quan: screenshot toolbar dropdown, dialog list, form sau prefill (Image #2/#3/#4) — mô tả diff.
- [ ] Không đụng `navConfig.ts`/`App.tsx` (không route mới — chỉ thêm trong form hiện có).

## Tech Approach

Toolbar đã hỗ trợ dropdown qua `ToolbarAction.options[]` (render `DropdownMenu` của `@erp/ui`) — không cần component mới cho menu. `mapTransferLineToFormLine` + `toExportLine` đặt ở data-layer ticket (IFT-04). Khóa select "Mục đích xuất kho" về `TRANSFER_OUT` khi đến từ lệnh để tránh người dùng đổi purpose rồi vẫn export.

## Testing Strategy

- Verify thủ công 3 ảnh tham chiếu; happy path create-from-transfer; edge: dialog rỗng, gỡ `(x)`, export lỗi 409 (đã export ở tab khác).

## Dependencies

- Depends on: TKT-IFT-04.
- Blocks: TKT-IFT-06.
