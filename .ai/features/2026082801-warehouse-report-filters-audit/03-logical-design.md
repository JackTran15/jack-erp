---
feature: warehouse-report-filters-audit
adr_count: 7
---

# Logical design — Bộ lọc nhóm Báo cáo > Kho

## Approach

Bốn lỗi nằm ở bốn tầng khác nhau và không chồng lấn, nên mỗi lỗi được sửa đúng tại tầng của
nó, không có tầng nào gánh hộ tầng khác.

**D1** thêm một resolver dùng chung `resolveDescendantCategoryIds` vào `report-scope.util.ts`
— cùng chỗ, cùng hình dạng với `resolveInventoryBranchIds` và `resolveWarehouseLocationIds`
mà 7 báo cáo đã gọi sẵn. Mỗi báo cáo đổi một dòng: `categoryIds: filters.categoryId ? [id]`
thành lời gọi resolver. Năm engine SQL không đổi — chúng vẫn nhận `categoryIds: string[]` và
vẫn so `= ANY($n)`; chỉ có mảng truyền vào là dài ra.

**D2** dọn `filters` trong action `setReportType` của report store, theo
`getReportFormLines(reportType, branch)` cộng một allowlist các line có nghĩa mà không render.
Store này dùng chung cho cả 4 nhóm báo cáo, nên allowlist là phần bắt buộc chứ không phải
phòng hờ (ADR-04).

**D3** là sửa catalog thuần backend: thêm `filterKind: 'none'` cho 9 cột luôn null. FE đã dẫn
`filterKind` từ catalog xuống `FilterHeaderCell` qua `mapHeadersToTableConfig`, nên không cần
động vào frontend.

**D4** đưa `actor.branchIds` đã sắp xếp vào `searchCacheKey`.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Sửa `WITH RECURSIVE` trong SQL của từng engine (D1) | 5 engine × nhiều câu truy vấn con (rows/count/totals) mỗi engine; mở rộng cây là quyết định miền, không phải chi tiết của một câu truy vấn |
| Mở rộng cây ở `SearchInventoryReportHandler` (D1) | Có **hai** entry point gọi `buildData` — handler tìm kiếm và `ReportExportService`; sửa một chỗ thì xuất khẩu vẫn sai |
| Dọn bộ lọc lúc dựng payload trong `buildInventorySearchFilters` (D2) | Giá trị vô hình vẫn nằm trong store và sống lại khi quay về báo cáo cũ; và `buildSearchFilters` của 3 nhóm còn lại sẽ phải sửa y hệt |
| Thêm `ReportColumnSpec` cho 9 cột (D3) | Không có dữ liệu để lọc — `toRow` gán cứng `null`, `branches` không có cột code |
| Bỏ 9 cột khỏi catalog (D3) | Template cột đã lưu tham chiếu tên cột; bỏ đi làm hỏng template cũ |
| Bỏ cache 45s (D4) | Cache là kết quả có chủ ý của đợt tối ưu hiệu năng; đổi khoá rẻ hơn nhiều so với bỏ |

## Domain model

| Khái niệm | Hình dạng | Ghi chú |
| --- | --- | --- |
| `resolveDescendantCategoryIds(repo, categoryId, orgId)` | `Promise<string[] \| undefined>` | `undefined` khi không lọc; nhóm không thuộc org trả `['00000000-…-000000000000']` (bộ lọc bất khả thi), theo đúng quy ước của `resolveWarehouseLocationIds` |
| Allowlist line giữ lại khi đổi báo cáo | `ReadonlySet<REPORT_FILTERS_LINE>` | `SKU`, `REPORT_PERIOD`, `RANGE_DATE`, 4 line `PERIOD_COMPARE_*` |

## Contracts

Không có endpoint mới và không có thay đổi phá vỡ hợp đồng.

### POST /reports/inventory/search
Thân request không đổi. Đổi **ngữ nghĩa** của `filters.categoryId`: từ "khớp đúng nhóm này"
thành "khớp nhóm này và mọi hậu duệ". Không có cờ bật/tắt — hành vi cũ là lỗi, không phải một
chế độ.

### GET /reports/inventory/columns
9 phần tử trong `columns[]` được thêm `filterKind: "none"`. Trường đã có trong
`ReportColumnHeader` và đã dùng cho `positionCode`/`positionName`, nên không cần chạy lại
`pnpm openapi:generate`.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| `filters` (bộ lọc đầu trang) | report store, per-page | Trang; **bị dọn theo report type từ nay** |
| `columnFilters` | report store | Trang; đã bị dọn bởi `pruneColumnFilters` |
| `appliedRequest` | report store | Snapshot chốt khi bấm "Đồng ý" |
| Kết quả `buildData` | Redis, 45s | Khoá theo org + **branchIds** + dto |

## Error taxonomy

| Điều kiện | Phản hồi | UI |
| --- | --- | --- |
| Nhóm hàng không tồn tại / khác tổ chức | 200 + 0 dòng | Lưới rỗng, không toast |
| Lọc cột không có spec | 400 `Cột "X" không hỗ trợ lọc trên báo cáo này` | Không còn đến được từ UI sau ADR-05; giữ nguyên cho caller tự dựng request |
| Chi nhánh ngoài quyền | 403 `Access denied for stores` | Không đổi |
| Cột ngoài catalog | 400 `Unknown report columns` | Không đổi |

## ADRs

### ADR-01 — Mở rộng cây nhóm hàng ở tầng resolver, không ở SQL
**Context:** 5 engine, mỗi engine nhiều câu truy vấn con, đều so `i.category_id = ANY($n)`.
**Decision:** Giữ nguyên SQL; mở rộng `categoryId` thành danh sách hậu duệ trước khi gọi engine, trong một helper đặt cạnh `resolveInventoryBranchIds` ở `report-scope.util.ts`.
**Consequences:** 7 báo cáo mỗi cái sửa một dòng; engine không đổi nên không phải đo lại hiệu năng của đợt row-cap pushdown. Danh sách id có thể dài — cây thật hiện sâu 2 cấp, rộng nhất 19 nhóm con.
**Status:** accepted

### ADR-02 — Duyệt cây trong bộ nhớ, không `WITH RECURSIVE`
**Context:** Repo đã có **hai** bản mở rộng cây: `pos-catalog-product.service.ts` duyệt adjacency-list trong RAM, `inventory/ledger/stock-summary.service.ts` dùng recursive CTE. Thêm bản thứ ba là sai dù chọn kiểu nào.
**Decision:** Bản dùng chung mới theo kiểu POS — nạp `(id, parentGroupId)` của tổ chức rồi duyệt trong JS. Khớp quy ước "ưu tiên gộp trong bộ nhớ" của repo và trả về `string[]` mà engine đang nhận sẵn.
**Consequences:** Một truy vấn nhỏ thêm cho mỗi request có lọc nhóm. Bản recursive CTE ở trang legacy được giữ nguyên — nó thuộc trang ngoài phạm vi, gộp luôn sẽ nở phạm vi.
**Status:** accepted

### ADR-03 — Dọn bộ lọc trong store, không ở lúc dựng payload
**Context:** Chặn được ở hai nơi: `setReportType` (xoá khỏi state) hoặc `buildInventorySearchFilters` (giữ state, bỏ khi gửi).
**Decision:** Xoá trong `setReportType`.
**Consequences:** Đổi báo cáo rồi quay lại thì giá trị đã mất — chấp nhận, và nhất quán với `pruneColumnFilters` vốn xoá hẳn giá trị của cột biến mất. Đổi lại, không tồn tại trạng thái nào mà form và payload bất đồng.
**Status:** accepted

### ADR-04 — Allowlist các filter line có nghĩa mà không render
**Context:** `getReportFormLines` chỉ liệt kê line **vẽ ra được**. `SKU` không thuộc báo cáo nào nhưng mang phạm vi drill-down; factory seed sẵn 4 line `PERIOD_COMPARE_*` cho mọi báo cáo trong khi chỉ `business-results` khai chúng. Dọn thuần theo `getReportFormLines` sẽ phá drill-down và làm rỗng kỳ so sánh của báo cáo lợi nhuận.
**Decision:** Dọn theo `getReportFormLines(reportType, branch)` ∪ allowlist `{SKU, REPORT_PERIOD, RANGE_DATE, PERIOD_COMPARE_PREVIOUS, PERIOD_COMPARE_PREVIOUS_RANGE, PERIOD_COMPARE_CURRENT, PERIOD_COMPARE_CURRENT_RANGE}`.
**Consequences:** Allowlist là chỗ phải nhớ cập nhật khi thêm một filter line ẩn. Đổi lại, một action duy nhất phục vụ đúng cho cả 4 nhóm báo cáo.
**Status:** accepted

### ADR-05 — Cột luôn null thì ẩn ô lọc, không bổ sung dữ liệu
**Context:** 9 cột 400 đều được `toRow` gán cứng `null`, có chú thích trong mã nói rõ là cố ý.
**Decision:** Thêm `filterKind: 'none'` vào catalog của 9 cột, giống `positionCode`/`positionName`. Không đụng `buildReportColumnFilter` — 400 vẫn là câu trả lời đúng cho caller tự dựng request.
**Consequences:** Cột vẫn hiện (và vẫn rỗng); chỉ ô lọc biến mất. Ngày nào có dữ liệu thật thì gỡ `filterKind` và thêm spec.
**Status:** accepted

### ADR-06 — `branchIds` vào khoá cache, không vào namespace
**Context:** `searchCacheKey` băm org + dto. Request không mang `store` suy phạm vi từ `actor.branchIds`.
**Decision:** Băm thêm `actor.branchIds` đã sắp xếp. Namespace giữ nguyên `inventory-reports` để việc xoá cache theo namespace không đổi.
**Consequences:** Mỗi tổ hợp phân công chi nhánh có ô cache riêng. Với tổ chức mà mọi người cùng phân công thì tỉ lệ trúng không đổi.
**Status:** accepted

### ADR-07 — `filterKind` phụ thuộc hạt, chia theo việc hạt có điền cột hay không
**Context:** Ở "Thống kê theo" = Mẫu mã / Nhóm hàng hóa, 91 tổ hợp cột×hạt trên 5 báo cáo trả 400. Đo trên dữ liệu thật (`evidence/probe-aggregate-grain-columns.txt`) thì tập cột đó chia đôi rất rõ:

| Nhóm | Ví dụ | Ở hạt gộp |
| --- | --- | --- |
| A | `sku`, `name`, `group`, `total`, `targetBranch`, `branch.qty.*`, `transferOutQty`, `incomingQty` | **có số thật** — SQL gộp điền mã/tên sản phẩm cha hoặc tên nhóm vào đúng cột đó |
| B | `parentSku`, `parentName`, `color`, `size`, `unit`, `brand`, `branch` | luôn rỗng — hạt gộp không có một giá trị duy nhất để nói |

**Decision:** Chia theo nhóm, không dùng một luật chung.
- Nhóm A: bổ sung `ReportColumnSpec` theo hạt trong engine, để lọc chạy thật.
- Nhóm B: `filterKind: 'none'`, đúng ADR-05.

Kéo theo một thay đổi hình dạng: `filterKind` thôi là hằng tĩnh trên `COLUMNS`, nó trở thành thứ `buildColumns(actor, { statBy })` tính ra theo hạt. `buildColumns` đã nhận `statBy` sẵn nên không phải đổi hợp đồng.

**Consequences:** Người dùng giữ được lọc trên đúng những cột hạt gộp có số, và không còn ô lọc nào trả lỗi. Cái giá là mỗi báo cáo có thêm một bảng "hạt nào điền cột nào" — nhưng bảng đó vốn đã tồn tại ngầm trong SQL gộp, chỉ là chưa được viết ra chỗ nào đọc được. `stock-summary` đã có sẵn dạng bảng này (`IDENTITY_KEYS_BY_GRAIN`), dùng làm khuôn cho bốn báo cáo còn lại.

Không bỏ cột nhóm B khỏi catalog (A-09): template cột đã lưu tham chiếu tên cột.
**Status:** accepted
