---
feature: stock-card-description
adr_count: 1
---

# Logical design — Diễn giải đúng trong Chi tiết tồn kho

## Approach

Thêm một hàm `descriptionSql(alias)` vào `stock-ledger-reference.constants.ts`,
sinh cùng dạng `CASE reference_type WHEN ... THEN (SELECT ... FROM <table> d
WHERE d.id = <alias>.reference_id) ... ELSE NULL END` như `documentNumberSql()`
đã có, nhưng map sang cột Diễn giải của từng bảng nguồn thay vì `document_number`.
Với `STOCK_TAKE`, cột là `COALESCE(d.purpose, d.conclusion, d.notes)` — 3 cột
fallback trong cùng bảng, không phải join thêm bảng nào.

`StockSummaryDetailService.getLedgerCard` được sửa ở 2 chỗ, đối xứng với cách
`document_number` đã được xử lý:

1. **Hiển thị** (`pageSql`, dòng ~458-461): thay `f.notes` bằng cột diễn giải đã
   resolve. Vì trang kết quả chỉ có `pageSize` dòng, tính bằng join
   `(${descriptionSql("src")}) AS description` ở bước cuối — rẻ, không quét toàn
   kỳ.
2. **Lọc** (`conditions`, dòng ~380): khi `dto.description` có giá trị, thay
   điều kiện `COALESCE(m.notes, '')` bằng điều kiện trên cột diễn giải đã
   resolve. Vì WHERE cần áp dụng trước khi phân trang, cột này phải được tính
   trong `movements` CTE (quét toàn kỳ) — chỉ khi có filter, giống hệt cách
   `document_number` chỉ được đưa vào `movements` CTE khi `filtersDocumentNumber`
   là true.

`stock_ledger_entries.notes` giữ nguyên giá trị máy sinh — không đổi service nào
ghi vào nó (`goods-receipt.service.ts`, `goods-issue.service.ts`,
`adjustment.service.ts`, ...). Chỉ đường đọc của thẻ kho đổi.

## Alternatives rejected

| Option | Why not |
| ------ | ------- |
| Đổi `notes: \`Phiếu nhập kho ${documentNumber}\`` thành `notes: receipt.description` ngay tại nơi ghi sổ (`goods-receipt.service.ts` v.v.) | `stock_ledger_entries.notes` còn được đọc bởi `csv-export.service.ts` (export CSV kỹ thuật) — đổi giá trị lưu trữ sẽ đổi luôn output của export đó, ngoài phạm vi yêu cầu. Đổi tại nguồn cũng không backfill được dữ liệu lịch sử đã ghi (hàng nghìn dòng cũ vẫn mang chuỗi máy sinh), trong khi đổi tại điểm đọc (join theo `reference_id`) tự động đúng cho cả dữ liệu cũ lẫn mới. |
| Join tất cả 13 bảng nguồn bằng `LEFT JOIN` thay vì `CASE ... (SELECT ...)` | Một dòng chỉ khớp đúng 1 trong 13 bảng theo `reference_type`; `LEFT JOIN` cả 13 bảng buộc Postgres xét cả 13 điều kiện join cho mỗi dòng thay vì 1 index probe duy nhất. `documentNumberSql()` đã chọn `CASE + correlated subquery` với đúng lý do này (xem comment tại chỗ) — giữ nhất quán, tránh hai cách giải cho cùng một vấn đề trong cùng file. |
| Luôn tính `descriptionSql` trong `movements` CTE (không phân biệt có filter hay không) | Với thẻ kho có kỳ dài (hàng trăm-nghìn dòng), tính resolve description cho MỌI dòng trong kỳ dù chỉ hiển thị 1 trang là lãng phí — đúng đánh đổi mà `documentNumberSql` đã tránh bằng cờ `filtersDocumentNumber`. Giữ đối xứng: chỉ trả giá quét toàn kỳ khi thực sự cần lọc. |

## Domain model

Không có entity/model mới. `StockLedgerCardRow` (FE type, `stock-summary.ts:206-217`)
giữ nguyên field `description: string | null` — chỉ nguồn giá trị đổi, không đổi shape.

## Contracts

### POST /v2/inventory/stock/summary/ledger-card
Response 200 — không đổi shape, chỉ đổi giá trị field `data[].description`:
```json
{ "data": [{ "id": "...", "documentType": "GOODS_RECEIPT", "documentNumber": "NK000240", "description": "Nhập kho Biên Hòa 2", "...": "..." }] }
```
Trước đây `description` = `"Phiếu nhập kho NK000240"`; nay = Diễn giải thật của
`goods_receipts` (hoặc `null` nếu rỗng/không có cột nguồn).

## State ownership

Không có state client-side mới — dữ liệu chỉ đi qua TanStack Query như hiện tại (`queryKey: ["stock-ledger-card", body]`).

## Error taxonomy

| Condition | Failure subtype | UI |
| --------- | ---------------- | -- |
| `reference_type` không có trong `REFERENCE_DESCRIPTION_TABLES` (ví dụ `INITIAL_STOCK`, `IMPORT_ADJUSTMENT`) | Rơi vào nhánh `ELSE NULL` của CASE | Ô Diễn giải trống — nhất quán với AC-03, không phải lỗi |
| Chứng từ nguồn đã bị xoá mềm (`deleted_at` không null) nhưng `reference_id` vẫn còn hợp lệ | Subquery vẫn `SELECT ... WHERE d.id = ...` không lọc `deleted_at` (giống hệt `documentNumberSql`, cố tình không lọc vì chứng từ xoá mềm vẫn phải hiện đúng lịch sử) | Diễn giải của chứng từ đã xoá vẫn hiển thị — hành vi giống document_number hiện tại, không phải bug mới |

## Cache & offline

Không áp dụng.

## Observability

Không thêm log/metric mới.

## ADRs

### ADR-01 — Resolve Diễn giải tại điểm đọc bằng CASE + correlated subquery theo reference_id, tái dùng pattern của documentNumberSql

**Context:** `stock_ledger_entries.notes` bị ghi cứng bằng chuỗi máy sinh tại
thời điểm ghi sổ và không mang Diễn giải thật của chứng từ gốc. Chứng từ gốc của
mỗi `reference_type` nằm ở một bảng khác nhau, với tên cột Diễn giải khác nhau
(`description`, `notes`, hoặc COALESCE nhiều cột). File
`stock-ledger-reference.constants.ts` đã giải quyết đúng bài toán tương tự cho
`document_number` bằng `documentNumberSql()`.

**Decision:** Thêm `REFERENCE_DESCRIPTION_TABLES` (map `reference_type` → bảng +
danh sách cột fallback) và `descriptionSql(alias)` sinh cùng dạng CASE +
correlated subquery. `StockSummaryDetailService.getLedgerCard` dùng hàm này ở cả
đường hiển thị (join cuối, cho trang kết quả) và đường lọc (trong `movements`
CTE, chỉ khi có filter) — đối xứng hoàn toàn với cách `document_number` đã được
xử lý trong cùng service.

**Consequences:** Không cần sửa schema, không cần migration, không cần backfill
— dữ liệu lịch sử tự đúng vì fix nằm ở điểm đọc. `stock_ledger_entries.notes`
tiếp tục mang chuỗi máy sinh cho các consumer khác (CSV export kỹ thuật) không
bị ảnh hưởng. Đánh đổi: thêm 1 map cấu hình nữa phải giữ đồng bộ thủ công với
`REFERENCE_DOCUMENT_TABLES` mỗi khi có `reference_type` mới — chấp nhận được vì
cả hai map đã nằm cạnh nhau trong cùng file, dễ nhận ra khi thêm loại chứng từ mới.

**Status:** accepted
