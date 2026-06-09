# TKT-IWT-05 FE: rebuild form Chuyển kho kho→kho (header + cột chi tiết + pickers)

## Epic

[EPIC-09062026 Chuyển kho giữa các kho trong cùng chi nhánh](../epics/EPIC-09062026-inter-warehouse-transfer.md)

## Layer

🟩 Frontend only (backoffice-web).

## Summary

Rebuild `StockTransferPage.tsx` để khớp form mShopKeeper (Image #2/#3): bỏ Kho/Vị trí ở header, đưa **Kho xuất / Kho nhập theo dòng**; thêm Người vận chuyển, Tài liệu đính kèm, cột Đơn giá / Thành tiền. Route `/inventory/stock-transfers` + NavChild + tab `inventoryTabs` đã tồn tại → KHÔNG đổi.

## Deliverables

- `apps/backoffice-web/src/pages/stock-transfer/StockTransferPage.tsx` — rework `TransferFormDialog`:
  - **Header (THÔNG TIN CHUNG)**: `Người vận chuyển` (LookupField → `POST /v2/employees/search`, hiển thị `code · fullName`, lưu `transporterUserId`), `Diễn giải` (notes), `Tài liệu đính kèm` (field attachment giống form Phiếu nhập kho/Lệnh điều chuyển — chỉ lưu `attachmentIds`, chưa cần upload thật). Bỏ field header `Kho` / `Vị trí xuất` / `Vị trí nhập`.
  - **Chứng từ**: `Số phiếu chuyển` (readonly, hệ thống sinh), `Ngày chuyển` (date), `Giờ chuyển` (time) → gộp thành `transferredAt` (ISO) khi submit.
  - **CHI TIẾT (LineItemGrid)** cột: `Mã SKU`, `Tên hàng hóa`, `Kho xuất` (storage picker, scope chi nhánh active), `Vị trí xuất` (location picker scope theo `sourceStorageId` của dòng; placeholder "Mặc định"), `Kho nhập` (storage picker), `Vị trí nhập` (scope theo `destinationStorageId`; "Mặc định"), `ĐVT` (readonly), `Số lượng`, `Đơn giá` (number, bỏ trống = auto), `Thành tiền` (readonly = đơn giá × SL), `Ghi chú`.
  - **Storage picker**: nạp `GET /inventory/storages?branchId=<active>` (đã có `loadStorages`); cùng nguồn cho Kho xuất & Kho nhập. Chọn Kho xuất/nhập của dòng → clear Vị trí tương ứng của dòng đó.
  - **Location picker**: `GET /inventory/locations?storageId=<dòng>` theo Kho của dòng; bỏ trống vị trí = gửi rỗng (BE resolve "Mặc định").
  - **Payload** (`POST /inventory/stock/transfers`): `{ transporterUserId?, attachmentIds?, transferredAt?, notes?, lines: [{ itemId, sourceStorageId, destinationStorageId, sourceLocationId?, destinationLocationId?, quantity, unitPrice?, notes? }] }`. Bỏ gọi 2 lần `GET /inventory/locations/:id` để suy branch (BE tự set theo `actor.branchId`).
  - **Footer**: `Số dòng`, `Tổng số lượng`, `Tổng thành tiền` (Intl `vi-VN`).
  - Cập nhật `interface Transfer`/`TransferLine` local theo response inline mới (storages/locations/unitPrice/lineValue/transporter); validate FE: mỗi dòng phải có Kho xuất + Kho nhập + SL > 0.

## Acceptance Criteria

- [ ] Form render đúng Image #2: header có Người vận chuyển/Diễn giải/Tài liệu đính kèm; chi tiết có Kho xuất/Vị trí xuất/Kho nhập/Vị trí nhập/Đơn giá/Thành tiền.
- [ ] Dropdown Kho (xuất & nhập) chỉ liệt kê kho thuộc chi nhánh đang chọn (Image #3).
- [ ] Bỏ trống Vị trí → vẫn lưu được (BE dùng location mặc định); bỏ trống Đơn giá → BE tự tính, hiển thị lại sau khi lưu.
- [ ] Lưu thành công → phiếu "Đã thực hiện"; toast tiếng Việt; lỗi (khác chi nhánh / thiếu tồn) hiển thị message BE.
- [ ] Chọn Kho khác cho từng dòng độc lập.

## Definition of Done

- [ ] UI strings tiếng Việt; số/tiền format `Intl` `vi-VN`.
- [ ] Import primitives từ `@erp/ui`; icons `lucide-react`; không default export.
- [ ] Verify trực quan: screenshot form mới khớp Image #2 (header + cột), demo 1 phiếu kho→kho lưu thành công.
- [ ] Không đổi `App.tsx` / `navConfig.ts` / `inventoryTabs.tsx` (đã có sẵn).

## Tech Approach

- Tái dùng `DocumentFormDialog`, `LineItemGrid`, `LookupField` đang dùng trong file; thêm 2 cột storage tương tự cột location hiện có.
- Picker nhân viên: tham chiếu pattern `useUsers` / employee search đã dùng ở treasury/role-management.
- Field attachment: tham chiếu form `Phiếu nhập kho`/`Lệnh điều chuyển` (cùng convention `attachmentIds`).

## Dependencies

- Requires: TKT-IWT-04 (client type mới).
- Blocks: TKT-IWT-06 (verify e2e UI).
