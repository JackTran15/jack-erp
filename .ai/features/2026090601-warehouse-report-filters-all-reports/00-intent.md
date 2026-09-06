---
feature: warehouse-report-filters-all-reports
status: draft
---

# Intent — Bộ lọc Báo cáo > Kho đúng trên **mọi** báo cáo và **mọi** hạt "Thống kê theo"

## Problem

Người dùng báo lại (2026-09-06): *"Báo cáo > Kho: bộ lọc chưa hoạt động đúng — Thống kê theo,
Nhóm hàng hoá. Check all các báo cáo kho từng step by step."*

Đây là lần báo **thứ hai** cho cùng một màn hình, và lý do có lần thứ hai không phải vì bản sửa
sai — mà vì nó chưa bao giờ tới `main`.

### Phần A — công việc đã xong nhưng chưa merge

Feature `.ai/features/2026082801-warehouse-report-filters-audit` đóng G5 ngày 2026-08-29,
12/12 ticket done, sửa đủ D1–D5. Toàn bộ nằm ở commit `1cb20a60` trên nhánh **local
`filter-report-warehouse`**, chưa merge, chưa push. `main` hôm nay vẫn nguyên lỗi — đã dựng lại
trực tiếp trên stack đang chạy, không suy từ lịch sử (`evidence/probe-2026-09-06.md`):

- **D1** — `inventory-stock-summary`, kỳ 2026: không lọc **9593** dòng; nhóm cha "GIÀY DÉP"
  **0**; nhóm ông "PHỤ KIỆN" **0**; nhóm lá "Giày nam" 2205. Cả 7 báo cáo có lọc nhóm vẫn
  `categoryIds: filters.categoryId ? [id] : undefined`, mọi engine so `i.category_id = ANY($n)`;
  `grep -rn "parent_group_id\|RECURSIVE" modules/inventory-reports/` = 0 hit.
- **D2** — `report.store.ts:23-30` `setReportType` vẫn truyền thẳng `s.filters`, không prune.
- **D3/D4/D5** — `UNFILLED_BY_GRAIN`, `partitionPivotFilters`, `ALWAYS_KEPT_FILTER_LINES`,
  `resolveDescendantCategoryIds`: 0 file trên `main`.

Cherry-pick thử `1cb20a60` lên `main` cho **3 conflict, đều máy móc**: `.ai/aidlc.yaml` (vặt),
và ở `stock-by-store-pivot.report.ts` + spec chỉ là khối `import` và chữ ký constructor —
`#240` (b75fd7cf) đã đổi báo cáo đó sang `resolveOrgWideBranchIds` sau đó. 29 file add +
22 file modify còn lại merge sạch. Không có xung đột thiết kế.

### Phần B — lỗi MỚI, chưa từng nằm trong đợt rà soát tháng 8

Đợt tháng 8 rà soát 8 báo cáo trong dropdown. Từ đó `#248` thêm 3 loại báo cáo drill-down, và
đo lại toàn tuyến lộ ra bốn lỗi mà bản sửa cũ **không** chạm tới:

**N1 — "Thống kê theo" ≠ Hàng hóa cộng ĐVT/Thương hiệu ⇒ HTTP 400.** Đây đúng là triệu chứng
người dùng gọi tên. Ở "Tổng hợp nhập xuất tồn kho", đặt "Đơn vị tính" = Đôi rồi đổi
"Thống kê theo" sang Mẫu mã hoặc Nhóm hàng hóa ⇒ `400 Cột "unit" không hỗ trợ lọc trên báo cáo
này`. Cả hai đều là dòng lọc **chính thức** của chính báo cáo đó. Lặp trên **10/10** tổ hợp
(parent, group) × 5 báo cáo khai "Thống kê theo".

Gốc rễ: ở hạt gộp, cột `unit`/`brand` **rời khỏi catalog** (chúng luôn NULL — không có một giá
trị duy nhất cho cả nhóm), nên `periodColumnSpecs` không cấp spec (`withText = isItemLevel`,
`stock-period.service.ts:515`). Nhưng dòng lọc đầu trang **vẫn hiện**, và lớp report vẫn gấp
`filters.unit`/`filters.brand` vào `columnFilters` **vô điều kiện**
(`stock-summary.report.ts:308-311` và 4 chỗ tương tự) ⇒ gate spec
(`report-column-filter.util.ts:80-84`) từ chối. Bản sửa tháng 8 (ADR-07) chỉ xử lý ô lọc **trên
lưới**; đường gấp từ **thanh lọc đầu trang** không nằm trong đó — đã đọc `1cb20a60` để chắc:
hạt gộp chỉ được thêm spec `sku`/`itemName`/`categoryName`, `unit`/`brand` vẫn không có.

**N2 — "Số lượng tồn kho theo cửa hàng" bỏ qua hoàn toàn Kỳ báo cáo.** Form khai
`report_period` + `range_date`, báo cáo không đọc `period`/`preset` ở bất kỳ đâu. Cả năm 2026,
đúng một ngày, cả năm 2020 (không có dữ liệu), `preset=today`, và không gửi kỳ — **đều 9639
dòng**. Bộ lọc hiện ra và không làm gì.

**N3 — 3 báo cáo transfer-detail nhận `columnFilters` rồi âm thầm vứt đi.**
`assertKnownColumns` xác thực xong, nhưng `TransferDetailService.detail()` /
`summarizeByCounterpart()` không hề nhận tham số đó ⇒ **200 + dữ liệu chưa lọc**. Sai âm thầm,
tệ hơn 400.

**N4 (đo được, chưa có triệu chứng người dùng)** — `transfer-report.service.ts` ở hạt
parent/group: `countSql` (`:860-869`) thiếu cả `joinLookup` lẫn `JOIN branches b` mà câu truy
vấn trang (`:845-859`) có. `JOIN` đó loại dòng, nên `total` và 4 số chân trang có thể lớn hơn
tập thật ⇒ chân trang mô tả tập khác lưới, phân trang hiện trang ma.

## Success signal

- Chọn nhóm cha "GIÀY DÉP" ở "Tổng hợp nhập xuất tồn kho" (kỳ 2026, chi nhánh HCM) trả về đúng
  tổng của các nhóm lá bên dưới, không phải 0 — và không dòng nào nằm ngoài cây đó.
- "Đơn vị tính" = Đôi × "Thống kê theo" ∈ {Hàng hóa, Mẫu mã, Nhóm hàng hóa}: **0/3 trả 400**.
  Mở rộng: 10/10 tổ hợp hạt-gộp × 5 báo cáo không còn 400 nào.
- "Số lượng tồn kho theo cửa hàng": hoặc kỳ báo cáo đổi được số dòng, hoặc hai dòng lọc kỳ
  không còn hiện trên form. Không còn trạng thái "hiện mà không làm gì".
- Mọi ô lọc và mọi dòng lọc trên **cả 11** loại báo cáo kho, ở **cả 3** hạt: hoặc lọc thật,
  hoặc không hiện. Không có 400, và không có bộ lọc được nhận rồi bỏ qua.
- `pnpm --filter @erp/api test` xanh, kèm test mới bao N1–N4.

## Out of scope

- Nhóm báo cáo Bán hàng / Công nợ / Lợi nhuận. `toEngineFilters`, `buildReportColumnFilter`,
  `searchCacheKey` và `report.store.ts` dùng chung, nên sửa phải **giữ nguyên** hành vi của các
  nhóm đó — nhưng không đi rà soát bộ lọc của chúng ở feature này.
- Trang legacy `/reports/storage/*` — `#240` đã gỡ khỏi mã nguồn.
- `stock-quantity-detail` chạy ở hạt `item_location` nhưng catalog không có cột vị trí ⇒ một
  mặt hàng nằm N kệ cho N dòng trông giống hệt nhau. Là lỗi **hiển thị**, không phải lọc; ghi
  nhận để mở ticket riêng.
- Giữ bộ lọc qua F5 (chỉ `reportType` vào URL hash) — thiết kế sẵn có, không phải hồi quy.
- **Bộ lọc rò vào dialog drill-down — ĐÃ KIỂM, KHÔNG PHẢI LỖI.** Nghi vấn ban đầu là 3 loại
  báo cáo drill-down của `#248` có `filterConfig: []` nên form không vẽ gì, trong khi
  `buildInventorySearchFilters` đọc cả túi `filters` phẳng. Sai: dialog không dùng store của
  trang. `ReportDrillDownDialog` dựng **store mới** qua `buildDrillDownReportState`
  (`report.factory.ts:97-116`) với `filters: drillDown.filters` và `columnFilters: {}`, và
  `drillDown.filters` được mỗi resolver dựng bằng **allow-list tường minh, không spread**
  (`_lib/report-drilldown.ts:64-90` — có chú thích nói rõ lý do). Bộ lọc trang chính không có
  đường nào sang. Ghi lại để lần sau không ai đuổi lại con ma này.

## Đính chính sau khi ký G0

**2026-09-06, sau khi Akenzy ký G0.** Bản intent lúc ký có liệt kê một lỗi thứ năm ("N3 — bộ
lọc rò vào 3 báo cáo drill-down"). Kiểm lại thì **không phải lỗi** — lý do đầy đủ ghi ở mục
Out of scope. Đã gỡ khỏi phần Problem và đánh số lại N4→N3, N5→N4. Không có lỗi nào bị thêm
vào sau khi ký; phạm vi chỉ **hẹp đi**.
