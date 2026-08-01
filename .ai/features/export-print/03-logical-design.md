---
feature: export-print
adr_count: 11
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
                          └─→ voucherToReportDocument (server, adapter thuần) ──→ ExportPipeline (VoucherXlsxWriter) → .xlsx
```

Sửa 2026-07-30 (US-07, ADR-10/11): đường Excel của chứng từ đổi từ `XlsxStreamWriter` sang
`VoucherXlsxWriter` — cùng pipeline, cùng fetcher, cùng sink, khác đúng một mảnh. Cả hai Writer đọc
chuẩn trình bày từ `export/xlsx-style.ts`.

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
| `VoucherPrintPayload` | `packages/shared-interfaces/src/printing/voucher-payload.ts` (new) | `kind: VoucherKind`, `paper: 'A4' \| 'A5'`, `title`, `docNo`, `docDate`, `branch`, `info: InfoRow[]`, `lineColumns: DocumentColumn[]`, `lines: ReportRow[]`, `totals`, `amountInWords?`, `totalsLabel?`, `signatures: string[]` | Một kiểu cho cả 7 loại phiếu. **Sửa 2026-07-30 (US-07):** thêm `totalsLabel?` ("Tổng"/"Cộng"); `docDate` siết ngữ nghĩa sang dạng dài không kèm chữ "Ngày" (`"28 tháng 7 năm 2026"`) để cả hai renderer in ra `Ngày ${docDate}`; `amountInWords` bắt đầu được sinh giá trị cho phiếu nhập/xuất kho, không còn chỉ dành cho phiếu quỹ |
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

## House style (nguồn: `examples/ERP`, đo 2026-07-30)

Số liệu dưới đây lấy trực tiếp từ `xl/styles.xml` + `xl/worksheets/sheet1.xml` của 4 file mẫu, không
phải ước lượng bằng mắt. Đây là đặc tả mà `xlsx-style.ts` phải mã hoá.

### Chung cho mọi workbook

| Thuộc tính | Giá trị |
|---|---|
| Font | Times New Roman (đã là `GENERATED_XLSX_FONT_NAME`) |
| Cỡ thân / tiêu đề cột / tiêu đề tài liệu | 12 / 12 bold / 18 bold |
| Định dạng số | `#,##0` (`numFmtId 177`) |
| Viền | `thin` bốn cạnh cho ô tiêu đề cột, ô dữ liệu, ô dòng tổng |
| AutoFilter / freeze pane | **không có ở cả 4 mẫu** |
| pageSetup | `orientation="portrait"` |

### Riêng workbook báo cáo (`export_Doanh_thu_theo_mat_hang.xlsx`)

```
R1  tên chi nhánh            bold 12, trái, không merge
R2  địa chỉ                  12, trái
R3  điện thoại               12, trái          ← số trần, KHÔNG có tiền tố "SĐT:"
R4  TIÊU ĐỀ                  bold 18, giữa, merge A..lastCol
R5  Từ ngày: … Đến ngày: …   italic 12, giữa, merge
R6  tóm tắt bộ lọc           italic 12, giữa, merge
R7  (trống)
R8  tiêu đề cột              bold 12, nền FFFDE9D9, viền, giữa+middle+wrapText
R9+ dữ liệu                  12, viền; chuỗi trái, số phải #,##0
Rn  dòng tổng                bold 12, nền FFFDE9D9, viền, số phải #,##0, ô nhãn để trống
```

### Riêng workbook chứng từ (3 mẫu `phieu_*.xlsx`)

```
R1  tên chi nhánh            bold 12, trái
R2  địa chỉ                  12, trái
R3  (trống)
R4  TIÊU ĐỀ                  bold 18, giữa, merge          ← KHÔNG kèm số phiếu
R5  Ngày <d> tháng <M> năm <yyyy>   bold italic 12, giữa, merge
R6  Số: <docNo>              bold 12, giữa, merge
R7+ <label>: <value>         bold 12, trái, merge — mỗi InfoRow một dòng
    (+ "Cửa hàng xuất/nhận điều chuyển: …" khi chứng từ sinh từ lệnh điều chuyển)
R   (trống)
H   tiêu đề cột              bold 12, viền, giữa+middle, KHÔNG nền
D   dữ liệu                  12, viền; STT giữa, chuỗi trái, số phải #,##0
T   dòng tổng                nhãn "Tổng"/"Cộng" merge bên trái + số bold phải, viền
W   Số tiền viết bằng chữ: … bold, merge hết bề rộng
    (2 dòng trống)
S1  Ngày.......tháng.......năm............   italic 12, căn phải
S2  5 nhãn ô ký              bold 12, giữa, wrapText, chiều cao dòng 31.5
S3  (Ký, họ tên) ×5          italic 12, giữa
```

Tên sheet = tiêu đề chứng từ (`Phiếu nhập kho`), không phải `docNo`.

Nhãn 5 ô ký: `Người lập phiếu`, `Người nhận hàng`, `Thủ kho`, `Kế toán trưởng`, `Giám đốc`.
Nhãn dòng tổng: `Tổng` cho nhập kho và chuyển kho, `Cộng` cho xuất kho (MISA đặt vậy).

### Tập cột từng loại chứng từ

Sau khi bỏ các cột mẫu để ẩn và repo không có dữ liệu (A-20):

| Loại | Cột |
|---|---|
| Nhập kho | STT, Mã SKU, Tên hàng hóa, ĐVT, Vị trí, SL, Đơn giá, Thành tiền, Ghi chú |
| Xuất kho | STT, Mã SKU, Tên hàng hóa, ĐVT, Vị trí, Số lượng, Đơn giá, Thành tiền, Ghi chú |
| Chuyển kho | STT, Mã SKU, Tên hàng hóa, Kho xuất, Vị trí xuất, Kho nhập, ĐVT, SL, Ghi chú |

Tiêu đề chuyển kho: `PHIẾU CHUYỂN KHO`.

### Bản in (4 mẫu `.pdf`)

Mẫu PDF trùng khít bố cục Excel, chỉ bỏ các cột mẫu đang ẩn — xác nhận nguyên tắc ADR-01. Bản in
phải đổi theo: font Times New Roman (đang Arial), khối chi nhánh **căn trái** (đang căn giữa), ngày
và số phiếu ở **hai dòng riêng căn giữa** (đang một dòng `Số: X — Ngày: Y`), khối info **xếp dọc
full width** (đang flex 2 cột), tiêu đề bảng **không nền xám**, dòng tổng có nhãn, chuỗi
`Số tiền viết bằng chữ:` (đang `Số tiền bằng chữ:`), thêm dòng `Ngày.......tháng.......năm............`
căn phải, và **5** ô ký (đang 3).

### Sai lệch có chủ ý so với mẫu

| Mẫu | Ta làm | Lý do |
|---|---|---|
| Tiêu đề cột báo cáo merge 2 dòng (`A8:A9`) | 1 dòng + `wrapText` + tăng chiều cao | `WorkbookWriter` không quay lại ô đã commit (ADR-08); merge chéo dòng đòi giữ 2 dòng chưa commit. Xem A-22 |
| Nhãn cột kèm chú thích công thức (`Số lượng bán\n(1)`) | Giữ nhãn từ catalog | Nhãn thuộc về `ReportColumnHeader` + `columnLabels` người dùng đặt (ADR-04) |
| Giữ cột ẩn Serials / Giá bán / Thành tiền giá bán | Bỏ hẳn | A-20, người dùng chốt |

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
**Status:** **superseded** bởi ADR-10 — Akenzy, 2026-07-30. Phần "tái dùng `ExportPipeline` và
`ReportDocumentPayload`" vẫn đúng và vẫn giữ. Phần sai là câu "`amountInWords` và ô ký không thuộc
về một bảng tính": cả ba mẫu `.xlsx` chứng từ của MISA đều có cả hai, và người dùng dùng chính file
Excel đó để in ký. Hệ quả kéo theo: ràng buộc "không có Writer mới" (AC-24) cũng bị bỏ — xem ADR-10.

### ADR-10 — Chứng từ có Writer Excel riêng, mang cả tiền-bằng-chữ và khối ký
**Context:** ADR-09 chốt file Excel chứng từ chỉ là bảng dữ liệu, và ràng buộc "không viết Writer
mới" (AC-24) là thứ làm cho UOW-08 rẻ. Ngày 2026-07-30 người dùng đưa 3 file `.xlsx` chứng từ xuất
thật từ MISA eShop. Cả ba đều có: tiêu đề / ngày / số phiếu là **ba dòng riêng căn giữa**, khối
thông tin chung **in đậm căn trái**, dòng tổng có **nhãn** (`Tổng` / `Cộng`), dòng
`Số tiền viết bằng chữ: …`, dòng `Ngày.......tháng.......năm............`, và **khối 5 ô ký** kèm
`(Ký, họ tên)`. Nghĩa là người dùng in ký từ chính file Excel — giả định "bảng tính không phải giấy
ký" của ADR-09 sai.

**Decision:** Viết `VoucherXlsxWriter implements ExportWriter`, đứng cạnh `XlsxStreamWriter`, dùng
chung hằng số trình bày ở `export/xlsx-style.ts`. Ba controller chứng từ đổi Writer, giữ nguyên
`ExportPipeline`, `StaticRowsFetcher`, `HttpResponseSink`. `voucherToReportDocument` thôi ghép
`docNo` vào `title` và thôi đổ `info` vào `subtitleLines`; phần "chrome" của chứng từ (số phiếu,
dòng ngày, info, nhãn tổng, tiền-bằng-chữ, ô ký) đi thẳng vào constructor của Writer từ
`VoucherPrintPayload`.

**Consequences:** Chứng từ và báo cáo có bộ xương khác nhau thật, nên chúng là hai Writer chứ không
phải một Writer với cờ `if kind === voucher` — đó chính là chỗ ADR-06 dựng seam ra để dùng. Đổi lại
ba thứ: (1) AC-24 mất hiệu lực ở vế "không Writer mới" — vế "không kiểu payload mới, không Sink
mới" vẫn giữ; (2) phải viết `amountInWordsVi` (repo chưa có bất kỳ util đọc số thành chữ nào —
`amountInWords` đã khai trong `VoucherPrintPayload` từ ADR-05 nhưng chưa nơi nào sinh giá trị);
(3) `VoucherXlsxWriter` ghi khối ký **sau** dòng cuối cùng của bảng, nên nó phải biết số dòng đã
ghi — `ExportWriter.end(totals)` là chỗ duy nhất biết điều đó, và với chứng từ thì `StaticRowsFetcher`
đảm bảo toàn bộ dòng đã nằm trong RAM nên không mâu thuẫn với ADR-08.
**Status:** accepted — chốt bởi Akenzy, 2026-07-30

### ADR-11 — House style MISA nằm ở một file hằng số, không nằm trong từng Writer
**Context:** Sau ADR-10 có hai Writer cùng phải tuân một chuẩn trình bày (font Times New Roman, nền
tiêu đề `FFFDE9D9`, viền mảnh bốn cạnh, `#,##0`, tiêu đề bold 18 căn giữa). Đây đúng loại tri thức
đã bị chép ở 7 chỗ trước khi có feature này — chép lần thứ tám vào Writer thứ hai là lặp lại đúng
sai lầm.

**Decision:** `apps/api/src/modules/reporting/report-core/export/xlsx-style.ts` giữ toàn bộ hằng số
và helper trình bày (`HEADER_FILL`, `THIN_BORDER`, `NUMBER_FORMAT`, cỡ chữ, helper ghi một dòng
banner có merge + style). Cả hai Writer chỉ đọc, không tự khai. Bản in HTML tuân cùng chuẩn nhưng
bằng CSS của nó — không chia sẻ code qua ranh giới BE/FE, chỉ chia sẻ chuẩn.

**Consequences:** Đổi house-style về sau là sửa một file. Đổi lại: một tầng gián tiếp cho thứ mà
hôm nay hai chỗ dùng — chấp nhận, vì Writer thứ ba (CSV, hoặc phiếu quỹ A5 của UOW-04) là chuyện
đã thấy trước chứ không phải giả định. Ranh giới BE/FE cố ý **không** chia sẻ code: một hằng số màu
dùng chung giữa `exceljs` và CSS sẽ kéo `@erp/shared-interfaces` vào việc trình bày, đúng thứ
`ReportDocumentPayload` khai là không làm.
**Status:** accepted — chốt bởi Akenzy, 2026-07-30

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

### ADR-12 — Nhóm cột đi qua payload dưới dạng nhãn đã resolve, và hàng nhóm dựng bằng hai hàng chưa commit
**Context:** `ReportColumnHeader.group` lái tiêu đề hai tầng trên màn hình, nhưng
`resolveColumns` (`report-export.service.ts:315`) không đọc nó và `DocumentColumn` không có chỗ
chứa, nên band biến mất khỏi cả bản in lẫn file Excel (AC-36). Có hai câu hỏi thiết kế: band đi
qua mặt cắt dưới hình thù gì, và `WorkbookWriter` stream có merge nổi qua hai hàng không —
comment `xlsx-stream.writer.ts:199-202` khẳng định là không.

**Decision:**
1. `DocumentColumn.group?: string | null` mang **nhãn tiếng Việt đã resolve**, không mang
   `ReportColumnGroup { id, name }`. Cùng lối `label` và `desc` đang đi: renderer không tra cứu gì.
2. Thuật toán gộp cột liền nhau thành segment nằm ở **một** hàm thuần trong
   `@erp/shared-interfaces` (`buildColumnBands`), dùng chung cho `XlsxStreamWriter` và
   `renderReportTableHtml`.
3. Hàng nhóm dựng bằng `addRow(band)` + `addRow(labels)` **chưa commit hàng nào**, merge ngang cho
   band và merge dọc cho cột không band, rồi mới commit. Bác bỏ khẳng định của comment cũ:
   ràng buộc thật của ExcelJS là "không merge được **sau khi** commit", không phải "không merge
   được qua nhiều hàng" (xem A-28, đã đọc source thư viện).
4. Không cột nào có `group` → phát **đúng một** hàng tiêu đề, y như hôm nay.

**Consequences:** Hai renderer không thể lệch nhau về cách gộp band vì chỉ có một hàm gộp — cùng
lý lẽ đã sinh ra ADR-01. Đổi lại, `@erp/shared-interfaces` mọc thêm một hàm thuần bên cạnh các
kiểu; chấp nhận được vì package đã chứa hằng số nhãn (`INVOICE_REPORT_BAND_LABELS_VI`) và hàm này
không biết gì về trình bày — nó chỉ trả về `{label, start, span}`.

Phần bị loại: (a) để mỗi renderer tự gộp — hai bản 15 dòng, đúng thứ ADR-01 dựng payload để tránh;
(b) nhồi nhãn nhóm vào cùng ô với nhãn cột kiểu `"Doanh thu\nTiền mặt"` như đang làm với `desc` —
không gộp được ô nên mất hẳn thông tin "những cột nào cùng một nhóm", tức là không đạt AC-36;
(c) bỏ merge dọc và để ô trống phía trên cột không nhóm — ô gộp mất viền, lệch AC-26.

**Status:** accepted — chốt bởi Akenzy khi duyệt plan, 2026-08-01

### ADR-13 — Bề rộng cột khai một lần bằng ký tự; HTML tự quy về phần trăm
**Context:** `DocumentColumn.width` đã có trong hợp đồng từ đầu và `VoucherXlsxWriter.widthOf()`
đã đọc, nhưng không mapper nào set và `renderVoucherHtml` không đọc. Bản in dùng
`table-layout: fixed` **không kèm `<colgroup>`** nên trình duyệt chia đều mọi cột lưới — đó là
nguyên nhân AC-37.

**Decision:** `width` khai **một lần** ở mapper, đơn vị là **ký tự** (đơn vị Excel đã dùng). Excel
đọc thẳng. HTML quy về phần trăm: `width / Σ(width × span của các cột không ẩn) × 100`, phát một
`<col>` cho **mỗi cột vật lý** để `colspan` khớp lưới. Cột không khai `width` rơi về đúng mặc định
`WIDTH_DEFAULT = 17` mà Excel đang dùng, nên chứng từ chưa khai vẫn ra như cũ.

**Consequences:** Một con số cho hai đầu ra — không có cách nào chỉnh bản in mà quên file, đúng
tinh thần ADR-01. Đổi lại, tương quan bề rộng là chung cho cả hai, không tối ưu riêng cho giấy:
một cột hợp lý trên A4 có thể hơi hẹp trong Excel và ngược lại. Chấp nhận, vì hai bản lệch nhau
tốn nhiều hơn nhiều so với vài milimet.

Phần bị loại: thêm `printWidth` riêng cho HTML — hai nguồn sự thật, và chưa ai yêu cầu chúng khác nhau.

**Status:** accepted — chốt bởi Akenzy khi duyệt plan, 2026-08-01
