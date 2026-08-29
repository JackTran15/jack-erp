---
feature: warehouse-report-filters-audit
status: done
---

# Intent — Bộ lọc nhóm Báo cáo > Kho hoạt động đúng

## Problem

Người dùng báo "Báo cáo > Kho: bộ lọc chưa hoạt động đúng" và khi được hỏi đã chọn **cả hai**
loại bộ lọc, **cả 8** báo cáo và **cả 4** triệu chứng. Vì vậy điểm khởi đầu là một cuộc rà
soát toàn tuyến (form đầu trang → payload → SQL), không phải một lỗi đơn lẻ.

Trang thật là `/reports/inventory` (`ReportPage` generic, nhóm `REPORT_CATEGORY.INVENTORY`,
8 báo cáo qua `/reports/inventory/*`). Các trang legacy `/reports/storage/*` không nằm trong
sidebar và **ngoài phạm vi**.

Rà soát tìm được 4 lỗi. Ba lỗi đã dựng lại trên stack local (API :4000, org seed, chi nhánh
`c3bf1922…`, kỳ "Tháng này"); bằng chứng ghi ở `evidence/probe-*.txt`.

### D1 — Lọc "Nhóm hàng hóa" bằng nhóm CHA trả về 0 dòng  *(đã dựng lại)*

| Bộ lọc | Số dòng |
|---|---|
| không lọc | 56 |
| nhóm cha "GIÀY DÉP" | **0** |
| nhóm lá "Giày nam" | 49 |
| nhóm lá "Giày nữ" | 3 |
| nhóm lá thứ ba | 1 |

`TreeSelectInput` cho chọn nhóm cha, nhưng cả 7 báo cáo có lọc nhóm đều truyền
`categoryIds: [filters.categoryId]` xuống engine, và mọi engine so bằng
`i.category_id = ANY($n)`. Mặt hàng chỉ gắn vào nhóm **lá** ⇒ nhóm cha không khớp gì.
Không có chỗ nào trong `modules/inventory-reports/` mở rộng cây nhóm; bản mở rộng duy nhất
của repo nằm ở `modules/inventory/ledger/stock-summary.service.ts`, phục vụ trang legacy.

### D2 — Bộ lọc đầu trang không bị dọn khi đổi báo cáo  *(đã dựng lại)*

`brand="Giay MT"` thu hẹp "Tổng hợp nhập xuất tồn kho" từ 56 xuống **1 dòng**, trong khi form
lọc của chính báo cáo đó **không có dòng "Thương hiệu"** — người dùng không có chỗ nào để
nhìn thấy hay xoá nó.

`setReportType` giữ nguyên `s.filters`; `getReportFormLines` chỉ quyết định **render**, còn
`buildInventorySearchFilters` đọc mọi filter line vô điều kiện. Bộ lọc theo cột đã có
`pruneColumnFilters` cho đúng tình huống này; bộ lọc đầu trang thì chưa có gì tương đương.

### D3 — 9 ô lọc cột trả HTTP 400 thay vì lọc  *(đã dựng lại)*

| Báo cáo | Cột 400 |
|---|---|
| `inventory-document-detail` | `branchCode`, `receiverBranchCode` |
| `inventory-stock-quantity-detail` | `inWh`, `inOther`, `outPurchaseReturn`, `outWh`, `outVoid`, `outOther` |
| `inventory-stock-summary-by-store` | `branchCode` |

Catalog BE không đánh `filterKind: 'none'` cho các cột không có `ReportColumnSpec`, nên lưới
vẫn vẽ ô lọc, và `buildReportColumnFilter` từ chối key nó không có spec:
`Cột "X" không hỗ trợ lọc trên báo cáo này`. Gõ vào ô = toast lỗi, không phải lọc.

Mặt tích cực đã đo được: **không cột nào bị lọc âm thầm sai** — probe với vị từ bất khả thi
trên mọi cột lọc được của cả 8 báo cáo đều trả đúng 0 dòng.

### D4 — Cache 45s bỏ qua phạm vi chi nhánh của người gọi  *(mức mã nguồn)*

`searchCacheKey(actor.organizationId, dto)` không đưa `actor.branchIds` vào khoá. Với request
không mang `store` trong payload, `resolveInventoryBranchIds` suy phạm vi từ
`actor.branchIds` — hai người dùng cùng tổ chức nhưng khác chi nhánh được phân công sẽ dùng
chung một ô cache. Chưa dựng lại (cần hai tài khoản), nhưng đọc mã là đủ rõ.

## Success signal

- Chọn nhóm cha "GIÀY DÉP" ở "Tổng hợp nhập xuất tồn kho" trả về 53 dòng (= 49 + 3 + 1, tổng
  của ba nhóm lá có dữ liệu trong kỳ), không phải 0.
- Đặt "Thương hiệu" ở một báo cáo rồi chuyển sang báo cáo không có dòng đó ⇒ số dòng bằng
  đúng lúc không lọc.
- Gõ vào bất kỳ ô lọc cột nào trong 8 báo cáo ⇒ không có toast 400; ô nào không lọc được thì
  không hiện ô nhập.
- `pnpm --filter @erp/api test` xanh, kèm test mới bao 3 lỗi trên.

## Out of scope

- Các trang báo cáo kho legacy `/reports/storage/*` (không có trong sidebar).
- Nhóm Bán hàng / Công nợ / Lợi nhuận. `toEngineFilters`, `buildReportColumnFilter` và
  `searchCacheKey` dùng chung, nên sửa D3/D4 phải giữ nguyên hành vi của các nhóm đó —
  nhưng không đi rà soát bộ lọc của chúng trong feature này.
- Triệu chứng "Danh sách lựa chọn sai" người dùng có chọn: probe
  `/reports/inventory/filter-options` cho thấy scope đúng (5 kho toàn tổ chức, 3 cho chi
  nhánh hiện tại, 2 cho chi nhánh kia). Ghi thành giả định A-01 để hỏi lại, không dựng
  requirement trên một lỗi chưa quan sát được.
- Giữ bộ lọc qua F5 (hiện chỉ `reportType` được ghi vào URL hash). Là thiết kế sẵn có, không
  phải hồi quy.
