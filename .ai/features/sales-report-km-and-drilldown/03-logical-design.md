# Logical design — sales-report-km-and-drilldown

## Approach

Hai nửa độc lập, chỉ dùng chung một điều: **không thêm endpoint nào**.

### Nửa A — Khuyến mại: đưa cả bốn báo cáo về một nguồn sự thật là dòng hàng

Hôm nay hai báo cáo theo hoá đơn đọc header (`invoices.discount_amount`), hai báo cáo theo mặt
hàng đọc dòng (`invoice_items.line_discount + promotion_discount`, có dấu theo `direction`).
Với hoá đơn SALE hai nguồn bằng nhau từng đồng (đo được: 9.214.000 = 9.214.000), nên chuyển nhóm
theo hoá đơn sang đọc dòng là **no-op với SALE** và chỉ sửa đúng phần EXCHANGE/RETURN.

`direction` đã mang sẵn dấu: hoá đơn RETURN có dòng `IN`, hoá đơn EXCHANGE có cả `IN` lẫn `OUT`.
Vì thế giá trị theo dòng **không** nhân thêm `invoiceTypeSign` — nếu nhân, RETURN sẽ bị đổi dấu hai
lần. Đây chính là chỗ dễ sai nhất của UOW-01.

Helper dùng chung, đặt ở `report-core` (cả `invoice-report` lẫn `profit-report` đều phụ thuộc tầng
này, không ngược lại):

```
loadSignedLineDiscounts(repo, invoiceIds): Map<invoiceId, number>
  SUM(CASE WHEN direction = 'IN' THEN -1 ELSE 1 END * (line_discount + promotion_discount))
  GROUP BY invoice_id
```

Một truy vấn gộp, **không** nạp dòng hàng vào RAM — `daily-sales-summary` hiện chưa hề chạm
`invoice_items` và không được phép trở thành báo cáo nạp cả tháng dòng hàng.

"Điểm KM" ở grain mặt hàng phân bổ `invoices.points_discount_amount` xuống dòng theo tỉ lệ phần
đóng góp hàng hoá có dấu (`dirSign × line_total`), chuẩn hoá trên tổng cùng loại của hoá đơn đó.
Hai báo cáo mặt hàng đều đã nạp sẵn cả hoá đơn lẫn dòng nên không phát sinh truy vấn mới. Phần dư
làm tròn dồn vào dòng cuối để Σ theo dòng bằng đúng số trên header.

`promoRate` đổi thành `(discount + promoPoints) / goods`, khớp annotation `(5)=((4)+(9))/(3)` mà
chính header cột đang mang.

### Nửa B — Drill-down: dialog là một báo cáo lồng, không phải bảng viết mới

`ReportStoreProvider` và `TableStoreProvider` là provider theo instance. Dialog = `AppModal` bọc
một stack provider thứ hai chạy đúng `ReportPageTableView`, `ReportTableConfigSync`,
`ReportColumnFilterSync`, phân trang, và một `InvoiceDetailDialog` lồng.

Cột nào click được do một registry FE thuần quyết định, khoá theo `(backendKey, columnKey)`:

```
resolveDrillDown(backendKey, columnKey, { raw, row, filters }) -> DrillDownAction | null
```

Bốn mục: `invoice-order-listing.invoiceCode`, `invoice-item-revenue-detail.invoiceCode` (giữ
nguyên hành vi cũ), `daily-sales-summary.date`, `revenue-by-item.itemName`.

Kế thừa filter là **allow-list tường minh** cho từng dialog, không spread — báo cáo nguồn và đích
không cùng bộ filter line, và `invoiceFilterSummary` sẽ in ra file xuất khẩu những dòng phụ đề sai
nếu lọt filter mà đích không hỗ trợ.

## Contracts

**Backend — thay đổi duy nhất về API:** thêm `sku?: string` vào `InvoiceReportFilterDto` và
`InvoiceReportFilterPayload`. `@IsOptional() @IsString() @MaxLength(64)` — `whitelist +
forbidNonWhitelisted` toàn cục nên thiếu khai báo là 400, và giá trị đi thẳng vào tham số `WHERE`
trên đường nóng.

Đẩy vào chính mệnh đề `where` của truy vấn dòng hàng trong
`invoice-item-revenue-detail.report.ts:176-180`, không lọc sau khi nạp (AC-11). Khác với
`categoryId` — cái đó buộc phải lọc sau vì cần join danh mục.

`invoiceFilterSummary` thêm dòng `Mã SKU: <sku>`. SKU không phải PII nên in thẳng.

Sau thay đổi DTO: `pnpm openapi:generate` + commit `openapi.snapshot.json` và
`packages/api-client/src/generated/schema.ts`. FE đang cast body
(`payload as unknown as Record<string, unknown>`, `_api/invoice-report.api.ts:53`) nên **trình biên
dịch sẽ không nhắc** — đây là lý do bước regen phải là một ticket riêng chứ không phải thói quen.

**Frontend — hình dạng state drill-down** (đặt cạnh `detailInvoiceCode` sẵn có):

```ts
interface ReportDrillDown {
  reportType: string;                    // report type FE của dialog
  title: string;                         // 'BẢNG KÊ HÓA ĐƠN'
  subtitle: string;                      // 'Ngày 19/08/2026'
  filters: Partial<ReportFilterValues>;  // đã narrow + allow-list
}
drillDown: ReportDrillDown | null
```

Cờ `link` của backend từ nay chỉ còn nghĩa "tô xanh", không còn nghĩa "click được".

## Error taxonomy

| Tình huống | Nơi phát hiện | Hành vi |
|---|---|---|
| `filters.sku` quá 64 ký tự hoặc sai kiểu | `ValidationPipe` | 400, thông điệp class-validator |
| Field lạ trong `filters` | `ValidationPipe` (`forbidNonWhitelisted`) | 400 — rủi ro thật nếu FE gửi `sku` trước khi BE deploy |
| Click ô Ngày mà ô rỗng | `resolveDrillDown` | trả `null`, ô không phải link |
| Click Tên hàng hoá ở grain không phải mặt hàng | `resolveDrillDown` | trả `null` (AC-12) |
| `allocateComboRevenue` đang bật | `resolveDrillDown` | trả `null` — drill-down lệch số còn tệ hơn không có |
| Dialog fetch lỗi | TanStack Query trong provider lồng | dialog hiện lỗi, báo cáo cha không bị ảnh hưởng |
| Σ tiền hàng có dấu của hoá đơn bằng 0 khi phân bổ Điểm KM | helper phân bổ | rơi về chia theo `abs(line_total)`; nếu vẫn bằng 0 thì dồn hết vào dòng đầu |
| Hoá đơn không còn dòng nào sau khi lọc `sku` | `invoice-item-revenue-detail` | hoá đơn đó đóng góp 0 dòng, không phải lỗi |

## Alternatives rejected

| Option | Why not |
|---|---|
| Viết một bảng nhẹ riêng cho dialog | `ReportPageToolbar` dựng request In/Xuất khẩu từ đúng 4 nguồn store; lồng provider thì hai nút chạy đúng, miễn phí. Viết riêng nghĩa là làm lại dòng filter, header 3 tầng, cột ghim, footer tổng và cả hai bộ dựng request — làm lại nguyên tính năng lần hai. |
| Thêm `date` vào `LINK_COLUMNS` toàn cục | `LINK_COLUMNS` khoá theo *tên cột*; `date` cũng có trên `invoice-order-listing` và `invoice-item-revenue-detail`, sẽ sáng lên ở nơi click vô nghĩa. Vi phạm AC-14. |
| Lọc SKU bằng `columnFilters` | `matchColumnFilter` chạy **sau** khi nạp toàn bộ dòng hàng của cả kỳ, mỗi lần click một SKU. Field DTO đẩy được điều kiện xuống SQL. Vi phạm AC-11. |
| Sửa checkout saga để ghi `invoices.discount_amount` cho EXCHANGE | Sửa tầng ghi không chữa được dữ liệu lịch sử, và `invoices` bất biến sau phát hành. Sửa tầng đọc là đúng chỗ. |
| Nạp toàn bộ `invoice_items` trong `daily-sales-summary` để cộng KM | Báo cáo này cố tình chỉ chạm bảng `invoices`. Một truy vấn `SUM … GROUP BY invoice_id` cho cùng kết quả mà không đổi đặc tính bộ nhớ. |
| Bỏ dấu `direction` cho khớp header thay vì ngược lại | Sẽ coi khuyến mại đang được hoàn lại là khuyến mại phát sinh thêm. Người dùng đã chốt hướng trừ (A-02). |
| Mount `ReportUrlSync` trong dialog cho nhất quán | Nó ghi URL hash ⇒ đóng dialog làm báo cáo cha nhảy sang report type của dialog. |

## ADRs

### ADR-01 — Dialog drill-down là một báo cáo lồng dùng lại chính stack store của trang
**Status:** accepted

Lồng `ReportStoreProvider` → `TableStoreProvider` bên trong `AppModal`, dùng lại
`ReportPageTableView` / `ReportTableConfigSync` / `ReportColumnFilterSync` / phân trang, cộng thêm
một `InvoiceDetailDialog` lồng để mã hoá đơn trong dialog vẫn mở được chi tiết (AC-08).

Hai điều bắt buộc: **không** mount `ReportUrlSync`; tách `ReportExportButtons` khỏi
`ReportPageToolbar` để chân dialog có In/Xuất khẩu mà không kéo theo nút cấu hình cột.

Điều kiện có thể mất hiệu lực: template cột hiện chỉ bật cho báo cáo kho
(`useReportColumnTemplate` `enabled: source === "inventory"`). Nếu sau này bật cho báo cáo bán hàng,
bảng lồng sẽ nạp template **của report type của chính dialog** — nhiều khả năng vẫn đúng, nhưng
phải kiểm lại. Xem A-05.

### ADR-02 — Cột click được do registry FE theo `(backendKey, columnKey)` quyết định, không do cờ `link` của backend
**Status:** accepted

Thay `col.column === "invoiceCode"` bằng `resolveDrillDown(backendKey, columnKey, ctx)`. Ba hệ quả
đi kèm: hành vi mã hoá đơn cũ giữ nguyên (AC-13); `date` chỉ click được trên `daily-sales-summary`
(AC-14); và cột `link: true` không nằm trong registry quay lại nhánh `formatReportNumber`, sửa luôn
lỗi mất định dạng số (AC-15).

Cờ `link` cho `date` set riêng trong `daily-sales-summary.report.ts` `buildColumns`, kèm một spec
khẳng định `enrichHeader({col:'date'})` vẫn **không** có `link` — để lần sau không ai "sửa" bằng
cách thêm `date` vào tập toàn cục.

### ADR-03 — Dòng hàng có dấu theo `direction` là nguồn sự thật duy nhất của "Khuyến mại"
**Status:** accepted

Cả bốn báo cáo lấy `Σ dirSign(line) × (line_discount + promotion_discount)`.
**Không** nhân thêm `invoiceTypeSign`: `direction` đã mang dấu (RETURN toàn dòng `IN`), nhân nữa là
đổi dấu hai lần.

Hai báo cáo theo hoá đơn lấy qua `loadSignedLineDiscounts` — một truy vấn `SUM … GROUP BY
invoice_id`, giữ nguyên đặc tính bộ nhớ của `daily-sales-summary`.

Kiểm chứng trên kỳ tham chiếu: SALE bất biến (9.214.000 → 9.214.000); tổng kỳ 9.214.000 → 8.914.000;
ngày 19/08 hiện KM âm 300.000; cả bốn báo cáo về cùng 8.914.000.

### ADR-04 — "Điểm KM" ở grain mặt hàng phân bổ theo tỉ lệ tiền dòng có dấu
**Status:** accepted

`revenue.promoPoints` thôi là `placeholder: 0`. Mỗi dòng nhận
`points_discount_amount × (dirSign × line_total) / Σ(dirSign × line_total)` trong phạm vi hoá đơn
của nó; phần dư làm tròn dồn vào dòng cuối để Σ theo dòng bằng số trên header.

Cơ sở: công thức MISA `Doanh thu (6)=(3)-(4)-(9)` nằm trên chính báo cáo mặt hàng và có tham chiếu
`(9)` = Điểm KM, nên MISA cũng mang điểm xuống grain mặt hàng.

Đây là **phân bổ, không phải sự thật ghi nhận** — không có bản ghi loyalty theo dòng. Nếu sau này
có, thay helper phân bổ bằng số thật và các con số sẽ dịch chuyển. Ghi rõ trong 07 để kế toán biết.
