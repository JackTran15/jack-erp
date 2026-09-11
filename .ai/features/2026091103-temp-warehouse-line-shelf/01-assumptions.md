---
feature: temp-warehouse-line-shelf
blocking_open: 0         # count of blocking + pending; must be 0 to pass G1
---

# Assumption register

Id đánh lại khi tách từ `2026091102-sales-store-filter-and-location-fixes` ngày 11/09/2026:
A-05 cũ thành A-01, A-06 cũ thành A-02, A-07 cũ thành A-03, A-08 cũ thành A-04, A-13 cũ thành A-05.

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Trên prod, các dòng Kho tạm hiện A01.01 (vd MY1901-D-37 ngày 10/09) có `source_location_id` = kệ thật (A05.03), chỉ `notes` = "A01.01" — đúng cơ chế Sửa → Lưu | high | yes | Nếu `source_location_id` cũng là A01.01 thì phiếu chuyển xuất sai kệ; UOW-01 phải sửa cả đường quét và thêm bước sửa dữ liệu prod | confirmed | Akenzy chốt ngày 11/09/2026 dựa trên bằng chứng DB local (mục bên dưới): 24/24 dòng lệch `notes` sinh ra từ Sửa → Lưu, id kệ giữ nguyên qua `updateLine`, 0 dòng có kệ nguồn là kệ mặc định. Dòng prod 10/09 chưa xem trực tiếp |
| A-02 | Cột Vị trí trên POS hiện **kệ đã quét của dòng** (`source_location_id` — kệ phiếu chuyển thật sự xuất), không phải kệ ưu tiên hiện tại tính lại mỗi lần tải như báo cáo | medium | yes | UOW-01 đổi sang tính kệ lúc đọc và chấp nhận POS có thể lệch kệ của phiếu chuyển | confirmed | Akenzy chọn "Scanned shelf" ngày 11/09/2026 |
| A-03 | `temp_warehouse_lines.notes` không có chỗ đọc nào khác ngoài nhãn Vị trí trên POS, nên dòng đã ghi sai không cần sửa dữ liệu khi hiển thị theo id | high | no | Màn khác vẫn hiện A01.01; cần script sửa `notes` | confirmed | Akenzy chốt khi đóng plan ngày 11/09/2026. Bằng chứng: backend chỉ ghi hoặc chép `notes` (xem Problem của intent); demo POS: MY66626-K-36 có `notes` A01.01 vẫn hiện kệ H14.03 mà không sửa dữ liệu |
| A-04 | Endpoint danh sách dòng kho tạm không khai báo response DTO cho OpenAPI (`temp-warehouse.controller.ts:118-122` trả thẳng kết quả service), nên thêm field không cần `pnpm openapi:generate` | medium | no | Thêm bước regenerate và commit `openapi.snapshot.json` + `schema.ts` | confirmed | Akenzy chốt khi đóng plan ngày 11/09/2026. T-01-01 đã kiểm: schema `TempWarehouseLineEntity` trong `packages/api-client/src/generated/schema.ts` chỉ có cột của entity, không có các quan hệ service gắn thêm; không cần `pnpm openapi:generate` |
| A-05 | Test hàm thuần của pos-web chạy bằng `rtk proxy npx --yes vitest run <file>` là bằng chứng hợp lệ — trái tiền đề ADR-05 của `2026091003-default-issuing-warehouse`; chạy thật ngày 11/09: lib `fast-stock-transfer` 14/14 | high | no | Bỏ `tests:` của T-01-02, T-01-03 và nghiệm thu bằng demo | confirmed | Akenzy xác nhận ngày 11/09/2026 ("Unit tests via npx") |

## Cách giải A-01

Người có quyền đọc DB prod chạy truy vấn **chỉ đọc**:

```sql
SELECT l.created_at, l.status, l.notes,
       sl.code AS line_shelf, st.name AS line_storage,
       wl.code AS session_shelf
FROM temp_warehouse_lines l
JOIN items i ON i.id = l.item_id
JOIN temp_warehouse_sessions s ON s.id = l.session_id
LEFT JOIN locations sl ON sl.id = l.source_location_id
LEFT JOIN storages st ON st.id = sl.storage_id
LEFT JOIN locations wl ON wl.id = s.warehouse_location_id
WHERE i.code = 'MY1901-D-37' AND l.created_at >= '2026-09-09'
ORDER BY l.created_at DESC;
```

- `line_shelf` = A05.03 và `notes` = A01.01 ⇒ A-01 đúng. Ghi người chạy, ngày và kết quả vào cột Resolution,
  đổi Status thành `confirmed`.
- `line_shelf` = A01.01 ⇒ A-01 sai: phiếu chuyển đang xuất sai kệ. Mở lại G2 để thêm sửa đường quét và sửa dữ
  liệu trước khi làm.
- `line_storage` khác "Kho 211DN" ⇒ dòng được quét khi đang chọn kho khác; ghi nhận, thiết kế giữ nguyên.

## Bằng chứng từ DB local (2026-09-11, Akenzy nhờ tự kiểm)

Không vào được prod. Dòng kho tạm mới nhất ở `erp_dev_3008` và `erp_dev` đều là ngày 06/09, nên không có dòng 10/09
của MY1901-D-37. Kết quả trên 9.746 dòng "Xuất đi" của tổ chức MT:

| Kiểm tra | Kết quả |
| --- | --- |
| Kệ nguồn là kệ `is_default` hoặc "Chưa xếp" | 0 dòng |
| Kệ nguồn đang ngừng theo dõi | 21 dòng. Tất cả là kệ liên kết của mặt hàng, bị ngừng theo dõi **sau** khi quét (`getPreferredShelf` bỏ qua kệ liên kết đã ngừng lúc quét) |
| `notes` lệch với kệ nguồn | 24 dòng. Cả 24 có `notes` = kệ của phiên, còn `source_location_id` = một kệ thật khác |
| 24 dòng đó sinh ra từ Sửa → Lưu | 24/24 có dòng trước trỏ `superseded_by_id` vào chúng; `notes` của dòng trước là kệ đúng (vd H40.03, E31.03, T24.05, G35.04) |
| Phân bố | Biên Hoà 8, Mậu Thân 4, Cà Mau 4, Buôn Ma Thuật 3, Nha Trang 2, Chi nhánh cũ 2, MT211 1 |

Kệ của phiên là kệ `is_default` của kho, không có thì kệ đang hoạt động tạo sớm nhất: A01.01 ở Kho 211DN, "999" ở
nhiều kho khác. `updateLine` (`temp-warehouse.service.ts:409-507`) tạo dòng mới và chép `sourceLocationId` từ dòng cũ,
nên id kệ giữ nguyên qua mỗi lần sửa.

Lúc thêm dòng, code không lấy kệ đã ngừng theo dõi hay kệ mặc định của showroom. `applyPreferredShelf` gọi
`getPreferredShelf` (`inventory-location-stock.service.ts:709-778`): bỏ kệ liên kết đã ngừng, rơi về dòng tồn đang theo
dõi của đúng kho (`findAccessibleShelf` `:1127-1150`), cuối cùng là kệ `is_default` của kho. `defaultLocationId` của
catalog (`pos-catalog.service.ts:347`) không được dùng khi thêm dòng. Catalog POS mặc định loại dòng tồn đã ngừng theo
dõi (`sb.is_tracked = true`), nên luồng Sửa càng dễ không khớp kệ thật và lấy tên kệ của phiên.

**Đề xuất:** A-01 đúng về cơ chế, độ tin cậy cao. Id kệ của dòng đúng; chỉ chữ `notes` bị ghi đè bằng kệ của phiên khi
Sửa → Lưu. Chưa thấy trực tiếp dòng prod ngày 10/09; chốt A-01 là quyết định của Akenzy.
