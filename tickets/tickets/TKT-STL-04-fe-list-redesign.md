# TKT-STL-04 FE: redesign danh sách Chuyển kho (v2 search + master-detail)

## Epic

[EPIC-09062026 Danh sách Chuyển kho theo mẫu mShopKeeper](../epics/EPIC-09062026-stock-transfer-list-v2.md)

## Layer

🟩 Frontend only (backoffice-web).

## Summary

Redesign phần **danh sách** trong `StockTransferPage.tsx` để khớp Image #8, mirror `GoodsIssuePage`: lọc theo từng cột (server-side v2), footer Tổng tiền, panel "Chi tiết" master-detail, và toolbar Thêm mới / Nhân bản / Xem / Sửa / Xóa / Nạp. KHÔNG đụng form Thêm mới/Sửa (đã xong ở epic trước). Route + NavChild + tab đã có → không đổi.

## Deliverables

- `apps/backoffice-web/src/pages/stock-transfer/StockTransferPage.tsx` — phần list:
  - Thay `apiClient.get('/inventory/stock/transfers')` bằng **`useCrudV2Search`** gọi `POST /v2/inventory/stock/transfers/search` (mirror `GoodsIssuePage`), map `ColumnFilter` → v2 body qua `crudV2Search.ts`.
  - **Cột** (`BaseDataTable` + `columnFilterControl`): checkbox chọn; `Ngày` (date-range filter); `Số phiếu chuyển` (link → mở Xem); `Đối tượng` (= `transporter.fullName`, contains); `Tổng tiền` (= `totalAmount`, `formatMoneyInteger`, compare `≤`); `Diễn giải` (contains). Bỏ Trạng thái / Số dòng / Tổng số lượng.
  - **Footer**: ô `footer` cột Tổng tiền = ∑ `totalAmount` của trang (`formatMoneyInteger`).
  - **Row-click → chọn dòng**: `BaseDataTable` `onRowClick={(row) => setSelectedId(row.id)}`; `selected = rows.find(r => r.id === selectedId)`. Dòng đang chọn highlight.
  - **Component `DetailPanel`** (mirror `DetailPanel` của `GoodsIssuePage`, đặt cuối file): nhận `transfer = selected`, render tiêu đề "Chi tiết" + bảng lines **đọc thẳng `selected.lines`** (đã embed từ search, không fetch thêm): Mã SKU, Tên hàng hóa, Kho xuất, Vị trí xuất, Kho nhập, Vị trí nhập, ĐVT, Số lượng, Đơn giá (`formatMoneyInteger`), Thành tiền (`formatMoneyInteger`), Ghi chú. Khi `selected == null` → "Chọn một phiếu để xem chi tiết."; lines rỗng → "Phiếu này chưa có dòng hàng.". Đặt panel ngay dưới bảng danh sách (DocumentListShell footer/area), giống Image #8.
  - **Toolbar**: `Thêm mới`, `Nhân bản` (mở form create đã prefill từ phiếu chọn — map lines → FormLine: storages/locations/qty/unitPrice; bỏ id/documentNumber), `Xem`, `Sửa` (chỉ DRAFT — giữ disabled như cũ), `Xóa` (gọi `POST /inventory/stock/transfers/:id/cancel` qua `ConfirmActionModal`, toast, reload), `Nạp`.
  - Giữ `PeriodFilter` (Tháng này / Từ–Đến ngày) feed vào filter `transferredAt` range.

## Acceptance Criteria

- [ ] Lọc theo từng cột query toàn dataset + phân trang server-side (không chỉ trang đã tải).
- [ ] Cột Đối tượng hiện tên Người vận chuyển; Tổng tiền đúng ∑ thành tiền; footer cộng đúng tổng trang (vd 641.000).
- [ ] **Click 1 dòng phiếu** → panel "Chi tiết" phía dưới hiện đủ dòng hàng (kho xuất/nhập, vị trí, đơn giá, thành tiền) của phiếu đó, đọc từ `selected.lines` (không gọi thêm API); chưa chọn → "Chọn một phiếu để xem chi tiết."; click dòng khác → panel cập nhật.
- [ ] Nhân bản mở form Thêm mới đã prefill; lưu tạo phiếu mới.
- [ ] Xóa: xác nhận → phiếu rời danh sách, toast tiếng Việt; lỗi BE hiển thị nguyên văn.
- [ ] Click `Số phiếu chuyển` mở dialog Xem.

## Definition of Done

- [ ] `tsc` backoffice xanh; UI strings tiếng Việt; số/tiền `Intl` `vi-VN`.
- [ ] Import từ `@erp/ui`; không default export; icons `lucide-react`.
- [ ] Verify trực quan: screenshot danh sách mới khớp Image #8 (cột + filter row + footer + Chi tiết).
- [ ] Không đổi `App.tsx` / `navConfig.ts` / `inventoryTabs.tsx`.

## Tech Approach

- Mirror cấu trúc list của `GoodsIssuePage.tsx` (cùng `useCrudV2Search` + `columnFilterControl` + footer + panel Chi tiết + Nhân bản/Xóa).
- Nhân bản: tái dùng `TransferFormDialog` ở `mode="create"` với `initial` = bản sao đã strip id/documentNumber/status.

## Dependencies

- Requires: TKT-STL-03 (client type v2), TKT-STL-02 (endpoint Xóa).
- Blocks: TKT-STL-05 (verify).
