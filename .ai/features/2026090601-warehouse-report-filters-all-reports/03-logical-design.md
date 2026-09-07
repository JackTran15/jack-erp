---
feature: warehouse-report-filters-all-reports
adr_count: 6
---

# Logical design — Bộ lọc Báo cáo > Kho

## Approach

Feature chia hai nửa không chồng lấn.

**Nửa recover (US-01).** Không viết lại gì. `1cb20a60` là bản đã nghiệm thu G5, và cherry-pick
thử cho thấy chỉ 3 conflict máy móc. Bảy ADR của
`2026082801-warehouse-report-filters-audit` được **kế thừa nguyên vẹn** — chúng vẫn mô tả đúng
mã sau khi gỡ conflict, nên không chép lại vào đây; tham chiếu là
`git show filter-report-warehouse:.ai/features/2026082801-warehouse-report-filters-audit/03-logical-design.md`.

**Nửa lỗi mới (US-02…US-05).** Bốn lỗi ở bốn tầng, mỗi lỗi sửa tại tầng của nó.

N1 là lỗi có nội dung thiết kế thật, ba lỗi còn lại gần như cơ khí.

### N1 — cái sai nằm ở đường vận chuyển, không ở bộ lọc

Hôm nay giá trị "Đơn vị tính"/"Thương hiệu" trên thanh lọc đầu trang được **gấp vào cùng một
túi `columnFilters`** với ô lọc trên lưới: 5 lớp report gọi
`toEngineFilters(dto.columnFilters, KEY_MAP, { unit, brand })`. Ở hạt item chuyện đó vô hại,
vì cột `unit` có mặt và có spec. Ở hạt gộp thì hai vai trò tách hẳn ra:

| | cột `unit` trên lưới | dòng "Đơn vị tính" đầu trang |
|---|---|---|
| Ở hạt gộp | **không có giá trị** — một nhóm không có một ĐVT duy nhất; `buildAggSqls` chọn `NULL::text AS unit` | **vẫn có nghĩa** — "chỉ tính hàng có ĐVT này" |
| Đúng ra phải | không vẽ ô lọc (ADR-05/07 tháng 8) | lọc **thành viên**, trước khi gộp |

Gộp chung một túi buộc hai vai trò phải cùng có hay cùng không có spec, nên hôm nay chúng cùng
**không** có ⇒ 400. Sửa bằng cách tách túi, không phải bằng cách cấp spec cho một cột rỗng.

Vị trí của vị từ cũng khác nhau, và đó là phần dễ làm sai: một vị từ trên `i.unit` đặt **ngoài**
CTE gộp sẽ đọc cột đã bị NULL hoá và luôn trả rỗng. Nó phải nằm **trong** CTE, cạnh
`GROUP BY`, tức là cùng chỗ với vị từ nhóm hàng và kỳ.

Đây là bước tiếp theo tự nhiên của `partitionPivotFilters` (T-05-04 tháng 8), vốn đã chia
`columnFilters` làm hai theo nơi vị từ hợp lệ: định danh → `WHERE`, cột đo → `HAVING`. Nay
thành ba ngăn.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Cấp `ReportColumnSpec` cho `unit`/`brand` ở hạt gộp (N1) | Cột đó là `NULL::text` sau khi gộp — spec sẽ lọc trên một cột rỗng và luôn trả 0 dòng. Đổi 400 thành kết quả sai âm thầm. |
| Ẩn dòng "Đơn vị tính"/"Thương hiệu" khi đổi hạt (N1) | Akenzy đã cân nhắc và chọn giữ (A-01). Rẻ hơn nhưng mất đúng khả năng người dùng đang cần. |
| Dùng bán liên kết `EXISTS` cho `unit`/`brand` ở hạt gộp (N1) | Nhóm sẽ hiện **đủ số** miễn có một hàng khớp — trái nghĩa Akenzy chốt ở A-01 ("số liệu chỉ gồm hàng khớp"). |
| Cho pivot tôn trọng kỳ (N2) | Engine đọc `stock_balances`, không có trục thời gian; muốn có kỳ phải dựng lại trên ledger. Là feature khác, không phải sửa bộ lọc. |
| Ẩn ô lọc trên 3 dialog drill-down (N3) | Akenzy chọn nối cho lọc thật (A-03). |
| Bỏ hẳn `countSql` riêng, đếm bằng window function (N4) | `temp-warehouse-report` đã làm vậy và chạy tốt, nhưng đổi cách đếm của `transfer-report` kéo theo đo lại hiệu năng của đợt row-cap pushdown. Cho hai câu dùng chung một CTE rẻ hơn nhiều. |
| Gỡ dòng lọc kỳ bằng cách để `getReportFormLines` trả rỗng theo hạt (N2) | Kỳ không phụ thuộc hạt; chỗ đúng là registry của chính báo cáo đó. |

## Domain model

| Khái niệm | Hình dạng | Ghi chú |
| --- | --- | --- |
| `MemberScopeFilters` | `{ unit?: string; brand?: string }` | Bộ lọc **thành viên**: chọn hàng nào được vào phép gộp. Tách khỏi `ReportColumnFilters` (bộ lọc **kết quả**). |
| `partitionAggFilters(cols, grain)` | `{ cteWhere, outerWhere, having }` | Mở rộng `partitionPivotFilters` từ hai ngăn thành ba. Ngăn `cteWhere` là ngăn mới. |
| `TransferDetailQuery.columnFilters` | `ReportColumnFilters \| undefined` | Tham số mới của `detail()` / `summarizeByCounterpart()`. |

## Contracts

Không có endpoint mới. Không có thay đổi phá vỡ hợp đồng HTTP.

### POST /reports/inventory/search
Thân request không đổi. Đổi **ngữ nghĩa** ở hai chỗ:
- `filters.categoryId` — từ "khớp đúng nhóm này" thành "khớp nhóm này và mọi hậu duệ" (kế thừa
  từ đợt tháng 8).
- `filters.unit` / `filters.brand` khi `statBy ∈ {parent, group}` — từ **400** thành "chỉ gộp
  các mặt hàng khớp". Không có cờ bật/tắt: hành vi cũ là lỗi, không phải một chế độ.

### GET /reports/inventory/columns
Không đổi so với bản tháng 8. `unit`/`brand` vẫn vắng mặt ở hạt gộp — đó là mô tả đúng: cột
không có giá trị. Việc dòng lọc đầu trang vẫn chạy không mâu thuẫn, vì nó lọc thành viên chứ
không lọc cột.

### Registry FE của "Số lượng tồn kho theo cửa hàng"
`report_period` và `range_date` bị gỡ khỏi `filterConfig`, nên form không còn vẽ hai dòng đó.

**Đính chính 2026-09-06 (T-04-02).** Bản đầu viết "payload vì thế không còn `period`/`preset`".
Vế đó **không tự đúng**: `buildInitialReportState` seed kỳ cho mọi báo cáo,
`ALWAYS_KEPT_FILTER_LINES` cố ý giữ kỳ qua prune (đó là thứ làm kỳ của báo cáo khác không bị
rỗng — A-07), và `buildInventorySearchFilters` đọc túi `filters` vô điều kiện. Registry chỉ
quyết định RENDER. Payload sạch kỳ là nhờ một cổng riêng ở tầng payload,
`PERIODLESS_REPORTS` trong `inventory-report-v2.api.ts`, khoá theo `backendKey`. Backend vốn
không đọc `period` nên không có thay đổi hành vi nhìn thấy được.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| `filters` (thanh lọc đầu trang) | report store của trang | Trang; bị dọn theo report type (ADR-03 tháng 8) |
| `filters` của dialog drill-down | store **riêng** dựng bởi `buildDrillDownReportState` | Vòng đời dialog; không thông với store trang |
| `columnFilters` | report store | Trang; dọn bởi `pruneColumnFilters` khi catalog đổi |
| Kết quả `buildData` | Redis, 45s | Khoá theo org + `actor.branchIds` + dto |

## Error taxonomy

| Điều kiện | Phản hồi | UI |
| --- | --- | --- |
| Nhóm hàng không tồn tại / khác tổ chức | 200 + 0 dòng | Lưới rỗng, không toast |
| ĐVT/Thương hiệu ở hạt gộp | **200 + tập đã lọc thành viên** (trước: 400) | Lưới hẹp lại |
| Lọc một cột không có spec ở hạt đang xem | 400 `Cột "X" không hỗ trợ lọc trên báo cáo này` | Không đến được từ UI — ô không được vẽ |
| Cột ngoài catalog | 400 `Unknown report columns` | Không đổi |
| Chi nhánh ngoài quyền | 403 `Access denied for stores` | Không đổi |

## ADRs

### ADR-01 — Recover bằng cherry-pick, không viết lại
**Context:** `1cb20a60` đã qua G5 với 12/12 ticket và 13/13 AC có ảnh. `main` đã đi tiếp 13 commit, trong đó `#240` viết lại `stock-by-store-pivot` sang org-wide.
**Decision:** Cherry-pick `1cb20a60` lên `main`, gỡ 3 conflict tại chỗ. Giữ nguyên bảy ADR tháng 8; không mở lại quyết định nào của chúng.
**Consequences:** Lịch sử giữ được commit gốc và thông điệp của nó. Nhánh `filter-report-warehouse` sau đó bỏ được. Rủi ro còn lại là A-05 (bản cũ có còn đúng với `main` hôm nay không), đóng bằng cách chạy lại test của chính commit đó.
**Status:** accepted

### ADR-02 — Tách bộ lọc **thành viên** khỏi bộ lọc **kết quả**
**Context:** `filters.unit`/`filters.brand` đang đi chung túi `columnFilters` với ô lọc trên lưới. Ở hạt gộp hai vai trò tách hẳn: cột không có giá trị, còn dòng lọc thì vẫn có nghĩa.
**Decision:** Đưa `unit`/`brand` từ thanh lọc đầu trang thành một `MemberScopeFilters` riêng, đi thẳng xuống engine, không qua `toEngineFilters`. Ô lọc cột `unit`/`brand` vẫn theo ADR-05/07 tháng 8 (ở hạt gộp: không vẽ ô).
**Consequences:** Hết lớp 400 hiện tại và hết cả khả năng tái phát khi thêm hạt mới, vì hai vai trò không còn buộc phải cùng có spec. Cái giá: `toEngineFilters` mất tham số scope `{unit, brand}` ở 5 lớp report — phải sửa cả 5, và hai lớp `document-detail`/`temp-warehouse-out` vốn **quên** truyền scope đó sẽ được nối đúng luôn trong cùng một lượt.
**Status:** accepted

### ADR-03 — Vị từ thành viên nằm TRONG CTE gộp
**Context:** `buildAggSqls` chọn `NULL::text AS unit` / `AS brand` sau khi gộp. Một vị từ trên `unit` đặt ngoài CTE đọc đúng cột NULL đó.
**Decision:** Mở rộng `partitionPivotFilters` thành `partitionAggFilters` trả ba ngăn — `cteWhere` (thành viên: `i.unit`, `i.brand`, nhóm hàng, kỳ), `outerWhere` (định danh sau gộp: `sku`, `itemName`, `categoryName`), `having` (cột đo: `total`, `branch.qty.*`). Ba ngăn dùng chung một CTE `groups` với câu trang, câu đếm và câu chân trang.
**Consequences:** Một chỗ duy nhất quyết định vị từ nào đi đâu, và bảng phân ngăn đó là thứ đọc được thay vì nằm ngầm trong SQL. Kéo theo: ADR-05 dưới đây gần như miễn phí, vì dùng chung CTE là điều kiện của cả hai.
**Status:** accepted

### ADR-04 — Gỡ dòng lọc kỳ ở registry, không đụng engine pivot
**Context:** "Số lượng tồn kho theo cửa hàng" đọc `stock_balances` — tồn tại thời điểm hiện tại, không có trục thời gian. Form vẫn khai `report_period` + `range_date`; đo được 5/5 kỳ khác nhau đều 9639 dòng.
**Decision:** Gỡ hai dòng đó khỏi `report-stock-quantity-by-store.registry.ts`. Engine không đổi.
**Consequences:** Người dùng mất một ô lọc vốn chưa bao giờ hoạt động — đúng nghĩa. Nếu sau này cần tồn theo thời điểm quá khứ thì đó là feature riêng dựng trên ledger (A-02). Hai line vẫn nằm trong `ALWAYS_KEPT_FILTER_LINES` nên prune của ADR-04 tháng 8 không xoá chúng khỏi túi của báo cáo khác.
**Status:** accepted

### ADR-05 — `countSql` và chân trang dùng chung CTE với câu trang
**Context:** `transfer-report.service.ts` ở hạt gộp: câu trang có `JOIN branches b` (INNER, loại dòng) và `joinLookup`; câu đếm `:860-869` không có cái nào. Chân trang vì thế mô tả một tập khác lưới, và phân trang sinh trang ma.
**Decision:** Gom trang + đếm + chân trang về một CTE `groups` dùng chung, đúng khuôn T-05-04 tháng 8 đã dựng cho `stock-period`. Áp cùng lúc cho `stock-period` (nơi thiếu `joinLookup` mới chỉ là lỗi tiềm ẩn) để hai engine không phân kỳ.
**Consequences:** Số tổng có thể **giảm** so với hôm nay ở những tổ chức có `other_branch_id` không phân giải được — cần ghi vào ghi chú phát hành để không bị đọc nhầm là hồi quy (A-09).
**Status:** accepted

### ADR-06 — `columnFilters` xuống thẳng `TransferDetailService`
**Context:** Ba báo cáo transfer-detail gọi `assertKnownColumns` rồi không truyền `columnFilters` đi đâu ⇒ 200 kèm dữ liệu chưa lọc. Sai âm thầm.
**Decision:** Thêm tham số `columnFilters` cho `detail()` và `summarizeByCounterpart()`, cấp `ReportColumnSpecs` cho các cột có biểu thức thật, và để `filterKind: 'none'` cho các cột không có.
**Consequences:** Xác thực và thi hành lại trùng nhau, nên không còn trạng thái "nhận rồi bỏ". Cái giá là ba lớp report và một service đổi chữ ký; `transfer-catalog-parity.spec.ts` có thể phải cập nhật (A-08).
**Status:** accepted
