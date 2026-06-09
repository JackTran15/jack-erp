# TKT-ITV-08 FE UI: rework TransferOrdersPage — per-line src/dest Kho + export/import utility + QR

## Epic

[EPIC-07062026 Phiếu Điều Chuyển Kho](../epics/EPIC-07062026-inventory-transfer-voucher.md)

## Layer

🟨 Frontend (backoffice-web) — sửa trang hiện có.

## Summary

Cải tạo **trang Lệnh điều chuyển hiện có** (`apps/backoffice-web/src/pages/transfer-orders/TransferOrdersPage.tsx`) thành phiếu điều chuyển 2 pha. Giữ nguyên bố cục dialog tham chiếu (ảnh): **THÔNG TIN CHUNG** trái / **CHỨNG TỪ** phải / **CHI TIẾT** bảng dòng — nhưng cột Kho tách thành **Kho nguồn + Kho đích theo từng dòng**, thêm xác nhận **xuất** (Store A) / **nhập** (Store B), tải đính kèm thật, mã QR để in, và cancel-reverse. Bỏ UI approve/execute. UI string tiếng Việt.

## Deliverables

### Dialog tạo/sửa (khớp ảnh "Thêm mới lệnh điều chuyển")

- **THÔNG TIN CHUNG** (trái): `Điều chuyển từ` (branch nguồn, mặc định active branch) · `Đến` (branch đích, picker có search) · `Lý do/Mô tả` (notes) · `Tài liệu đính kèm` (tái dùng `ImportFilePicker`, lưu vào `attachmentIds`).
- **CHỨNG TỪ** (phải): `Số phiếu` (LDC, read-only) · `Ngày chứng từ` · `Trạng thái` (DRAFT→"Nháp"/IN_PROGRESS→"Đang điều chuyển"/COMPLETED→"Hoàn thành"/CANCELLED→"Đã huỷ").
- **CHI TIẾT** (bảng dòng): `Mã SKU` (item picker) · `Tên hàng hóa` · **`Kho nguồn`** (storage picker trong branch nguồn) · **`Kho đích`** (storage picker trong branch đích) · `Đơn vị tính` · `Số lượng` · `Ghi chú` · xoá dòng · `+ Thêm dòng`. (Tách cột "Kho" đơn của ảnh thành 2 cột nguồn/đích.)
- Footer `Số dòng` / tổng `Số lượng` như ảnh.

### Hành vi theo trạng thái

- `DRAFT`: sửa toàn bộ; nút `Lưu`, `Huỷ`, và **`Xác nhận xuất kho`** (nếu active branch = branch nguồn).
- Nút `Xác nhận xuất kho`: nếu có dòng `Số lượng > tồn` ở kho nguồn → badge/cảnh báo vàng "xuất kho khống" nhưng **vẫn cho bấm**.
- `IN_PROGRESS`: form khoá, chỉ sửa `Mô tả` + `Đính kèm`; nút **`Xác nhận nhập kho`** (nếu active branch = branch đích); **không** có nút tự chuyển COMPLETED.
- `COMPLETED`: read-only; hiển thị liên kết phiếu nhập (`importGoodsReceiptId` = import_reference) + phiếu xuất (`exportGoodsIssueId`).
- `Huỷ`: DRAFT hoặc IN_PROGRESS (IN_PROGRESS cảnh báo "sẽ đảo bút toán xuất").

### Tiện ích load theo mã + QR

- Nút "Nạp"/ô nhập mã trên toolbar → `useTransferOrderByCode` để load nhanh phiếu rồi xác nhận xuất/nhập (đúng pattern toolbar hiện có có nút "Nạp").
- Nút **In**: render `documentNumber` thành QR/barcode (lib nhỏ, vd `qrcode.react`); tối thiểu show text mã + in.

### Dọn dẹp

- Bỏ mọi UI/handler approve/execute và tham chiếu `TransferOrderStatus.APPROVED`/`.EXECUTED`.
- Route `/inventory/transfer-orders` + nav giữ nguyên; cân nhắc đổi nhãn navConfig "Lệnh điều chuyển" → "Phiếu điều chuyển" (xác nhận ở review).

## Acceptance Criteria

- [ ] Tạo phiếu → `DRAFT`, hiện Số phiếu LDC + QR (nút In).
- [ ] Mỗi dòng chọn được **kho nguồn và kho đích riêng**; lưu đúng `sourceStorageId`/`destinationStorageId`.
- [ ] Store A (active branch = nguồn) xác nhận xuất → `IN_PROGRESS`; dòng thiếu tồn cảnh báo vàng nhưng nút xuất vẫn bấm được.
- [ ] Store B (active branch = đích) load mã (chỉ `IN_PROGRESS` mới cho nhập) → xác nhận nhập → `COMPLETED`; hiển thị import_reference.
- [ ] Sau `IN_PROGRESS` form chỉ cho sửa mô tả + đính kèm; không nút tự chuyển `COMPLETED`.
- [ ] Huỷ DRAFT/IN_PROGRESS hoạt động; UI cập nhật sau invalidate; không còn nút approve/execute.
- [ ] String tiếng Việt; primitives từ `@erp/ui`; icon `lucide-react`; named export + `interface Props` tách rời.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Verify trực quan: screenshot create (2 cột kho) + export-warning + import-completed (mô tả diff trong PR).
- [ ] Không tham chiếu enum status cũ.

## Tech Approach

Sửa tại chỗ `TransferOrdersPage` + dialog của nó; thêm cột storage picker (lọc storages theo branch nguồn/đích đã chọn). Nút xuất/nhập disable theo `status` + so `activeBranchId` với `sourceBranchId`/`destinationBranchId`. Cảnh báo tồn: map balance (TKT-ITV-07) theo từng dòng, badge đỏ nếu `requestedQty > onHand` tại kho nguồn dòng đó. Đính kèm: tái dùng `ImportFilePicker` (drag-drop) → set `attachmentIds`.

## Dependencies

- Depends on: TKT-ITV-07.
- Blocks: TKT-ITV-09.
