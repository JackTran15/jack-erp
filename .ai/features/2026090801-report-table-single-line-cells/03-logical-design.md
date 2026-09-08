---
feature: report-table-single-line-cells
adr_count: 4
---

# Logical design — Ô dữ liệu bảng báo cáo hiện đúng một dòng

## Approach

Ba sửa nhỏ, độc lập. (0) Backend: một bảng chung `REPORT_COLUMN_WIDTHS` trong
`reporting/report-core/report-column-widths.ts` (sku/skuCode 140, itemName 220,
customerName 200, documentNumber 130, date 120… — cùng thang báo cáo kho), được
`enrichHeader` của invoice và profit, và `debtColumn` của debt, đọc theo `col`; cột số không
có trong bảng nên không mang width. (1) Bề rộng FE: `mapHeadersToTableConfig` lấy
`h.width` từ `ReportColumnHeader` khi backend gửi; không có thì
`defaultReportColumnWidth(dataType)` trả 160 cho `text`, 112 cho `number` / `date`. Giá
trị đó đi nguyên đường cũ `tableConfig.width → buildTableColumnsState → columnSizing →
column.getSize()`, nên resize tay và template cột đã lưu không đổi luồng. (2) Một dòng:
`<td>` trong tbody và tfoot nhận thêm `maxWidth: width` inline và class `truncate`
(`overflow-hidden text-ellipsis whitespace-nowrap`) — cùng idiom `BaseDataTable.tsx:628`.
Cột text kèm `title` bằng giá trị hiển thị để hover đọc phần bị cắt; cột số đã format
ngắn nên không gắn title. Header (`SortableHeaderCell`) và `FilterHeaderCell` không đổi.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| `table-layout: fixed` cho cả bảng | Bảng đang `width: max-content; min-width: 100%` để cột co theo nội dung khi bảng ngắn hơn khung; fixed phá cách chia bề rộng đó và đụng sticky pinning |
| Thêm trường `minWidth` / `truncate` vào `ReportColumnTableConfig` | Thêm knob cho một hành vi mặc định — không ai cần tắt truncate theo cột; `width` đã đủ |
| Khai `width` từng cột trong từng `*.report.ts` của 3 nhóm (như báo cáo kho) | 10 file, mỗi file tự chọn số → cùng cột "Tên hàng hóa" dễ lệch giữa các báo cáo; chủ sản phẩm muốn đồng bộ, nên một bảng chung theo `col` ở `report-core` là đủ |
| Khai width backend cho **mọi** cột kể cả cột số | Cột số ngắn, nhiều, đặc thù từng báo cáo; chủ sản phẩm chốt chỉ cột quan trọng thường gặp — cột số để FE fallback 112 |
| Ép tối thiểu 160px cho mọi cột text, bỏ qua backend | Cột ngắn như size / color / unit (backend khai 80–110) bị rộng thừa; mất thông tin backend đã cân |
| `line-clamp-1` (`-webkit-line-clamp`) | Cần `display: -webkit-box` — không áp lên `<td>` được mà không bọc thêm phần tử; `truncate` cho cùng kết quả một dòng |

## Domain model

Không có entity mới. `ReportColumnHeader.width?: number` (shared-interfaces) đã tồn tại
và đã được backend kho điền; FE chỉ bắt đầu đọc nó.

## Contracts

Không đổi API. `GET /reports/*/columns` vẫn trả `ReportColumnHeader[]`; trường `width`
là optional và đã có trong `openapi.snapshot.json` — backend 3 nhóm chỉ bắt đầu điền nó
cho cột định danh. Tác dụng phụ có chủ đích: `report-export.service.ts` đã đọc `width`
để đặt bề rộng cột Excel (px / 7 ký tự), nên file xuất của 3 nhóm cũng có cột định danh
rộng đúng.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Bề rộng cột ban đầu (`tableConfig.width`) | `ReportTableConfigSync` → `report-table-store` | Mỗi lần đổi báo cáo |
| Bề rộng sau khi kéo tay (`columnSizing`) | TanStack table state trong `table-store` | Phiên xem; template cột lưu riêng |

## Error taxonomy

| Condition | Failure subtype | UI |
| --- | --- | --- |
| Backend không gửi `width` (cột số, hoặc cột text ngoài bảng chung) | không phải lỗi — fallback theo `dataType` | Cột text 160px, cột khác 112px |
| Nội dung dài hơn cột | không phải lỗi | Cắt "...", `title` giữ đủ giá trị (cột text) |
| `dataType` không khai | coi là số (đã là quy ước `isReportNumberColumn`) | 112px, không title |
| Người dùng kéo cột hẹp hơn nội dung | không phải lỗi | Cắt "...", dòng vẫn 32px |

## Cache & offline

Không áp dụng — không có dữ liệu mới, chỉ đổi cách render.

## Observability

Không áp dụng. Bằng chứng là screenshot + số đo `getComputedStyle` trong `07-verification.md`.

## ADRs

### ADR-01 — Backend là nguồn sự thật cho bề rộng cột; FE chỉ có fallback theo dataType
**Context:** Backend đã cân bề rộng từng cột cho báo cáo kho (sku 140, name 220, size 80…)
nhưng FE bỏ qua, gán cứng 112 cho mọi cột. Registry FE có width nhưng chỉ chạy khi API
trả 0 cột.
**Decision:** `width: h.width ?? defaultReportColumnWidth(dataType)` với text = 160,
còn lại = 112. Không ép tối thiểu, không đụng registry.
**Consequences:** Báo cáo kho đổi bề rộng ngay theo backend; 3 nhóm còn lại nhận width
cột định danh từ ADR-04 và fallback cho phần còn lại. Muốn tinh chỉnh một cột thì sửa
backend, không sửa FE.
**Status:** accepted

### ADR-02 — Cắt "..." tại `<td>` bằng `maxWidth` inline + `truncate`, không dùng `table-layout: fixed`
**Context:** `truncate` một mình không cắt được vì bảng `max-content` + layout auto cho
cột nở theo nội dung.
**Decision:** `<td>` tbody/tfoot nhận `style={{ width, minWidth: width, maxWidth: width }}`
và class `truncate`; `title` chỉ cho cột text. Header và hàng lọc giữ nguyên.
**Consequences:** Ba giá trị inline cùng nguồn `column.getSize()` nên kéo tay vẫn đúng.
Dòng tfoot trước không set width (bám cột trên) nay có `maxWidth` để "Tổng" không phá
dòng 32px.
**Status:** accepted

### ADR-03 — Header cột không truncate
**Context:** Chủ sản phẩm được hỏi và chọn giữ header xuống dòng.
**Decision:** Không đổi `SortableHeaderCell`; logic sticky đo chiều cao header động vẫn lo
phần lệch.
**Consequences:** Nhãn dài đọc đủ mà không cần hover; header có thể cao 2 dòng ở cột 120px
— chấp nhận.
**Status:** accepted

### ADR-04 — Một bảng width chung theo `col` cho cột định danh của hoá đơn / công nợ / lợi nhuận
**Context:** Chủ sản phẩm muốn backend đặt width "cho đồng bộ", nhưng chỉ cho cột quan
trọng thường gặp. Báo cáo kho khai width từng cột trong từng file; lặp cách đó cho 10 file
nữa thì cùng một cột dễ mỗi nơi một số.
**Decision:** `REPORT_COLUMN_WIDTHS: Record<col, px>` trong `report-core`, chỉ chứa cột
định danh / văn bản (SKU, tên hàng, khách hàng, NCC, chứng từ, ngày, ghi chú…), thang trùng
báo cáo kho. `enrichHeader` (invoice, profit) và `debtColumn` (debt) gán `width` khi `col`
có trong bảng. Không đụng `inventory-report-column.util.ts` — báo cáo kho đã có width riêng.
**Consequences:** Một cột đổi width là một dòng; spec `report-column-widths.spec.ts` khoá
"cùng key cùng width ở ba nhóm" và "cột tiền không có width". Excel export của 3 nhóm đổi
bề rộng cột định danh theo cùng bảng.
**Status:** accepted
