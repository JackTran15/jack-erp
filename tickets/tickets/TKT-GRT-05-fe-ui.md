# TKT-GRT-05 FE UI: SelectTransferReceiptDialog + nút + prefill khóa + kho nhận + save-as-import

## Epic

[EPIC-08062026 Lập phiếu nhập kho từ chứng từ điều chuyển](../epics/EPIC-08062026-goods-receipt-from-transfer.md)

## Layer

🟨 Frontend UI — `apps/backoffice-web/src/pages/purchase-orders/PurchaseOrdersPage.tsx` + dialog mới.

## Summary

Bật nút "Chọn chứng từ điều chuyển", thêm dialog picker, prefill form (khóa chi tiết), thêm picker **Kho nhận**, và đổi Lưu sang chân **nhập** khi có chứng từ.

## Deliverables

- **`SelectTransferReceiptDialog`** (file mới cạnh form, mirror `goods-issue/SelectTransferOrderDialog.tsx`): tiêu đề "Chọn chứng từ xuất kho điều chuyển"; filter preset "Hôm nay" + Từ/Đến + "Lấy dữ liệu"; bảng cột **Ngày / Số chứng từ (`exportGoodsIssueDocumentNumber`) / Tổng thành tiền (`totalAmount`)**; chọn 1 dòng; **Đồng ý / Hủy bỏ**. On "Đồng ý": fetch `GET /:id` → `onSelect(detail, row)`.
- **Nút "Chọn chứng từ điều chuyển"** (`PurchaseOrdersPage.tsx` ~line 1526): bỏ `disabled`, `onClick` mở dialog (chỉ khi purpose=TRANSFER).
- **`prefillFromTransferOrder(detail, row)`**: set `sourceBranchId=detail.sourceBranchId`, `referenceNumber/references=[row.exportGoodsIssueDocumentNumber]`, `sourceTransferOrderId=detail.id` (state ẩn + nút `(x)` ở "Tham chiếu"); map `detail.lines` → FormLine (item→SKU/tên/đơn vị, `requestedQty`→số lượng, `item.purchasePrice`→đơn giá). **Khóa chi tiết**: `showAddRow=false`, `showRowActions=false`, mọi editor `disabled` khi `sourceTransferOrderId` (mirror chân xuất).
- **Kho nhận**: thêm picker chọn kho đích (LookupField storages của chi nhánh hiện tại) → state `destinationStorageId`; bắt buộc trước khi Lưu (toast nếu thiếu). Vị trí dòng để backend tự resolve (bin mặc định của kho nhận).
- **Save**: khi `sourceTransferOrderId` set → `POST /inventory/transfer-orders/${id}/import` body `{ destinationStorageId, providerId, deliverer, references, occurredAt }` (occurredAt = ghép Ngày+Giờ nhập) thay cho `POST /goods-receipts`. Thành công → hiển thị phiếu nhập đã post (read mode).
- "Tham chiếu" render danh sách (mirror goods-issue): chip list từ `references`.

## Acceptance Criteria

- [ ] Nút bật khi purpose "Điều chuyển từ cửa hàng khác"; mở dialog liệt kê đúng chứng từ chờ nhập của chi nhánh đích; cột Số chứng từ = số phiếu XK, Tổng thành tiền đúng.
- [ ] Chọn → form nạp nguồn + dòng (khóa, không Thêm dòng/không sửa) + "Tham chiếu XK…(x)".
- [ ] Phải chọn Kho nhận; Lưu gọi `/import`; lệnh `COMPLETED`, phiếu nhập post, header round-trip.
- [ ] Phiếu nhập thường (OTHER) không đổi — vẫn `POST /goods-receipts`, chi tiết sửa được.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` (tsc) xanh; named exports, `interface Props` tách; chuỗi UI tiếng Việt.
- [ ] Verify trực quan: screenshot dialog có dữ liệu + form đã nạp (khóa) + phiếu nhập sau Lưu.

## Dependencies

- Depends on: TKT-GRT-04. Blocks: TKT-GRT-06.
