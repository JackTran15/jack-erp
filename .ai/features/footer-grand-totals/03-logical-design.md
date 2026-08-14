---
feature: footer-grand-totals
adr_count: 6
---

# Logical design — Footer tổng toàn tập kết quả

## Approach

Một quy tắc duy nhất chi phối cả feature:

> **Tổng và lưới phải sinh ra từ cùng một hàm dựng truy vấn.** Không có đường thứ hai dựng
> `WHERE`. Nếu footer có thể lệch lưới, sớm muộn nó sẽ lệch.

Repo đã có bản mẫu đúng của quy tắc này — `search-deposit-recon-v2.handler.ts:133-136` — và ba
tầng công việc dưới đây chỉ là áp nó lên ba loại truy vấn khác nhau.

**Tầng 1 — TypeORM QueryBuilder (3 phiếu kho).** Tách `buildQuery(dto, actor)` chứa scope +
filter; gọi hai lần: một cho rows (kèm join `lines` để panel Chi tiết có dữ liệu), một cho totals
(**không** join `lines`, chỉ `COUNT(*)` + `SUM(<correlated subquery>)`). Biểu thức tổng tiền đã tồn
tại sẵn ở đầu mỗi handler và đang được dùng cho filter `totalAmount`, nên tổng và bộ lọc chắc chắn
đồng bộ về định nghĩa.

**Tầng 2 — raw SQL có `GROUP BY` (Tổng hợp tồn kho).** Truy vấn nhóm được dựng lần thứ hai rồi bọc
làm CTE `pairs`; các phần bổ trợ (kỳ, đang chuyển, giữ chỗ) hiện join vào `unnest()` của **trang**
sẽ đổi sang join vào `pairs` của **toàn tập**, bỏ `GROUP BY` vì footer chỉ cần scalar. Toàn bộ gộp
thành **một** statement thay thế statement aggregate cũ ⇒ số round-trip không đổi.

**Tầng 3 — raw SQL/CTE (8 báo cáo kho).** Mỗi báo cáo đã có sẵn `countSql` chạy trên đúng tập đã
lọc; mở rộng nó thành count + totals là gần như miễn phí ở 7/8 báo cáo. Phần thực sự mới là đưa
**lọc-theo-cột xuống server** — điều kiện tiên quyết để phân trang server không làm hỏng ý nghĩa
của bộ lọc, và cũng là thứ khiến footer có thể tin được.

Thứ tự thi công: phiếu kho → tồn kho → hợp đồng chung báo cáo (demo trên báo cáo rẻ nhất) → các
báo cáo còn lại. Mỗi bước là một lát cắt dọc demo được.

## Alternatives rejected

| Phương án | Vì sao bỏ |
| --- | --- |
| Cộng phía client trên tập đã nạp đủ (bỏ trần 200, giữ phân trang client) | Rẻ hơn nhiều và footer sẽ đúng, nhưng chủ sở hữu chốt **tất cả phân trang server**. Cũng đẩy payload lên ~8k dòng mỗi lần mở báo cáo. Ghi lại ở A-R1 |
| Endpoint `/totals` riêng cho mỗi bảng | Hai đường dựng `WHERE` ⇒ đúng cái sai đang phải sửa. Thêm một round-trip nữa |
| Tính footer trong `BaseDataTable` | Bảng chỉ nhận `ReactNode` và không biết nguồn dữ liệu (`BaseDataTable.tsx:60-65`). Muốn tập trung hoá thì phải viết lại contract của bảng — ngoài phạm vi |
| Interface `totals` riêng theo từng báo cáo | 8 hình dạng phải bảo trì, và báo cáo pivot có cột động nên vẫn cần map ⇒ chọn `Record<string, number>` |
| Sửa luôn các quirk nghiệp vụ phát hiện dọc đường (`incomingAssigned`, dòng pending-only không chịu filter) | Đổi con số người dùng đang thấy, lẫn vào một thay đổi vốn chỉ nói về "tổng của tập nào". Tách việc — A-04 |

## Error taxonomy

| Lỗi | Biểu hiện | Xử lý |
| --- | --- | --- |
| Nhân dòng do join one-to-many trong query totals | Footer lớn hơn thực tế theo bội số dòng hàng | Query totals không được join `lines`; chỉ dùng correlated subquery. Chốt bằng AC-04 |
| Footer lệch lưới do hai đường dựng filter | Lọc xong footer không đổi, hoặc đổi sai | Một `buildQuery` dùng chung cho rows/count/totals. Chốt bằng AC-02, AC-18 |
| Cache trả về hình dạng cũ | `totals` `undefined` sau khi deploy | Bump `CACHE_NAMESPACE`; FE coi thiếu `totals` là trạng thái tải, không phải số 0. AC-21 |
| Tổng đếm hai lần dòng "sắp nhận về" | Footer phình khi có lệnh điều chuyển đang về | Hai tập rời nhau nhờ `NOT EXISTS`; kiểm bằng AC-09 |
| Trần `pageSize` bị nới thành đường ép server tải nặng | Một request kéo hàng chục nghìn dòng | Giữ trần rõ ràng, thống nhất với `MAX_REPORT_ROWS` sẵn có; không bỏ trần |
| Aggregate quét nặng ở quy mô ~8k cặp | Trang Tổng hợp tồn kho chậm hẳn | `EXPLAIN ANALYZE` trước khi merge; cờ `includeTotals` là van xả (A-06) |

## ADRs

### ADR-01 — Tổng do server tính, dùng chung hàm dựng truy vấn với lưới

**Status:** accepted
**Context:** Footer hiện `reduce` trên mảng dòng của trang. Mọi biến thể "cộng ở client" đều chỉ
đúng khi client giữ toàn bộ tập, điều mà phân trang server loại bỏ theo định nghĩa.
**Decision:** Response của mọi endpoint trong phạm vi mang theo tổng của toàn tập; tổng được tính
bằng chính hàm dựng truy vấn của lưới, gọi lại lần nữa với `SELECT` khác.
**Consequences:** Thêm một truy vấn song song mỗi request (trong `Promise.all`, không nối tiếp).
Đổi lại, footer không thể lệch lưới bằng cách xây dựng. FE mất khả năng hiển thị footer khi
offline/chưa có response — chấp nhận, footer ẩn khi đang tải.

### ADR-02 — Hình dạng `totals` là `Record<string, number>` khoá theo tên field của dòng

**Status:** accepted
**Context:** 8 báo cáo có tập cột khác nhau; riêng báo cáo Tồn kho theo chi nhánh sinh cột động
theo từng chi nhánh nên không thể khai báo tĩnh.
**Decision:** `totals: Record<string, number>`, khoá bằng đúng tên field mà cột render
(`openingQty`, `outValue`...); cột động dùng dot-path `perBranch.<branchId>`. Cột dẫn xuất
(`endingQty`, đơn giá bình quân) **không** nằm trong `totals` — FE suy ra từ primitive, vì trung
bình của trung bình là sai.
**Consequences:** Một hình dạng cho cả 8 báo cáo, shell chỉ cần một đường dây. Mất kiểm tra kiểu ở
mức từng khoá — bù bằng việc khoá trùng tên field của row nên lệch tên lộ ra ngay khi render.

### ADR-03 — Lọc-theo-cột của báo cáo tái dùng từ vựng v2 sẵn có

**Status:** accepted
**Context:** Shell đang lọc phía client bằng cách so chuỗi trên text đã render
(`StorageReportShell.tsx:194-216`). Phân trang server làm cách này vô nghĩa: nó chỉ lọc trang
đang xem.
**Decision:** Dùng lại `ColumnFilter` / `buildV2Body` (`components/crud/crudV2Search.ts`) ở FE và
`FilterBuilder` (`common/filters/filter.builder.ts`) ở BE. Mỗi báo cáo khai báo một spec
`column key → biểu thức SQL + kiểu lọc`. Cột số dùng toán tử số (A-02), không mô phỏng khớp chuỗi
trên số đã định dạng.
**Consequences:** Hành vi lọc cột số thay đổi thấy được với người dùng — đây là thay đổi có chủ
đích, thống nhất với 3 trang phiếu kho. Mỗi báo cáo phải khai báo spec cột, không có đường tắt
generic.

### ADR-04 — Cột ghép bằng JS được nâng lên thành biểu thức SQL

**Status:** accepted
**Context:** `transferOutQty` / `incomingQty` của `stock-period.service.ts` được ghép trong JS theo
từng trang (`applyPendingTransfers:235-270`); các ô của báo cáo pivot cũng chỉ tính cho `itemIds`
của trang. Chủ sở hữu yêu cầu **mọi cột vẫn lọc được** (A-01), mà đã lọc được thì phải tổng được.
**Decision:** Đưa các cột này thành semi-join trong cùng statement với rows/count/totals. Ở chế độ
gộp theo nhóm/hàng cha, hai cột điều chuyển luôn bằng 0 theo cấu trúc truy vấn hiện tại — tổng cũng
phải là 0, không "sửa" thành khác.
**Consequences:** Đây là phần nặng nhất và rủi ro nhất của feature, nên nó đứng riêng một UoW.
Phải tái hiện đúng quirk khử trùng `incomingAssigned` (`:259-267`) để footer khớp cột đang hiển thị
(A-04); tính đúng-sai nghiệp vụ của quirk đó ghi thành việc riêng.

### ADR-05 — Lọc và phân trang đi vào khoá cache; namespace được bump

**Status:** accepted
**Context:** Mỗi báo cáo có builder khoá cache riêng (`buildPivotCacheKey`,
`buildTransferSummaryCacheKey`...), TTL 45s, và `totals` sẽ nằm **trong** object được cache.
**Decision:** Thêm lọc-theo-cột (và `page`/`pageSize` ở những báo cáo chưa có) vào từng builder
khoá; bump `CACHE_NAMESPACE` khi đổi hình dạng kết quả.
**Consequences:** Nhiều biến thể cache hơn, tỉ lệ hit thấp hơn — chấp nhận được với TTL 45s. Bỏ
sót một khoá là lỗi "lọc xong không đổi gì", nên đây là điểm cần kiểm bằng test.

### ADR-06 — Tổng của Tổng hợp tồn kho gộp vào một statement, kèm cờ bỏ qua

**Status:** accepted
**Context:** `getSummary` đã dựng truy vấn nhóm hai lần và bọc lần hai để lấy `total` +
`totalQuantity` (`stock-summary.service.ts:232-248`). Cùng service này phục vụ tiến trình xuất khẩu
lặp qua từng trang 200 dòng (`stock-summary-export.service.ts:80-98`).
**Decision:** Thay statement aggregate hiện có bằng một statement CTE tính đủ mọi tổng; thêm
`includeTotals` (mặc định bật) để xuất khẩu tắt phần tổng. Nhánh lọc dẫn xuất vốn đã nạp hết dữ
liệu vào bộ nhớ thì tính tổng bằng `reduce`, và **bỏ hẳn** statement tổng — hiện nhánh này vẫn tính
rồi vứt đi.
**Consequences:** Không thêm round-trip; tiết kiệm được một truy vấn ở nhánh lọc dẫn xuất. `pairs`
được tham chiếu nhiều lần trong CTE nên chi phí quét phải đo trước khi merge (A-06).

---

## Hợp đồng thay đổi (tóm tắt cho G3)

| Endpoint / màn hình | Thêm vào response | File chính |
| --- | --- | --- |
| `POST /v2/goods-receipts/search` | `totalAmount` | `inventory/goods-receipt/queries/search-goods-receipts-v2.handler.ts` |
| `POST /v2/inventory/goods-issues/search` | `totalAmount` | `inventory/goods-issue/queries/search-goods-issues-v2.handler.ts` |
| `POST /v2/inventory/stock/transfers/search` | `totalAmount` | `inventory/transfer/queries/search-stock-transfers-v2.handler.ts` |
| `POST /v2/inventory/stock/summary/search` | `totals` (8 field) | `inventory/ledger/stock-summary.service.ts` |
| 8 endpoint `/inventory-reports/*` | `totals` + lọc-theo-cột + phân trang thật | `inventory-reports/` (facade, 5 service, DTO) |

FE: 3 trang phiếu kho, `InventoryManagementPage`, `StorageReportShell` + `apiFilters` + 8 trang báo
cáo, và hai file type `api/stock-summary.ts`, `api/inventory-reports.ts`.

**Điểm bất thường phát hiện khi khảo sát, cần xử lý trong UoW báo cáo:** `transferSummary` ở facade
(`inventory-reports.service.ts:181-190`) trả về **toàn bộ** `result.data` nhưng vẫn echo lại
`page`/`pageSize` — nó chưa từng phân trang thật. Chuyển sang phân trang server phải cắt trang ở
đây, không chỉ đổi FE.
