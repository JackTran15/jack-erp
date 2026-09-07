# Assumption register

Mọi dòng `resolved` dưới đây đều được giải bằng **đọc mã nguồn hoặc quyết định tường minh của
người dùng**, không phải bằng suy đoán. Dòng nào chỉ giải được bằng dữ liệu thật thì nói rõ ai đo
và đo lúc nào.

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | `GoodsReceiptReferenceType.STOCK_TRANSFER` trỏ `transfer_orders.id`, **không** phải `stock_transfers.id` — nên `gi.reference_id = gr.reference_id` là phép ghép hợp lệ giữa hai chân | high | yes | Toàn bộ D1 sụp: `received` luôn 0, mọi chi nhánh báo chênh lệch âm bằng đúng số đã xuất | resolved | Đọc mã: `transfer-order.service.ts:1281` và `:1415` ghi `referenceType: GoodsReceiptReferenceType.STOCK_TRANSFER, referenceId: to.id`; `goods-receipt.service.ts:487, :624` đọc lại `receipt.referenceId` và đưa thẳng vào `TransferOrderEntity`. Tên enum gây hiểu nhầm nhưng ngữ nghĩa rõ. Ghim bằng spec ở T-01-04 |
| A-02 | Phiếu điều chuyển **lập tay** (`purpose='TRANSFER_OUT'`, `reference_id IS NULL`) là thiểu số trong dữ liệu vận hành thật | low | no | Cột "Chênh lệch thực nhận" đầy phiếu không bao giờ đóng được ⇒ người dùng học cách bỏ qua cột, mất luôn giá trị của cả feature | resolved | **ĐÃ ĐO trên `erp_dev` 2026-09-03: 337 phiếu xuất điều chuyển POSTED, `reference_id NULL` = 0 (0,0%).** Rủi ro rỗng trong dữ liệu thật — không phiếu nào bị kẹt vĩnh viễn ở L3 vì lý do này. D2 giữ nguyên. UI vẫn cho lập tay (`GoodsIssueFormDialog.tsx:137, :883, :998`) nên quy tắc vẫn cần, chỉ là chưa ai dùng. Đo lại trên DB khách trước khi bàn giao |
| A-03 | Luồng `stock_transfers` cũ nguyên tử ⇒ `received = out`, đóng góp 0 vào chênh lệch, không bao giờ xuất hiện ở L3 | high | yes | L3 liệt kê cả điều chuyển legacy mà không có Tham chiếu để hiển thị ⇒ dialog nói dối | resolved | Đọc mã: `stock-transfer.service.ts` post ghi cả hai chân trong một transaction; không có chứng từ đối ứng để ghép. D4 giữ nhánh 1–3 nguyên vẹn và loại nhánh ST khỏi `leg='unmatched'` bằng `$6 <> 'unmatched'`. **ĐÃ ĐO 2026-09-03: `stock_transfers` POSTED liên chi nhánh = 0 dòng trên `erp_dev`** ⇒ AC-05 không có gì để chụp. Đã cân nhắc dựng fixture rồi **bỏ** (xem A-14): dựng dữ liệu chỉ để chụp một quy tắc chưa từng xảy ra là bằng chứng giả |
| A-14 | Dữ liệu vận hành thật đủ làm bằng chứng cho phần lớn AC, nên feature này **không seed** | high | no | Nếu sai thì bằng chứng mỏng và phải dựng lại fixture | resolved | **ĐÃ ĐO 2026-09-03 trên `erp_dev`, loại fixture ra**: 300 cặp phiếu đã ghép, 27 phiếu đang vận chuyển, 15 chi nhánh có mã, và đúng ca khách báo. Ngược lại: 0 phiếu lập tay, 0 `stock_transfers` liên chi nhánh, 0 phiếu nhận sau cuối kỳ — ba thứ này **không** dựng fixture, mà khai ở `07-verification.md` mục "Not verified here". Seed đã viết ở T-01-02 bị **xoá** cùng các dòng nó chèn vào DB |
| A-04 | Phiếu nhập post **sau** ngày kết thúc kỳ vẫn được tính là "đã nhận" | high | yes | Nếu sai thì số của kỳ đã chốt không tái lập được, hoặc ngược lại chênh lệch không bao giờ đóng | resolved | Quyết định D3 của người dùng: chọn "tính đến hiện tại", chấp nhận số kỳ đã chốt đổi khi phiếu nhập về muộn. `EXISTS` **không** kèm `gr.posted_at < periodEnd`. Không có trường hợp nào trong dữ liệu thật (0 phiếu nhận sau cuối kỳ), nên quyết định này hiện **chưa được kiểm chứng bằng dữ liệu** — chỉ bằng cấu trúc truy vấn (không có `posted_at < $3` trong `EXISTS`) |
| A-05 | `received` là **tập con** của tập dòng sinh ra `out` ⇒ `diff ≤ 0` đúng theo cấu trúc | high | yes | Bất biến AC-03 sai, feature không giải quyết được vấn đề gốc | resolved | Theo thiết kế: `received_qty` là `CASE WHEN <paired> THEN gil.quantity ELSE 0 END` trên **cùng** dòng đã sinh `out_qty = gil.quantity`. Không còn nhánh UNION nào cộng `received` từ phía phiếu nhập. Ghim bằng test bất biến ở T-01-04 |
| A-06 | Dialog lồng trong dialog: đệ quy `ReportDrillDownBody → ReportDrillDownMount → ReportDrillDownDialog` tự dừng, và z-index đúng | high | yes | L2/L3 không mở được ⇒ hai phần ba feature không giao được | resolved | Đọc mã: đệ quy dừng vì `drillDown` ở tầng trong cùng là `null` nên `ReportDrillDownDialog` render `AppModal` rỗng. z-index đã giải sẵn — `app-modal.tsx:18-19, 381-383` giữ stack modal ở module scope, `overlayZIndex = 40 + stackIndex*20`. Tiền lệ đã verify xanh: `InvoiceDetailDialog` mở từ trong drill-down dialog, bước S7 của [[sales-report-km-and-drilldown]] |
| A-07 | Stack SINGLE đã xoá sẽ **ở nguyên trạng thái xoá** khi feature này merge | medium | no | Chế độ xem SINGLE mất drill-down; phải bổ sung `linkColumns` + `onCellClick` cho `StorageReportShell` và host `ReportDrillDownDialog` từ trang storage | resolved | `git status --porcelain` xác nhận 29 file đã xoá trong working tree bởi [[stock-by-store-branch-scope]] UOW-02; `App.tsx` route `/reports/inventory` sang `ReportPage` cho cả hai `STORE_TYPE`. Đã ghi ticket dự phòng vào 03-logical-design (ADR-06) nhưng **không dựng sẵn** — dựng sẵn cho một nhánh có thể không bao giờ xảy ra là chi phí chắc chắn đổi lấy lợi ích không chắc chắn |
| A-08 | Cờ `link` phải đến từ **catalog backend**, không phải registry FE, trên đường v2 | high | yes | Ô không click được, hoặc click được nhưng chỉ ở nhánh fallback ⇒ hành vi khác nhau tuỳ có template hay không | resolved | Đọc mã: `ReportTableConfigSync` ghi đè config registry mỗi khi `columnsResult.columns.length > 0`; `mapHeadersToTableConfig` (`invoice-report.api.ts:109`) đọc `h.link`. `buildInventoryHeaders` chưa bao giờ set `link` — phía invoice có `LINK_COLUMNS` (`report-column.util.ts:15, 53`) còn phía inventory không có tương đương. Vì vậy T-02-03 thêm `link?: boolean` vào `InventoryColumnDef`; registry FE vẫn khai `link: true` cho nhánh fallback |
| A-09 | Ô số có link hiện **mất định dạng** `vi-VN` | high | no | Mọi assert số trong verify phải khớp chuỗi sai (`1234.5` thay vì `1.234,5`), và người dùng thấy số thô | resolved | Đọc mã: `ReportPageTableView.tsx:484-497` render `{raw}` thô trong `<a>`, chỉ nhánh không-link mới qua `formatReportNumber`. Chưa lộ vì hôm nay chưa cột số nào click được — cũng chính là lý do [[sales-report-km-and-drilldown]] ghi AC-15 của nó là không verify được. Sửa trong T-02-04 |
| A-10 | Các báo cáo này đọc **chứng từ**, không đọc `stock_ledger` ⇒ seed không cần ghi ledger | high | no | Seed thiếu dữ liệu, hoặc ngược lại tốn công ghi ledger vô ích và làm lệch báo cáo tồn kho | resolved | Đọc mã: cả 6 nhánh UNION của `summarize()` chỉ chạm `stock_transfers`/`goods_issues`/`goods_receipts` + lines. Không có tham chiếu `stock_ledger` nào trong `transfer-report.service.ts` |
| A-11 | Σ dòng L1 ≡ dòng cha của chi nhánh neo, trên cả sáu chỉ tiêu | high | yes | AC-07 sai ⇒ drill-down mâu thuẫn với chính ô mở ra nó, tệ hơn là không có drill-down | resolved | Theo cấu trúc: L1 dùng đúng bốn vị ngữ của báo cáo cha, chỉ thêm `= $anchor` và chuyển `GROUP BY` sang phía đối ứng. Ghim bằng spec ở T-02-02 chạy cả hai truy vấn trên cùng seed |
| A-12 | `local-backoffice` chạy được và có quyền xem báo cáo kho | medium | no | Không có bằng chứng nào, G4 không qua được | resolved | `.ai/aidlc.yaml` khai `local-backoffice` `required: true` với recipe `form` đầy đủ selector. Lượt chạy đỏ của [[barcode-picker-hide-unit-price]] là `ERR_CONNECTION_REFUSED` trên `:3000` — nguyên nhân là dev server chưa bật, không phải cấu hình sai. T-04-04 bật `make dev-api` + `make dev-backoffice` trước khi chạy |
| A-13 | Không có index nào trên `goods_issues.reference_id` / `goods_receipts.reference_id` hôm nay | high | no | `EXISTS` chạy seq scan mỗi dòng phiếu xuất; Báo cáo 6 chậm dần theo dữ liệu | resolved | Đọc migration: `reference_id` được thêm trần ở `1782800000000-StockTakeAdjustmentDocs.ts:30`; index hiện có trên hai bảng chỉ phủ `(organization_id, status)`, `(organization_id, branch_id, status, created_at\|received_at)`, `reason_id`, `target_branch_id`, `provider_id`. T-01-01 thêm hai partial index và ghi `EXPLAIN ANALYZE` trước/sau vào ticket |

## Đo trên dữ liệu thật — `erp_dev`, 2026-09-03

DB đã được dump lại và có dữ liệu vận hành (`goods_issues` 458 dòng, kỳ 09/07/2026–30/08/2026).
Đây là lần đầu chẩn đoán được kiểm chứng bằng số thay vì bằng suy luận.

**Công thức cũ vs mới, toàn kỳ, theo chi nhánh** — 6/18 chi nhánh có chênh lệch **dương** dưới công
thức cũ; dưới công thức mới **toàn bộ 18 chi nhánh đều ≤ 0** (AC-03 đúng trên dữ liệu thật):

| Chi nhánh | Xuất | Thực nhận CŨ | Chênh lệch CŨ | Thực nhận MỚI | Chênh lệch MỚI |
|---|---|---|---|---|---|
| KHO SG | 10.334 | 10.780 | **+446** | 9.801 | −533 |
| Chi Nhánh Nha Trang | 67 | 162 | **+95** | 63 | −4 |
| Chi nhánh MT211 Đà Nẵng | 207 | 246 | **+39** | 206 | −1 |
| Chi nhánh Nguyễn Trãi - Cần Thơ | 644 | 672 | **+28** | 642 | −2 |
| Chi Nhánh cũ không dùng | **22** | **31** | **+9** | 22 | 0 |
| Chi nhánh Quy Nhơn | 171 | 174 | **+3** | 166 | −5 |
| Chi Nhánh Vĩnh Long | 203 | 194 | −9 | 73 | −130 |
| Chi nhánh Buôn Ma Thuật | 297 | 160 | −137 | 159 | −138 |

Dòng "Chi Nhánh cũ không dùng" là **đúng nguyên văn** trường hợp người dùng báo: *"xuất 22 nhập về
31"*. Công thức mới cho 22 / 22 / 0.

**Nguồn của phần dương:** 29 phiếu nhập điều chuyển POSTED có `reference_type` và `reference_id`
NULL — phiếu nhập không gắn với phiếu xuất nào. Dưới công thức cũ chúng cộng thẳng vào "thực nhận"
của chi nhánh nguồn; dưới công thức mới chúng bị bỏ qua vì `received` chỉ đến từ chân xuất.

**Tập kết quả của dialog L3** trên dữ liệu thật: 31 phiếu xuất / 861 đơn vị chưa ai xác nhận nhận.

**AC-01:** `branches` có 23 dòng, 21 đã có `code`, **2 còn NULL** ⇒ AC-01 demo được bằng dữ liệu
thật; backfill của T-01-02 chỉ còn lo hai chi nhánh đó và các chi nhánh do seed tạo.
