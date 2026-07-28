---
feature: export-print
adr_count: 9
---

# Logical design — Xuất khẩu / In

## Approach

Một **payload trung gian, hai bộ render**.

Cả xuất Excel lẫn in ra giấy đều là "lấy dữ liệu đã có, đổ vào một khuôn". Khác biệt duy
nhất là khuôn. Nên thay vì viết exporter cho Excel và renderer cho in một cách riêng rẽ
(cách 7 service hiện tại đang làm, mỗi cái một kiểu), feature này dựng **một kiểu payload
mô tả tài liệu** rồi cắm hai bộ render vào:

```
                          ┌─→ ReportWorkbookBuilder (server, exceljs) → .xlsx
ReportDocumentPayload ────┤
                          └─→ renderReportTableHtml (client) → iframe → window.print()

                          ┌─→ renderVoucherHtml (client) → iframe → window.print()
VoucherPrintPayload ──────┤
                          └─→ voucherToReportDocument (server, adapter thuần) ──→ ExportPipeline (XlsxStreamWriter) → .xlsx
```

Bổ sung 2026-07-27 (AC-23..25, ADR-09): 3 chứng từ kho cần cả Xuất khẩu, không chỉ In.
Vì `VoucherPrintPayload` đã có đủ `title`/`branch`/`lineColumns`/`lines`/`totals`, đường
Excel không dựng thêm workbook builder riêng — nó chuyển `VoucherPrintPayload` thành đúng
hình `ReportDocumentPayload` rồi đi qua `ExportPipeline` sẵn có của US-01, với một
`StaticRowsFetcher` (một lô dữ liệu đã có sẵn trong RAM — chứng từ đã được `getById` nạp
xong, không có gì để phân trang hay đếm).

Riêng **đường xuất Excel** không dừng ở "dựng payload rồi đưa builder": payload đầy đủ
của một báo cáo kỳ rộng không được phép nằm trọn trong RAM. Nên đường export là một
pipeline ba mảnh ghép thay được (ADR-06):

```
ExportPipeline
 ├─ Fetcher  ← SingleShotFetcher          (buildData 1 lần, có COUNT chặn trước)
 │            TimePartitionKeysetFetcher  (cửa sổ thời gian + keyset cursor)
 │            StaticRowsFetcher           (rows đã có sẵn trong RAM — 1 chứng từ, UOW-08)
 │            <bất kỳ nguồn nào khác>     (sổ quỹ UOW-05 tự cấp fetcher)
 ├─ Writer   ← XlsxStreamWriter           (ExcelJS.stream.xlsx.WorkbookWriter)
 └─ Sink     ← HttpResponseSink           (ghi thẳng ra res; S3 để ngỏ)
```

Ba mảnh này là câu trả lời cho hai khiếm khuyết của bản UOW-01: fetch/render/sink bị hàn
cứng thành một chuỗi không thay được (UOW-05 đã phải đi vòng — A-08), và không có chiến
lược fetch nào cả (A-18).

Ba điều làm nên phần lớn giá trị tái sử dụng:

1. **`ReportDocumentPayload` dựng đúng một lần**, từ `ReportDefinition` sẵn có. Vì bốn
   miền báo cáo đã cùng hợp đồng `buildColumns` + `buildData` (§2 architecture map), một
   service duy nhất phục vụ được cả bốn — và mọi báo cáo thêm về sau tự có export mà
   không cần viết thêm dòng nào.
2. **`ReportWorkbookBuilder` sở hữu toàn bộ phần trang trí workbook** — khối tiêu đề chi
   nhánh, dòng tiêu đề, dòng bộ lọc, style header, freeze pane, autofilter, `numFmt`,
   `applyWorkbookFont`. Đây chính là khối đang bị chép ở 7 chỗ. Bảy exporter cũ **không**
   bị viết lại trong feature này, nhưng builder được thiết kế để chúng chuyển sang được.
3. **`renderVoucherHtml` là một khuôn duy nhất, dữ liệu lái**, không phải 7 mẫu. Cả 7
   loại chứng từ đều cùng bộ xương: đầu trang → khối thông tin chung → bảng dòng → tổng
   → chỗ ký. Khác nhau chỉ ở nhãn và tập cột, nên chúng nằm trong payload chứ không nằm
   trong template.

Đường in tái dùng nguyên pattern `InvoicePrinter` của pos-web: HTML tự chứa ghi vào
iframe ẩn rồi `window.print()`. Không thêm dependency ở cả ba package.

## Alternatives rejected

| Option | Why not |
|---|---|
| Server render PDF bằng puppeteer (khảo sát §9.3 đề xuất) | Thêm ~300MB Chromium vào image API, phải cài font tiếng Việt vào container, tăng cold start — trong khi repo đã có 2 đường in chạy production không cần gì thêm. Xem ADR-02 |
| Client render PDF bằng `jspdf` (đã có sẵn ở backoffice) | `jspdf` vẽ theo toạ độ mm, tự phân trang. Hợp cho tem mã cố định kích thước (`render-barcode-labels-pdf.ts`), tệ cho phiếu nhiều dòng cần ngắt trang. HTML/CSS `@media print` xử lý ngắt trang miễn phí |
| Exporter riêng cho từng loại báo cáo (theo cách 7 service hiện tại) | Đúng thứ feature này sinh ra để dừng lại. Hợp đồng báo cáo đã generic — viết riêng là bỏ phí |
| Server sinh HTML rồi trả về cho FE in | Bắt server gánh khâu trình bày, và mỗi lần đổi nhãn/khổ giấy phải deploy lại API. Payload JSON để FE render giữ ranh giới đúng chỗ |
| Dùng `report_templates` làm nguồn cột khi export | Hai shell FE lưu cấu hình cột ở hai nơi (§3 architecture map); client gửi `columns[]` đúng ở cả hai mà không phải hợp nhất trước. Xem ADR-04 |
| Export bất đồng bộ qua job + WebSocket | `assertUnderRowCap` đã chặn ở 50.000 dòng nên request đồng bộ có trần xác định. `AsyncReportService` sẵn có lưu job trong `Map` in-memory, mất khi restart — xây lên đó là nợ. Xem A-02 |
| Bulk export ở cấp danh sách chứng từ | MISA cũng không có; chưa có nhu cầu thật |
| Đặt keyset fetcher **bọc ngoài** `buildData` (đúng như code mẫu) | `buildData` không phân trang ở SQL — nó `getMany()` toàn bộ tập lọc rồi `rows.slice` trong RAM (`invoice-order-listing.report.ts:171,255`; `report-data.util.ts:74`). Gọi nó một lần cho mỗi partition × mỗi page nghĩa là quét lại toàn bộ partition mỗi page → tải DB tăng gấp N lần chứ không giảm, và totals thành tổng theo từng partition → sai. Keyset phải nằm **trong** nguồn dữ liệu. Xem ADR-07 |
| Keyset hoá toàn bộ ~20 report definition | 15/20 report là tổng hợp/pivot (tồn đầu–cuối kỳ, group theo kho, `business-results`): một dòng là kết quả cộng gộp cả kỳ, không phải một bản ghi có `(createdAt, id)` để làm con trỏ. Cắt theo cửa sổ thời gian rồi nối lại cho ra số khác. Chốt scope B ngày 2026-07-27: chỉ report kiểu liệt kê mới có `exportSource` |
| Port nguyên 4 tầng strategy của project tham chiếu (Fetcher/DataSource/FileWriter/Upload) | `DataSourceStrategy` ở đó là lớp đệm giữa fetcher và writer để đổi đích (S3/file). Ở đây đích luôn là stream, nên Sink cấp `Writable` là đủ — 3 mảnh thay vì 4, và thêm S3 sau này vẫn là viết một Sink |
| Buffer trọn workbook rồi `writeBuffer()` (bản UOW-01 đang làm) | Giữ cả cây worksheet lẫn buffer nén trong RAM cùng lúc. `WorkbookWriter` có sẵn trong exceljs 4.4, không thêm dependency. Xem ADR-08 |

## Domain model

| Type | Nơi khai báo | Fields | Ghi chú |
|---|---|---|---|
| `ReportDocumentPayload` | `packages/shared-interfaces/src/reporting/document-payload.ts` (new) | `title`, `branch: {name, address, phone} \| null`, `subtitleLines: string[]`, `columns: DocumentColumn[]`, `rows: ReportRow[]`, `totals: ReportRow \| null` | Đủ để dựng workbook lẫn HTML; không chứa gì thuộc về cách trình bày |
| `DocumentColumn` | cùng file | `col`, `label`, `type: ReportColumnDataType`, `width?`, `align?` | `label` = `displayName` người dùng đặt, fallback `ReportColumnHeader.name` |
| `VoucherPrintPayload` | `packages/shared-interfaces/src/printing/voucher-payload.ts` (new) | `kind: VoucherKind`, `paper: 'A4' \| 'A5'`, `title`, `docNo`, `docDate`, `branch`, `info: InfoRow[]`, `lineColumns: DocumentColumn[]`, `lines: ReportRow[]`, `totals`, `amountInWords?`, `signatures: string[]` | Một kiểu cho cả 7 loại phiếu |
| `VoucherKind` | cùng file | enum: `GOODS_RECEIPT`, `GOODS_ISSUE`, `TRANSFER_ORDER`, `CASH_RECEIPT`, `CASH_PAYMENT`, `BANK_RECEIPT`, `BANK_PAYMENT` | |

Không có bảng mới, không migration. Cả hai payload là kiểu truyền tải, không lưu.

### Kiểu của export pipeline

Thuần backend, không lên `@erp/shared-interfaces` — FE không bao giờ thấy chúng. Tất cả
nằm ở `apps/api/src/modules/reporting/report-core/export/`.

| Type | Fields | Ghi chú |
|---|---|---|
| `KeysetCursor` | `at: string`, `id: string` | `at` là **text timestamptz đầy đủ độ chính xác** (lấy qua `::text`), không phải `Date` — `Date` của JS mất phần micro giây và làm con trỏ nhảy dòng |
| `TimePartition` | `from?: Date`, `to?: Date` | Nửa mở `[from, to)`. Thiếu một đầu ⇒ một cửa sổ mở duy nhất, keyset vẫn chạy |
| `FetchPageArgs` | `partition`, `cursor: KeysetCursor \| null`, `size: number` | |
| `FetchPageResult` | `rows: ReportRow[]`, `nextCursor: KeysetCursor \| null`, `hasMore: boolean` | `hasMore = rows.length === size`; không có `COUNT(*)` nào |
| `ExportFetcher` | `drain(push: (rows) => Promise<void>): Promise<ReportRow \| null>` | Trả dòng tổng cộng dồn; `push` được gọi theo đúng thứ tự xuất |
| `ExportWriter` | `begin(header, columns)`, `rows(rows)`, `end(totals)` | |
| `ExportSink` | `stream(): Writable`, `finalize(): Promise<void>` | HTTP: đặt header rồi `res`; S3 sau này: upload stream |
| `ReportExportSource<TDto>` | `range(dto)`, `summable(columns): string[]`, `page(dto, actor, args): Promise<FetchPageResult>` | Capability **tuỳ chọn** trên `ReportDefinition`. `summable` cần vì `ReportColumnHeader` không có cờ additive, còn `NON_ADDITIVE` là tri thức của từng report (`document-detail.report.ts`) |

## Contracts

### POST `/reports/{invoice|inventory|profit|debt}/export`

Body = search DTO của miền đó, cộng thêm một field:

```jsonc
{
  "reportType": "inventory-stock-summary",
  "columns": ["item.sku", "item.name", "closing.qty"],   // đã có sẵn, mang cả thứ tự
  "filters": { /* như POST search */ },
  "columnFilters": [ /* như POST search */ ],
  "columnLabels": { "closing.qty": "SL tồn cuối" }        // NEW, optional
}
```

Response 200: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
`Content-Disposition: attachment; filename="<slug-báo-cáo>.xlsx"`.

Không nhận `page` / `limit` — export luôn là toàn bộ tập kết quả.

Response được **stream**, không buffer: header đi trước, các dòng chảy ra khi từng trang
keyset về tới. Hệ quả phải chấp nhận: một lỗi xảy ra sau khi byte đầu đã gửi thì không
chuyển thành HTTP 4xx/5xx được nữa — kết nối bị huỷ giữa chừng và trình duyệt báo tải
lỗi. Nên mọi lỗi kiểm tra được (report type, cột lạ, vượt trần dòng) đều phải bắn **trước**
byte đầu tiên; đó là lý do `COUNT` chặn trần chạy trước khi mở writer (ADR-08).

### Cấu hình

Đọc từ env, có mặc định — không thêm bảng cấu hình nào.

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `EXPORT_PARTITIONS` | 5 | Số cửa sổ thời gian chia từ `[from, to]` |
| `EXPORT_PARTITION_PARALLEL` | 3 | Số partition drain đồng thời. Đây cũng là số connection Postgres một request export chiếm — pool là pool chung của cả API nên mặc định để thấp; `1` = tuần tự, RAM hằng số |
| `EXPORT_BATCH_SIZE` | 1000 | Số dòng mỗi trang keyset |
| `EXPORT_BUFFER_HIGH_WATER` | 20000 | Trần dòng đang chờ flush. Chạm trần thì các drain đi trước dừng lại chờ con trỏ flush tiến lên — không có nó, drain song song giữ gần như toàn bộ dữ liệu trong RAM và mục tiêu của cả bản rework này mất sạch |
| `EXPORT_BATCH_TIMEOUT_MS` | 30000 | Trần thời gian một trang keyset |

### POST `/reports/{domain}/print-payload`

Body y hệt route export. Response 200 `application/json` = `ReportDocumentPayload`.
Tồn tại để bản in dùng chung đúng một đường dựng dữ liệu với bản Excel.

### GET `/<voucher>/:id/print-payload`

Bảy route, một cho mỗi loại, gắn cạnh route `GET /:id` sẵn có và dùng lại đúng
permission của nó:

| Route | Permission |
|---|---|
| `/goods-receipts/:id/print-payload` | `goods_receipt.read` |
| `/inventory/goods-issues/:id/print-payload` | `goods_issue.read` |
| `/inventory/transfer-orders/:id/print-payload` | quyền của `GET :id` hiện tại |
| `/cash-receipts/:id/print-payload` | `accounting.cash_receipt.read` |
| `/cash-payments/:id/print-payload` | `accounting.cash_payment.read` |
| `/bank-receipts/:id/print-payload` | quyền của `GET :id` hiện tại |
| `/bank-payments/:id/print-payload` | quyền của `GET :id` hiện tại |

Response 200 = `VoucherPrintPayload`.

### GET `/<voucher>/:id/export`

Ba route, cạnh `print-payload`, chỉ cho 3 chứng từ kho (ADR-09):

| Route | Permission |
|---|---|
| `/goods-receipts/:id/export` | `goods_receipt.read` |
| `/inventory/goods-issues/:id/export` | `goods_issue.read` |
| `/inventory/transfer-orders/:id/export` | quyền của `GET :id` hiện tại |

Response 200: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, cùng
cặp header tải file với route export báo cáo. Không nhận body — chứng từ đã có `id`,
không có bộ lọc nào để truyền. Cùng hành vi 404 với `print-payload` khi chứng từ ngoài
org/branch (AC-25).

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| Cấu hình cột báo cáo (storage shell) | `localStorage[storageKey]` — giữ nguyên | Máy người dùng |
| Cấu hình cột báo cáo (generic shell) | `report_templates` qua `ReportTableConfigSync` — giữ nguyên | Tổ chức |
| `columns[]` gửi khi export/in | Không lưu; client dựng từ state đang hiển thị tại thời điểm bấm nút | Một request |
| Payload in chứng từ | Không lưu; fetch mỗi lần bấm In | Một lần in |
| Buffer .xlsx | Không lưu; stream thẳng ra response | Một request |

Feature này **không sở hữu state mới nào** — đó là chủ ý, và là lý do nó không cần
migration lẫn cache invalidation.

## Error taxonomy

| Condition | HTTP | Exception | UI |
|---|---|---|---|
| `reportType` không có trong registry | 400 | `BadRequestException` | toast lỗi, giữ nguyên màn hình |
| Khoá cột không có trong catalog | 400 | `BadRequestException` kèm danh sách khoá sai (dùng lại `assertKnownColumns`) | toast lỗi |
| Kết quả vượt 50.000 dòng (đường single-shot) | 400 | `assertUnderRowCap` — nhưng gọi trên **`COUNT` chạy trước**, không phải trên `result.total` sau khi đã materialize như hiện tại (`stock-summary.report.ts:127`) | toast: yêu cầu thu hẹp kỳ/bộ lọc |
| Vượt trần dòng, đường keyset | — | Không có trần: report có `exportSource` không nạp trọn tập vào RAM nên trần mất lý do tồn tại | — |
| Một trang keyset quá `EXPORT_BATCH_TIMEOUT_MS` | 500 (nếu chưa gửi byte nào) / huỷ kết nối (nếu đã gửi) | `Error` từ pipeline, log `error` kèm partition + cursor | toast lỗi tải file |
| Thiếu permission | 403 | `PermissionGuard` | toast lỗi |
| Chứng từ không thuộc org/branch | 404 | `NotFoundException` từ `findOrFail` sẵn có | toast lỗi |
| Trình duyệt chặn cửa sổ in | — | — | toast hướng dẫn cho phép popup (như `printBarcodeLabels` đang làm) |
| Tải file thất bại | — | — | toast lỗi; không để nút kẹt trạng thái loading |

Không có mã lỗi mới. Ba lỗi phía server đều tái dùng exception có sẵn.

## Cache & offline

Export và print-payload **không cache**. `SearchInventoryReportHandler` đang cache kết quả
search 45s (`CACHE_NAMESPACE='inventory-reports'`); export cố tình đi thẳng `buildData`
để tránh trả file lệch với bảng người dùng vừa lọc lại. Không có hành vi offline — cả hai
chức năng đều cần mạng.

## Observability

- Mỗi request export ghi một dòng log ở mức `log`: `reportType`, `organizationId`, đường
  fetch đã dùng (`single-shot` \| `keyset`), số cột, số dòng, số mili-giây. Đây là dữ liệu
  để quyết định A-02 (có cần job bất đồng bộ không) bằng số thật thay vì phỏng đoán.
- Đường keyset ghi thêm một dòng mỗi partition khi drain xong: chỉ số partition, số trang,
  số dòng, mili-giây. Đây là cách duy nhất thấy được `EXPORT_PARTITIONS` /
  `EXPORT_PARTITION_PARALLEL` đang đặt đúng hay sai mà không phải đoán.
- Lỗi vượt trần dòng log ở mức `warn` kèm `total` thực tế — nếu dòng này xuất hiện đều với
  cùng một `reportType`, đó là danh sách chờ để viết `exportSource` cho report đó.
- Không thêm metric Prometheus mới ở bản đầu.

## ADRs

### ADR-01 — Một payload trung gian cho cả xuất khẩu và in
**Context:** Xuất Excel và in giấy cần cùng dữ liệu, cùng tập cột, cùng khối tiêu đề.
Bảy exporter hiện có, mỗi cái tự đi từ query đến file, nên không cái nào dùng lại được.
**Decision:** Dựng `ReportDocumentPayload` / `VoucherPrintPayload` làm mặt cắt. Mọi
đường lấy dữ liệu dừng ở payload; mọi bộ render bắt đầu từ payload.
**Consequences:** Thêm một lớp kiểu và một route `print-payload` cho mỗi nhóm. Đổi lại,
thêm định dạng đầu ra sau này (PDF, email, ESC/POS) là viết một renderer, không đụng
đường lấy dữ liệu. Đây cũng là điều làm cho `renderVoucherHtml` gom được 7 loại phiếu
vào một khuôn.
**Status:** accepted

### ADR-02 — In bằng HTML → iframe → `window.print()`, không dùng PDF server
**Context:** Khảo sát MISA đề xuất puppeteer. Repo đã có sẵn hai đường in chạy
production: `renderInvoiceHtml` + `BrowserWindowInvoicePrinter` ở pos-web, và
`jspdf` → Blob → tab mới ở backoffice.
**Decision:** Dùng lại pattern pos-web. FE nhận payload JSON, dựng HTML tự chứa, ghi vào
iframe ẩn, gọi `window.print()`.
**Consequences:** Không thêm dependency, không tăng kích thước image API, không phải cài
font tiếng Việt vào container. Đổi lại: không có file PDF để lưu hay gửi mail, và bố cục
phụ thuộc engine in của trình duyệt — chấp nhận được vì nhu cầu hiện tại là in ra giấy để
ký. Nếu sau này cần PDF đính kèm email, ADR-01 cho phép cắm renderer mới mà không sửa
đường lấy dữ liệu.
**Status:** accepted — chốt bởi Akenzy, 2026-07-27

### ADR-03 — Export gọi `buildData` một lần với `limit` lớn
**Context:** DTO search chặn `limit` ở `@Max(500)`. Exporter cũ
(`StockSummaryExportService.loadAllRows`) lặp trang 200 dòng một.
**Decision:** Gọi `def.buildData({...dto, page: 1, limit: MAX_REPORT_ROWS}, actor)` đúng
một lần. `@Max(500)` chỉ ràng buộc DTO HTTP, không ràng buộc `buildData`.
**Consequences:** Không có vòng lặp phân trang, và totals lấy trực tiếp từ `buildData` vì
cả bốn miền đều cộng tổng trên **toàn bộ** dòng đã lọc rồi mới cắt trang (A-01). Ràng
buộc kéo theo: mọi `ReportDefinition` mới phải giữ đúng thứ tự materialize → filter →
totals → slice. Nếu một report tương lai đẩy phân trang xuống SQL, nó phải tự lo export.
**Status:** **superseded** bởi ADR-06/07/08 — Akenzy, 2026-07-27. Quyết định vẫn đúng về
mặt *totals* (A-01 vẫn confirmed), nhưng sai khi coi "một lần gọi" là chiến lược fetch:
`buildData` nạp trọn tập vào RAM, và ở invoice/profit/debt không có trần nào chặn. Đường
single-shot còn sống nhưng chỉ dành cho report tổng hợp, và phải có `COUNT` chặn trước.

### ADR-06 — Export là pipeline ba mảnh thay được, không phải một chuỗi hàm
**Context:** Bản UOW-01 hàn `buildPayload` → `buildReportWorkbook` → `sendXlsx` thành một
chuỗi cố định. Hệ quả xuất hiện ngay ở slice kế tiếp: UOW-05 (sổ quỹ) không nằm trong
report registry nên không dùng được `ReportExportService`, chỉ mượn được workbook builder
— rủi ro A-08 chính là triệu chứng của thiết kế này.
**Decision:** `ExportPipeline(fetcher, writer, sink)`. Fetcher quyết định dòng ở đâu ra,
Writer quyết định byte thành hình thế nào, Sink quyết định byte đi đâu. Nguồn nào cấp
được `ExportFetcher` thì dùng được cả pipeline.
**Consequences:** Sổ quỹ (UOW-05) cấp fetcher của nó và hết vòng vo — A-08 mất lý do tồn
tại. Thêm CSV = viết một Writer; xuất ra S3 cho export bất đồng bộ (A-02) = viết một Sink,
không đụng fetcher. Đổi lại: ba interface và một lớp điều phối cho thứ mà một hàm cũng
chạy được hôm nay — trả trước để slice sau không phải đi vòng.
**Status:** accepted — chốt bởi Akenzy, 2026-07-27

### ADR-07 — Keyset + phân mảnh thời gian nằm **trong** report definition, không nằm ở tầng export
**Context:** Đề xuất ban đầu là bọc `TimePartitionKeysetFetcher` quanh `buildData`, theo
đúng project tham chiếu. Nhưng ở đó nguồn là một list-endpoint phân trang thật ở SQL;
ở đây `buildData` `getMany()` toàn bộ rồi `slice` trong RAM.
**Decision:** Thêm capability **tuỳ chọn** `exportSource: ReportExportSource` lên
`ReportDefinition`. Có `exportSource` → pipeline dùng `TimePartitionKeysetFetcher`, con trỏ
`(createdAt|issuedAt DESC, id DESC)`, chia `[from, to]` thành `EXPORT_PARTITIONS` cửa sổ
nửa mở, drain tối đa `EXPORT_PARTITION_PARALLEL` cái đồng thời nhưng **flush theo đúng thứ
tự partition** để file vẫn sắp xếp toàn cục. Không có → `SingleShotFetcher` + `COUNT` chặn
trước. Bản đầu viết `exportSource` cho `invoice-order-listing` và `document-detail`.
**Consequences:** Keyset đặt đúng chỗ nó cắt được tải DB: aux load theo `In(...)` co từ
50.000 id xuống `EXPORT_BATCH_SIZE` id một lần, và không còn `OFFSET` để trượt dòng khi
có insert đồng thời. 15 report tổng hợp giữ nguyên đường cũ — chúng không có `(at, id)`
để làm con trỏ. Ràng buộc kéo theo: `exportSource.page` phải sắp đúng
`ORDER BY at DESC, id DESC` và trả `at` dạng text `::text`, sai một trong hai thì dòng bị
nhảy hoặc lặp. Totals đường keyset là tổng cộng dồn theo `summable(columns)`, nên chỉ đúng
với cột cộng được — cột phần trăm/đơn giá vẫn để trống như `NON_ADDITIVE` hiện tại. Thứ tự
dòng trong file sẽ hoà theo `id` thay vì `code` ở các dòng trùng dấu thời gian — lệch với
màn hình ở đúng nhóm đó, chấp nhận được.
**Status:** accepted — chốt bởi Akenzy, 2026-07-27 (scope B)

### ADR-08 — Ghi xlsx bằng `WorkbookWriter` stream, và chặn trần bằng `COUNT` trước khi materialize
**Context:** `buildReportWorkbook` hiện giữ cả cây worksheet lẫn `writeBuffer()` trong RAM.
Trần 50.000 dòng thì chỉ inventory-reports có, và `assertUnderRowCap(result.total)` chạy
**sau** khi dòng đã nằm trong RAM — nó bảo vệ response, không bảo vệ tiến trình.
**Decision:** Writer dùng `ExcelJS.stream.xlsx.WorkbookWriter` ghi thẳng vào stream của
Sink. Đường single-shot chạy `COUNT` trước, `assertUnderRowCap` trên số đó, rồi mới
materialize. Áp cho cả bốn miền, không chỉ inventory.
**Consequences:** RAM của một export không còn tỉ lệ với số dòng ở phía writer, và trần
dòng bắt đầu bảo vệ đúng thứ nó nên bảo vệ. Đổi lại ba thứ: (1) đã stream thì không đổi
được lỗi giữa chừng thành mã HTTP — mọi kiểm tra phải xong trước byte đầu; (2)
`WorkbookWriter` không quay lại sửa ô đã ghi, nên bề rộng cột và căn lề phải quyết trước
khi ghi dòng đầu, không tính từ dữ liệu; (3) drain song song vẫn giữ dòng của các partition
đi trước con trỏ flush trong RAM — `EXPORT_BUFFER_HIGH_WATER` là thứ chặn nó, và
`EXPORT_PARTITION_PARALLEL=1` là cấu hình duy nhất cho RAM hằng số tuyệt đối.
**Status:** accepted — chốt bởi Akenzy, 2026-07-27

### ADR-04 — Client gửi `columns[]`; server không đọc cấu hình cột
**Context:** Cấu hình cột tồn tại ở hai nơi — `localStorage` cho 8 trang storage report,
`report_templates` cho shell generic.
**Decision:** Request export/print mang theo danh sách cột (đã đúng thứ tự) và
`columnLabels` cho tên người dùng đặt lại. Server chỉ kiểm tra cột có trong catalog.
**Consequences:** Kết quả luôn khớp đúng cái đang thấy trên màn hình, ở cả hai shell,
không phải hợp nhất hai nguồn trước. Server không giữ trạng thái. Đổi lại: hai người mở
cùng báo cáo có thể xuất ra hai file khác nhau — đúng như mong đợi, vì cấu hình cột vốn
đã là của từng người.
**Status:** accepted — chốt bởi Akenzy, 2026-07-27

### ADR-09 — Xuất Excel chứng từ kho tái dùng ReportDocumentPayload + ExportPipeline, không dựng kiểu/writer riêng
**Context:** Khảo sát MISA và người dùng xác nhận 2026-07-27: 3 chứng từ kho cần cả Xuất
khẩu lẫn In (AC-23..25), không chỉ In như bản đầu (ADR-05) đã chốt. `VoucherPrintPayload`
(ADR-05) đã có `title`, `branch`, `lineColumns`, `lines`, `totals` — đúng những gì
`ExportDocumentHeader` + `DocumentColumn[]` + `ReportRow[]` của US-01 cần, chỉ thiếu đúng
hình dạng.
**Decision:** Một adapter thuần `voucherToReportDocument(payload: VoucherPrintPayload):
{header, columns, rows, totals}` map lại đúng 4 field đó (bỏ `signatures`/`amountInWords`
— không thuộc về một bảng tính). Route export gọi cùng mapper `print-payload` đã dựng
(T-03-02) rồi đưa qua adapter, chạy qua `ExportPipeline(StaticRowsFetcher, XlsxStreamWriter,
HttpResponseSink)` y hệt US-01. `StaticRowsFetcher` chỉ `push` đúng một lô rows đã có sẵn
trong RAM và trả `totals` — không có gì để phân trang hay đếm vì chứng từ đã được `getById`
nạp trọn trước khi vào route.
**Consequences:** Không thêm kiểu payload mới, không thêm Writer/Sink mới (đúng AC-24) —
chỉ một adapter nhỏ và một fetcher tầm thường. Đổi lại: file Excel của chứng từ không có
`amountInWords` hay ô ký, vì đó là nội dung dành cho giấy in, không dành cho bảng tính; nếu
sau này cần bản Excel "y hệt phiếu giấy" thì đó là một renderer khác, không phải mở rộng
`ReportDocumentPayload`.
**Status:** accepted — chốt bởi Akenzy, 2026-07-27

### ADR-05 — Một khuôn HTML cho cả 7 loại chứng từ
**Context:** MISA có 2–4 mẫu in mỗi loại phiếu. Bản đầu chốt 1 mẫu mỗi loại (A4 cho
phiếu kho, A5 cho phiếu quỹ).
**Decision:** Một `renderVoucherHtml(payload)` duy nhất, lái bằng dữ liệu. Nhãn tiêu đề,
tập cột dòng hàng, nhãn đối tượng, chỗ ký nằm trong `VoucherPrintPayload` do backend dựng.
**Consequences:** Thêm loại phiếu = viết một mapper payload, không đụng template. Thêm khổ
giấy = thêm một khối CSS `@page`. Đổi lại: mẫu in nào lệch hẳn bộ xương (ví dụ mẫu có mã
vạch từng dòng) sẽ không nhét vừa khuôn này và cần renderer riêng — chấp nhận, vì các mẫu
đó nằm ngoài phạm vi bản đầu.
**Status:** accepted
