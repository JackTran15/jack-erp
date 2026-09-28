---
feature: promotion-item-discount-columns-sheets
adr_count: 3
---

# Logical design — CTKM Giảm giá hàng hóa: cột ĐVT/Giá bán/Giá KM, Đồng giá, file Excel 3 sheet

## Approach

Ba phần. Không đổi endpoint, route, domain hay schema.

**1. Lưới (UOW-01, frontend).**
- `toPromotionTargets` bỏ việc ghép `variantLabel` vào `name` (A-02). Mọi lưới CTKM dùng hàm này nên đều được sửa.
- `GoodsDiscountRow` thêm `unit: string` và `sellingPrice: number | null`. Nguồn:
  ô tra cứu (`ItemOption` + `sellingPrice`, A-13); picker (`draft.unit`, `draft.sellingPrice`, riêng `PRODUCT` thì `null`); `itemDiscountFromDetail` (`l.unit`, `l.sellingPrice`); nhập khẩu (A-14).
- Cột theo `LineColumn` như hiện có: `unit` và `sellingPrice` là `readonly`, `promoPrice` là `readonly` và render bằng `promoPrice()` có sẵn (`promotion-target.ts:131`), nên FE làm tròn khớp domain. Ba cột chỉ có khi phạm vi *Hàng hóa*. Cột giá trị và copy xuống bị bỏ khi `FIXED_PRICE` (AC-09).
- `mapper` không gửi `unit` / `sellingPrice` lên server. Chúng chỉ để hiển thị, server tự đọc lại giá khi tính KM.

**2. Workbook 3 sheet (UOW-02, backend).** `item-discount-workbook.ts` đổi từ một danh sách cột sang **một danh sách sheet**:

```
ITEM_DISCOUNT_SHEETS = [
  { method: PERCENT,     name: 'Giảm giá theo %',       valueHeader: '% giảm giá' },
  { method: AMOUNT,      name: 'Giảm giá theo số tiền', valueHeader: 'Số tiền giảm' },
  { method: FIXED_PRICE, name: 'Đồng giá',              valueHeader: null },
]
cột mỗi sheet = ['Mã SKU*', 'Tên hàng hóa', valueHeader?]
```

- `build(method, lines)` tạo đủ 3 sheet theo thứ tự trên; chỉ sheet có `method` trùng mới được ghi dòng (A-07).
- `parse(buffer, method)` chọn sheet:
  1. sheet có tên (trim, không phân biệt hoa thường) trùng `name` của phương thức → đọc;
  2. không có, và workbook chỉ có **một** sheet → đọc sheet đó (mẫu cũ, A-05);
  3. còn lại → 400 *"File không có sheet '{name}'"* (A-08).
  Trong sheet đã chọn, tìm cột theo tiêu đề như cũ (ADR-04 cũ). Với `FIXED_PRICE` chỉ cần cột `Mã SKU`; cột giá trị nếu có thì bỏ qua (A-10). Với `PERCENT`/`AMOUNT`, lỗi "cột không khớp phương thức" vẫn giữ.
- DTO: `ITEM_DISCOUNT_EXCEL_METHODS` thêm `FIXED_PRICE`. `ExportItemDiscountLineDto.value` vẫn optional. `ImportedItemDiscountLine.value` thành optional (không có khi `FIXED_PRICE`) và thêm `unit?`, `sellingPrice?`.
- Import handler: với `FIXED_PRICE` bỏ bước kiểm tra giá trị, dòng mã trống bị bỏ qua (A-09). Truy vấn items thêm `unit`, `sellingPrice` vào `select`.

**3. Nhập/Xuất ở Đồng giá + file mẫu (UOW-03, frontend).**
- `excelEnabled = !isGroup`; `excelMethod` ánh xạ đủ 3 phương thức.
- `ItemDiscountImportDialog` thêm link **Tải file mẫu**, gọi `downloadItemDiscountExcel(method, [])`.
- `applyImported`: dòng mới nhận `unit`/`sellingPrice` từ kết quả; dòng đã có chỉ ghi đè `value` khi kết quả có `value` (Đồng giá thì giữ nguyên).

```
FE lưới ──export {method: PERCENT|AMOUNT|FIXED_PRICE, lines[]}──▶ build() ─▶ .xlsx [S%, S$, SĐG]
FE dialog ─"Tải file mẫu"─ export {method, lines: []} ────────────▶ build() ─▶ 3 sheet chỉ tiêu đề
FE dialog ─import (file, method)─▶ parse(): chọn sheet theo method ─▶ validate ─▶ tra mã (+unit, sellingPrice)
```

## Alternatives rejected

| Alternative | Why rejected |
| --- | --- |
| Endpoint riêng `GET .../item-discount-lines/template` | `export` với `lines: []` đã ra đúng file mẫu (AC-11 cũ). Thêm endpoint là thêm một hợp đồng phải giữ đồng bộ với `build` |
| Mỗi lần xuất chỉ ra một sheet của phương thức đang chọn | File mẫu và file dữ liệu khác bố cục; trái với "1 file chung, 3 sheets" trong yêu cầu (A-07) |
| Nhập khẩu tự chuyển phương thức theo sheet có dữ liệu | Đổi phương thức làm mọi dòng đang có đổi nghĩa; cùng lý do A-11 cũ |
| Server trả ĐVT/giá cho lưới qua một endpoint tra theo lô | Mọi nguồn dòng (ô tra cứu, picker, chi tiết, nhập khẩu) đã có sẵn hoặc lấy thêm được trong truy vấn hiện có (A-13, A-14) |
| Suy ĐVT/giá cho dòng `PRODUCT` từ SKU con | Akenzy chọn để trống (A-04) |

## Domain model

Không đổi domain. `promoPrice()` phía FE giữ quy tắc làm tròn khớp `roundVnd` như trước.

## Contracts

### POST /v2/promotions/item-discount-lines/export — `promotion.read`
Không đổi đường dẫn và quyền. `method` nhận thêm `FIXED_PRICE`. Response vẫn là
`.xlsx` tên `GiamGiaHangHoa.xlsx`, nay có 3 sheet, mỗi sheet 2–3 cột (AC-12).

### POST /v2/promotions/item-discount-lines/import — `promotion.write`
Không đổi đường dẫn và quyền. `method` nhận thêm `FIXED_PRICE`. Dòng kết quả thêm
`unit?`, `sellingPrice?`; `value` thành optional. Đây là thay đổi **mở rộng**, client
cũ không vỡ. Sinh lại `openapi.snapshot.json` + `schema.ts`.

## State ownership

| State | Owner |
| --- | --- |
| Dòng lưới, kể cả `unit` / `sellingPrice` | `ProgramFormPage` `useState<ProgramFormState>` |
| Giá khuyến mại | Tính khi render từ `sellingPrice`, phương thức, `value` / `goodsFixedPrice`. Không lưu |
| File đang chọn, kết quả nhập | State cục bộ của `ItemDiscountImportDialog` |

## Error taxonomy

Giữ nguyên bảng lỗi của feature `2026092701`, thêm/đổi:

| Case | Where | Response |
| --- | --- | --- |
| File nhiều sheet, không có sheet của phương thức | parse | 400 *"File không có sheet '{tên sheet}'"* |
| `FIXED_PRICE`, dòng mã trống | dòng | bỏ qua, không báo |
| `FIXED_PRICE`, file 1 sheet có cột giá trị | parse | bỏ qua cột, không báo |
| Tải file mẫu thất bại (FE) | dialog | toast *"Tải file mẫu thất bại"* |

## Cache & offline

Không có.

## Observability

Không thêm.

## ADRs

### ADR-01 — Một danh sách sheet là nguồn duy nhất cho build và parse
- **Status:** accepted
- **Context:** Trước đây `ITEM_DISCOUNT_COLUMNS` là nguồn duy nhất (ADR-04 cũ). Nay bố cục phụ thuộc phương thức, và round-trip phải đúng cho cả 3 (AC-19).
- **Decision:** `ITEM_DISCOUNT_SHEETS` giữ tên sheet và tiêu đề cột giá trị cho từng phương thức. `build` và `parse` cùng đọc mảng này.
- **Consequences:** Đổi tên sheet chỉ sửa một chỗ. File MISA thật có tên sheet khác thì không khớp (A-06); khi đó sửa mảng này.

### ADR-02 — Chọn sheet theo tên, rơi về sheet duy nhất
- **Status:** accepted
- **Context:** File 1 sheet cũ phải nhập được (A-05), nhưng file 3 sheet thì không được đoán sheet (A-08).
- **Decision:** Tên khớp → dùng; không khớp và chỉ có 1 sheet → dùng sheet đó; còn lại → 400.
- **Consequences:** Người dùng đổi tên sheet trong file 3 sheet sẽ nhận 400 kèm tên sheet cần có.

### ADR-03 — ĐVT / Giá bán nằm trên dòng lưới, Giá KM tính khi render
- **Status:** accepted
- **Context:** Lưới cần hiện ba cột. Server đã trả `unit`/`sellingPrice` cho dòng `ITEM` ở chi tiết CTKM.
- **Decision:** `GoodsDiscountRow` mang `unit`, `sellingPrice` từ nơi chọn dòng. Giá KM không lưu, luôn tính bằng `promoPrice()`.
- **Consequences:** Giá bán trên lưới là giá lúc chọn dòng hoặc lúc mở form. Giá danh mục đổi trong lúc đang sửa form thì lưới không tự cập nhật; mở lại form là đúng. Server vẫn tự đọc giá khi tính KM, nên không có rủi ro sai tiền.
