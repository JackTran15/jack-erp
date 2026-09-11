---
feature: temp-warehouse-line-shelf
adr_count: 1
---

# Logical design — temp-warehouse-line-shelf

## Approach

API trả kệ của từng dòng; POS hiển thị và dựng cache theo id thay vì theo bản chụp chữ `notes`.

### Backend

- `attachLineRelations` (`temp-warehouse.service.ts:935-967`) gom thêm `l.sourceLocationId` vào mảng id
  của **cùng** lượt `loadLocations` (`:1020-1035`, `IN (...)`), trả thêm `sourceShelf: PublicLocation | null`.
- `LineWithRelations` (`:86-91`) và `TempWarehouseLine` dùng chung
  (`packages/shared-interfaces/src/inventory/temp-warehouse.ts:60-90`) thêm
  `sourceShelf?: TempWarehousePublicLocation | null`.
- `sourceLocation` / `destinationLocation` giữ nguyên nghĩa kệ của phiên.

### POS

Thứ tự ưu tiên thống nhất: `sourceShelf` trước, rồi mới tới cách cũ.

- `locationLabelForLine`: tên kệ của `sourceShelf` (rỗng thì mã kệ); không có `sourceShelf` thì `notes`.
- `catalogLineFromTempWarehouseLine` (`picker-cache.ts:39-64`): kệ của sản phẩm dựng từ dòng lấy
  `sourceShelf` khi có, không có mới rơi về kệ phiên theo chiều như hiện tại.
- `locationFromLine` (`fast-stock-transfer-pickers.ts:62-67`): tên dự phòng lấy `sourceShelf` trước
  `sourceLocation`.
- `handleStartEdit` (`use-fast-stock-transfer-actions.ts:372-388`): sản phẩm dựng tại chỗ dùng
  `sourceShelf` trước.
- `notes` vẫn được ghi khi thêm/sửa như cũ; chỉ thôi làm nguồn hiển thị khi đã có `sourceShelf`.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Chỉ sửa đường ghi (cache dùng `notes`) cộng script sửa `notes` trên prod | Hiển thị vẫn dựa vào bản chụp chữ; phải ghi dữ liệu prod; dòng hỏng trong phiên đang mở còn sai tới khi chạy script |
| Tính kệ ưu tiên hiện tại lúc đọc, như báo cáo | Có thể khác kệ phiếu chuyển thật sự xuất (`source_location_id` → materializer) ⇒ tạo lệch mới; tra theo mặt hàng mỗi lần tải. A-02 đã chốt hiện kệ đã quét |
| Đổi nghĩa `sourceLocation` thành kệ của dòng | `sourceLocation`/`destinationLocation` là kệ phiên theo chiều (tab "Trả lại" đảo vai); đổi nghĩa field sẵn có khó đọc hơn thêm field mới |
| POS tự tra tên kệ theo `sourceLocationId` bằng một request riêng | Thêm một lượt gọi và một cache phía client, trong khi API đã nạp kệ theo lô ngay trong `attachLineRelations` |

## Contracts

### Danh sách dòng kho tạm (`temp-warehouse.controller.ts:118-122`)

Chỉ thêm trường, không đổi trường cũ:

```json
{
  "id": "…",
  "sourceLocationId": "<uuid kệ A05.03>",
  "notes": "A01.01",
  "sourceLocation": { "id": "<uuid kệ phiên>", "code": "A01.01", "name": "A01.01" },
  "sourceShelf": { "id": "<uuid kệ A05.03>", "code": "A05.03", "name": "A05.03" }
}
```

`sourceShelf` là `null` khi `sourceLocationId` rỗng hoặc không tra được trong tổ chức.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Kệ hiển thị của dòng kho tạm | server (`sourceShelf`) | Mỗi lần tải dòng |
| Cache sản phẩm cho picker Kho tạm | `fast-stock-transfer-picker.store.ts` | Trang |

## Error taxonomy

| Condition | Where | Behaviour |
| --- | --- | --- |
| `sourceLocationId` trỏ kệ đã xoá hoặc khác tổ chức | `attachLineRelations` | `sourceShelf = null` → POS hiện `notes` |
| Dòng không có `sourceLocationId` | POS | Hiện `notes`; không có thì để trống |
| API cũ chưa có `sourceShelf` (triển khai lệch phiên bản) | POS | Trường vắng ⇒ rơi về `notes` như hành vi hiện tại |

## Observability

Không thêm log hay metric: đây là sửa đường đọc/hiển thị, không có đường ghi mới.

## ADRs

### ADR-01 — POS hiển thị kệ theo `sourceLocationId` qua trường mới `sourceShelf`; không sửa dữ liệu `notes`
**Context:** `notes` là bản chụp chữ bị ghi đè khi Sửa → Lưu; id kệ vẫn đúng theo snapshot (A-01, chờ prod);
`notes` không có chỗ đọc nào khác (A-03). Là ADR-03 của `2026091102-sales-store-filter-and-location-fixes`.
**Decision:** API trả `sourceShelf` theo id; POS ưu tiên `sourceShelf` ở nhãn, cache picker và luồng Sửa.
**Consequences:** Dòng đã hỏng hiển thị đúng ngay, không cần script prod. `notes` thành bản sao phụ và có
thể còn sai trong DB. Nếu A-01 sai (id cũng sai) thì ADR này phải viết lại.
**Status:** accepted — Akenzy, 11/09/2026
