---
feature: promotion-item-discount-import-export
adr_count: 4
---

# Logical design — CTKM Giảm giá hàng hóa: Nhập khẩu / Xuất khẩu + Copy xuống

## Approach

Ba phần độc lập, cùng nằm trên một lưới (`GoodsDiscountGrid.tsx`).

**1. `targetType` theo từng dòng (UOW-01).** `GoodsDiscountRow` thêm trường
`targetType: PromotionTargetType`. Nguồn của trường này:
- ô tra cứu phạm vi *Hàng hóa* (`/inventory/items`) gán `ITEM`;
- picker giữ đúng `draft.targetType` (`ITEM` hoặc `PRODUCT`);
- ô tra cứu phạm vi *Nhóm hàng hóa* gán `CATEGORY`;
- `itemDiscountFromDetail` đọc lại `l.targetType`.

`itemDiscountToDto` lấy theo dòng. Riêng phạm vi *Nhóm hàng hóa* vẫn luôn gửi
`CATEGORY`, để dòng lạc loại không lọt vào. Không đổi API, engine hay schema.

**2. Copy xuống (UOW-02).** Chỉ sửa frontend. Thêm một cột thao tác vào
`LineItemGrid` theo đúng mẫu `BarcodeLabelGrid.tsx:318-337`: icon
`ArrowDownToLine`, `aria-label` *"Sao chép giá trị xuống các dòng dưới"*. Handler
`copyValueDown(rowId)` chép `row.value` sang mọi dòng có index lớn hơn và
`targetId` khác rỗng (A-07). Cột bị bỏ khỏi danh sách khi phương thức là
`FIXED_PRICE`.

**3. Nhập/Xuất khẩu (UOW-03, UOW-04).** Đọc/ghi file làm ở server trong
`modules/promotion`, **không lưu gì**:

```
FE lưới ──POST /v2/promotions/item-discount-lines/export {method, lines[]}──▶ ExportItemDiscountLinesHandler
                                                                         ├─ tra item/product theo org
                                                                         └─ ItemDiscountWorkbook.build() ──▶ .xlsx
FE dialog ─POST /v2/promotions/item-discount-lines/import (multipart file, method)─▶ ImportItemDiscountLinesHandler
                                                                         ├─ ItemDiscountWorkbook.parse() → {rowNumber, code, rawValue}[]
                                                                         ├─ validate (trống, số, khoảng, trùng)
                                                                         ├─ tra mã: items (lower(code)) → products (lower(code))
                                                                         └─ {rows: ImportedLine[], errors: RowError[]}
FE dialog ── hiện lỗi ── "Áp dụng" ──▶ mergeImportedRows(grid, rows) → onChange({goodsDiscountRows})
```

`ItemDiscountWorkbook` (infrastructure) giữ **một** định nghĩa cột, dùng chung
cho cả `build` và `parse`, nên xuất rồi nhập lại (AC-20) không thể lệch cột. Khi
nhập, cột được tìm theo **tên tiêu đề** (A-10). Hàm gộp trên frontend dùng lại
`mergeTargetsIntoGrid`. Nếu dòng đã có thì ghi đè `value` (A-01), còn không thì
thêm dòng trước dòng trống cuối.

## Alternatives rejected

| Alternative | Why rejected |
| --- | --- |
| Dùng lại khung job của inventory (`POST /inventory/imports/{kind}/validate` + `inventory_import_jobs`) | Phải thêm giá trị enum `ImportJobType` (có migration) và kéo `modules/promotion` phụ thuộc vào `inventory/csv`. Phải thêm một lượt GET dòng, và job không bao giờ được "commit", vì nhập khẩu ở đây chỉ nạp vào form. Tốn nhiều hơn lợi ích với ≤2.000 dòng (ADR-01) |
| Đọc/ghi file trên trình duyệt (thêm `xlsx`/`exceljs` vào backoffice-web) | Thêm khoảng 1 MB bundle cho một màn hình. Frontend còn không tự tra được nhiều SKU trong một lượt (chưa có endpoint tra theo lô), nên đằng nào cũng phải thêm endpoint. Repo đã thống nhất làm Excel ở server (ADR-02) |
| Xuất khẩu theo `programId` từ DB | CTKM chưa lưu hoặc đang sửa dở sẽ không xuất được. Người dùng chờ "xuất cái đang thấy" (A-15) |
| Suy `targetType` ở mapper bằng cách tra id lúc lưu | Tốn thêm một lượt gọi API. Nguồn chọn (ô tra cứu / picker) đã biết loại, chỉ là đang bị vứt đi |

## Domain model

Không đổi domain. Thêm kiểu cho dữ liệu trao đổi, đặt trong
`application/dto/item-discount-excel.dto.ts`:

- `ItemDiscountExcelMethod = PERCENT | AMOUNT`, là tập con của `PromotionDiscountMode`. `FIXED_PRICE` bị từ chối ở validation.
- `ExportItemDiscountLinesDto { method; lines: { targetType: ITEM|PRODUCT; targetId: uuid; value?: number }[] }`, `@ArrayMaxSize(2000)`.
- `ImportItemDiscountLinesDto { method }` (trường form multipart).
- `ImportedItemDiscountLine { rowNumber; targetType; targetId; code; name; value }`.
- `ImportItemDiscountRowError { rowNumber; code?; message }`.
- `ImportItemDiscountLinesResult { rows; errors }`.

## Contracts

### POST /v2/promotions/item-discount-lines/export — `promotion.read`
Request JSON `ExportItemDiscountLinesDto`. Response
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` với
`Content-Disposition: attachment; filename="GiamGiaHangHoa.xlsx"`. Các dòng có
`targetId` không thuộc tổ chức bị bỏ qua, không báo lỗi, không lộ gì (AC-12).
Thứ tự dòng giữ nguyên theo request.

### POST /v2/promotions/item-discount-lines/import — `promotion.write`
`multipart/form-data`: `file` (.xlsx, tối đa 5 MB) và `method`. Response 200
`ImportItemDiscountLinesResult`. Response 400 khi lỗi mức file (xem bảng lỗi).
Không ghi DB. Idempotency interceptor bỏ qua được vì không có tác dụng phụ.

## State ownership

| State | Owner |
| --- | --- |
| Dòng lưới, phương thức, phạm vi | `ProgramFormPage` `useState<ProgramFormState>` (không đổi) |
| File đang chọn, kết quả nhập đang xem | State cục bộ của `ItemDiscountImportDialog` |
| Mã / tên / ĐVT / giá bán trong file xuất | DB. Server đọc lại, không tin dữ liệu client gửi lên |

## Error taxonomy

| Case | Where | Response |
| --- | --- | --- |
| Không phải .xlsx / đọc không được | parse | 400 *"File không đúng định dạng .xlsx"* |
| Thiếu cột `Mã SKU` | parse | 400 *"File thiếu cột 'Mã SKU'"* |
| Cột giá trị không khớp phương thức | parse | 400 *"File có cột 'Số tiền giảm' nhưng chương trình đang giảm theo %"* (và chiều ngược lại) |
| > 2.000 dòng dữ liệu | parse | 400 *"File vượt quá 2.000 dòng"* |
| Mã trống nhưng có giá trị | dòng | lỗi *"Thiếu mã SKU"* |
| Dòng trống hoàn toàn | dòng | bỏ qua, không báo |
| Mã không có trong tổ chức | dòng | *"Không tìm thấy hàng hóa có mã '{code}'"* |
| Giá trị trống / không phải số / ngoài khoảng | dòng | *"% giảm giá phải lớn hơn 0 và không quá 100"* / *"Số tiền giảm phải lớn hơn 0"* |
| Trùng mã trong file | dòng | cả hai dòng: *"Mã SKU bị trùng trong file (dòng x, y)"* |
| `method = FIXED_PRICE` | DTO | 400 từ ValidationPipe |
| Mạng / 5xx khi nhập hoặc xuất (FE) | dialog / nút | toast *"Nhập khẩu thất bại"* / *"Xuất khẩu thất bại"*, lưới không đổi |

## Cache & offline

Không có. Hai endpoint không có trạng thái, và frontend không đưa kết quả vào
TanStack Query cache vì kết quả dùng một lần rồi đổ vào state của form.

## Observability

Không thêm metric. Lỗi 400 mức file đã được log qua exception filter có sẵn.
Lỗi mức dòng là dữ liệu nghiệp vụ, không phải lỗi hệ thống, nên không log.

## ADRs

### ADR-01 — Nhập khẩu đồng bộ, không lưu job
- **Status:** accepted
- **Context:** Khung job của inventory có sẵn nhưng được thiết kế cho nhập có "commit" (ghi DB theo lô). Ở đây nhập khẩu chỉ nạp vào state form.
- **Decision:** Một request multipart trả thẳng `{rows, errors}`. Giới hạn 2.000 dòng / 5 MB.
- **Consequences:** Không có migration, không phụ thuộc chéo module. File lớn hơn giới hạn bị từ chối. Nếu sau này cần nhiều hơn thì đó là feature riêng.

### ADR-02 — Đọc/ghi Excel ở server, trong `modules/promotion`
- **Status:** accepted
- **Context:** `exceljs` chỉ có ở `apps/api`. Mọi màn nhập/xuất hiện có đều làm ở server.
- **Decision:** `infrastructure/excel/item-discount-workbook.ts` giữ định nghĩa cột và hai hàm `build`/`parse`. Handler CQRS nằm ở `application/queries/`, và theo mẫu `GetPromotionHandler` thì inject thẳng `Repository<ItemEntity>` / `Repository<ProductEntity>`.
- **Consequences:** Bundle frontend không đổi. Frontend chỉ upload/download blob.

### ADR-03 — `targetType` là dữ liệu của từng dòng, không suy ra từ phạm vi
- **Status:** accepted
- **Context:** Mapper suy `PRODUCT` từ phạm vi *Hàng hóa*, trong khi lưới trộn cả item lẫn mẫu mã (A-05).
- **Decision:** `GoodsDiscountRow.targetType` được gán tại nơi chọn. Mapper gửi đúng giá trị đó. Phạm vi *Nhóm hàng hóa* vẫn ép `CATEGORY`.
- **Consequences:** Không sửa CTKM cũ (A-06): chúng vẫn không áp dụng, và mở lại thì dòng mất mã/tên. Mọi dòng mới, dù chọn tay hay nhập khẩu, đều đúng.

### ADR-04 — Một định nghĩa cột cho cả xuất và nhập; tìm cột theo tiêu đề khi nhập
- **Status:** accepted
- **Context:** AC-20 (round-trip) và người dùng hay sửa file Excel (thêm, xoá, đổi thứ tự cột).
- **Decision:** Mảng `ITEM_DISCOUNT_COLUMNS` duy nhất. `parse` tìm chỉ số cột bằng tiêu đề đã chuẩn hoá (bỏ `*`, bỏ khoảng trắng, không phân biệt hoa thường) và chỉ đọc `Mã SKU` + cột giá trị.
- **Consequences:** File MISA có cùng tiêu đề sẽ nhập được. File có tiêu đề khác bị từ chối với thông báo nêu rõ tên cột.
