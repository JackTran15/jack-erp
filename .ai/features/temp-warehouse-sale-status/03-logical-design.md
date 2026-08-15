---
feature: temp-warehouse-sale-status
adrs: 5
---

# Logical design — Sửa nhãn trạng thái bán trên báo cáo "Hàng hóa xuất kho tạm"

> **Sửa phạm vi 2026-08-15.** Bản đầu của tài liệu này thiết kế thêm một nguồn dữ liệu thứ hai
> (`invoice_items`) để hàng trưng showroom bán ra hiện trong báo cáo. Nguồn đó đã cài xong rồi
> **gỡ** — xem **ADR-05**, nơi ghi cả lý do lẫn ba defect mà việc theo đuổi nó phát hiện ra.
> Phần dưới đây mô tả thiết kế **sau khi gỡ**.

## Approach

Toàn bộ thay đổi hành vi nằm trong **một** file:
`apps/api/src/modules/inventory-reports/services/temp-warehouse-report.service.ts`.
Lưới đơn cửa hàng (REST cũ), chế độ chuỗi cửa hàng, Xuất khẩu Excel và In đều gọi
`TempWarehouseReportService.list`, nên sửa ở đây là cả bốn đường khớp nhau theo cấu trúc,
không phải nhờ kỷ luật.

Chuỗi CTE giữ nguyên `base → exp/ret → paired → enriched`. **Không thêm nguồn, không thêm CTE,
không đổi số dòng.** Chỉ hai dịch chuyển:

1. **Đổi nhãn.** Nhánh đầu của CASE trạng thái:

   ```sql
   CASE
     WHEN p.invoice_id IS NOT NULL       THEN 'Bán hàng kho tạm'   -- was 'Bán hàng trưng bày'
     WHEN p.exp_transfer_id IS NOT NULL  THEN 'Chuyển kho xuất đi'
     WHEN p.ret_transfer_id IS NOT NULL  THEN 'Chuyển kho trả lại'
     WHEN p.return_qty = p.out_qty       THEN ''
     WHEN p.return_qty = 1               THEN 'Trả hàng trưng bày'
     ELSE 'Xuất không bán'
   END
   ```

   `invoice_id` chỉ được ghi bởi `fulfillInvoiceFromTempWarehouse`, vốn chỉ tiêu thụ dòng
   `warehouse_to_showroom` — nên nhánh này luôn là hàng đi qua kho tạm, không bao giờ là hàng
   trưng bày. Thứ tự bốn nhánh sau giữ nguyên tuyệt đối (AC-03).

2. **`sale_qty` / `remaining_qty` tính ở `paired` thay vì `enriched`.** Giá trị không đổi
   (kiểm chứng bằng test), nhưng đặt công thức cạnh nơi `out_qty`/`return_qty` sinh ra thì đọc
   dễ hơn là suy lại từ `p.invoice_id` ở tầng trên.

`enriched` giữ vai trò "tầng duy nhất nơi tồn tại đúng dòng người dùng nhìn thấy" — rows, count
và totals đều đọc từ đó, nên footer không thể mô tả một tập khác lưới, và `buildReportColumnFilter`
vẫn áp trên đúng một chỗ (AC-06).

Frontend không có logic mới: hai chỗ hard-code danh sách trạng thái đổi thành import
`TEMP_WAREHOUSE_OUT_STATUS_OPTIONS` (AC-07).

## Contracts

**Không đổi schema, không migration, không thêm bảng nào vào truy vấn.**

| Hợp đồng | Trạng thái | Ghi chú |
|---|---|---|
| `TempWarehouseIssueRow` (13 field) | **không đổi** | |
| `TempWarehouseReportResult` `{data, total, totals}` | **không đổi** | |
| `TempWarehouseReportQuery` | **không đổi** | 6 tham số, giữ nguyên thứ tự |
| `TEMP_WAREHOUSE_OUT_STATUS_OPTIONS` | 5 → 5, **thay một giá trị** | `Bán hàng trưng bày` → `Bán hàng kho tạm`. Không giữ lại giá trị cũ: sau thay đổi không dòng nào mang nhãn đó, để lại chỉ tạo một lựa chọn lọc luôn rỗng |
| Cột báo cáo (`COLUMNS` trong `temp-warehouse-out.report.ts`) | **không đổi** | 13 cột, nhãn VI giữ nguyên |
| Report key của cache | `...goods2` → `...goods3` | **Không phải** `CACHE_NAMESPACE` (vẫn `'inventory-reports:v2'`) — nó là thành phần đầu của cache key `${reportKey}:${orgId}:${hash}`. Chỉ che đường REST v1; đường report-registry (`SearchInventoryReportHandler`, key `sha256(orgId + dto)`, không có version token) vẫn trả nhãn cũ tối đa 45s sau deploy — chấp nhận |
| OpenAPI / `packages/api-client` | **không đổi** | Không endpoint mới, không field mới ⇒ không cần `pnpm openapi:generate` |

Giá trị filter vẫn là chuỗi tiếng Việt backend phát ra (A-12) — đổi sang mã enum sẽ phá template
báo cáo người dùng đã lưu và URL đã chia sẻ.

## Alternatives rejected

| Option | Why not |
|---|---|
| Thêm nguồn `invoice_items` để hàng trưng showroom bán ra hiện trong báo cáo | Đã cài, chạy đúng, rồi gỡ: chiếm 64/71 dòng trên dữ liệu thật, làm báo cáo không còn đúng tên (ADR-05) |
| Giữ nguồn showroom nhưng ẩn sau một bộ lọc "Nguồn hàng", mặc định tắt | Giữ được cả hai nghiệp vụ, nhưng thêm một trục lọc cho một nghiệp vụ vốn thuộc về báo cáo doanh thu. Chủ sở hữu chọn gỡ hẳn |
| Giữ `Bán hàng trưng bày` trong danh sách lọc cho tương thích ngược | Sau khi gỡ nguồn, không dòng nào mang nhãn đó — một lựa chọn lọc luôn trả về rỗng còn tệ hơn là không có |
| Tách theo `temp_warehouse_lines.source_location_id` (kho thường vs showroom) | Cột đi theo `direction` của chính dòng đó, nullable, do người dùng chọn tay ở toolbar POS; đường checkout không bao giờ ghi nó (A-R2) |
| Tách theo `temp_warehouse_sessions.direction` | Mọi dòng đã bán đều thuộc phiên `warehouse_to_showroom` (`:1266-1271` hard-code chiều này) ⇒ không phân biệt được gì |
| Backfill `invoice_id` cho dòng trước 25/06/2026 bằng ghép FIFO theo (mặt hàng, thời gian, chi nhánh) | Không có khóa ghép ngược nào (A-R3); ghi đè chứng từ đã post bằng phỏng đoán (ADR-03) |

## Error taxonomy

| Tình huống | Xử lý | Nơi phát |
|---|---|---|
| Cột hoặc khóa lọc không có trong catalog | `BadRequestException` | `assertKnownColumns` (`report-data.util.ts:21`) — hành vi sẵn có, không đổi |
| Kết quả vượt 50.000 dòng | `BadRequestException` "narrow the period or filters" | `assertUnderRowCap` (`row-cap.util.ts:24`) — **không có áp lực mới**, số dòng bằng đúng trước thay đổi |
| Không có dòng nào khớp | `{data: [], total: 0, totals: <các số 0>}`, không ném lỗi | `list()` thoát sớm — giữ nguyên |
| `carrier_user_id` không tra được người dùng | `LEFT JOIN users` → `staff` rỗng, không lỗi | `enriched` — giữ nguyên |
| Không resolve được vị trí kệ | Hai LATERAL trả NULL → `location` rỗng | Giữ nguyên |
| Dữ liệu trước 25/06/2026 không có `invoice_id` | **Không phải lỗi runtime**; dòng đó đọc `Chuyển kho xuất đi` hoặc `Xuất không bán`. Hạn chế đã biết, ADR-03 | — |
| Hóa đơn bị hủy sau khi đã tiêu thụ kho tạm | **Defect có sẵn, không sửa ở đây**: dòng vẫn đọc `Bán hàng kho tạm`. Có test e2e khẳng định hành vi hiện tại | ADR-05 mục 3 |

## ADRs

### ADR-05 — Gỡ nguồn bán showroom; báo cáo chỉ đọc `temp_warehouse_lines`

**Status:** accepted (2026-08-15) — **thay thế ADR-01 và ADR-02**

**Bối cảnh.** ADR-01 thêm nguồn thứ hai (`invoice_items` trừ đi phần kho tạm đã nhận) để nghiệp vụ
"hàng trưng showroom bán ra" hiện trong báo cáo. Nó được cài xong, chạy đúng, và kiểm chứng đủ:
invariant tổng SL bán khớp hóa đơn trên 18/18 hóa đơn, 12 test e2e chạy SQL thật, ba đột biến đều
bị bắt. Về mặt kỹ thuật không có gì sai.

Nhưng khi nhìn kết quả trên dữ liệu thật, tỉ lệ mới lộ ra:

| Trạng thái | Số dòng | Nguồn |
| --- | ---: | --- |
| Bán hàng trưng bày | 64 | `invoice_items` — chưa từng vào kho tạm |
| Bán hàng kho tạm | 4 | `temp_warehouse_lines` |
| Xuất không bán | 3 | `temp_warehouse_lines` |

Báo cáo phình từ 7 lên 71 dòng, **64/71 (90%) là hàng không hề xuất kho tạm**, trong một báo cáo
tên "Hàng hóa xuất kho tạm".

**Quyết định.** Gỡ `tw_claimed`, `showroom` và `movements`. Báo cáo chỉ đọc `temp_warehouse_lines`
như trước. Giữ lại duy nhất phần đổi nhãn `Bán hàng trưng bày` → `Bán hàng kho tạm` (ADR-04 vẫn
đứng: thứ tự nhánh CASE, nhưng giờ không còn nhánh `source`).

Nhãn `Bán hàng trưng bày` bị gỡ khỏi `TEMP_WAREHOUSE_OUT_STATUS_OPTIONS` — sau thay đổi không dòng
nào mang nhãn đó, để lại chỉ tạo một lựa chọn lọc luôn trả về rỗng. `Trả hàng trưng bày` giữ
nguyên: nó nghĩa là trả hàng *về kho*, không liên quan.

**Hệ quả.** Nghiệp vụ bán hàng trưng bày vẫn không có mặt trong báo cáo này — đúng như trước, nhưng
giờ là quyết định có ghi chép chứ không phải thiếu sót. Ai cần con số đó thì dùng báo cáo doanh thu.
Rủi ro chạm trần 50.000 dòng khi xuất Excel biến mất theo.

**Bài học, đáng giá hơn cả đoạn code đã gỡ.** Câu hỏi phạm vi này *đã* được đặt ra ngay từ đầu và
được trả lời "không ưu tiên"; tôi tự chốt theo hai gạch đầu dòng của yêu cầu mà không quay lại kiểm
chứng tỉ lệ trên dữ liệu thật. Con số 64/71 có thể đo được ngay sau T-02-01 — trước cả T-02-02 và
toàn bộ e2e — chỉ bằng một câu `GROUP BY status`. Với thay đổi làm **đổi số dòng** của một báo cáo,
đo tỉ lệ nguồn mới là việc phải làm trước khi viết test, không phải sau.

Ba defect mà việc theo đuổi hướng này phát hiện ra vẫn còn giá trị và đã được giữ lại:

1. **Lệch múi giờ khi UNION hai kiểu timestamp.** `temp_warehouse_lines.created_at` là
   `timestamp` naive-UTC, `invoices.issued_at` là `timestamptz`; `UNION ALL` nâng cả hai lên
   timestamptz và làm biểu thức render sẵn có đổi overload — trừ 7h thay vì cộng, sai cả ngày.
   Không còn áp dụng sau khi gỡ union, nhưng là cái bẫy cần nhớ nếu sau này lại union nguồn khác.
2. **Trừ nhiều lần khi hóa đơn tách dòng.** Nút "Tách dòng" ở POS tạo nhiều dòng giỏ cùng `itemId`;
   `LEFT JOIN` một bảng đã gộp vào bảng chưa gộp sẽ trừ một lần cho mỗi dòng.
3. **Bất đối xứng `status` khi hủy hóa đơn.** `cancel-invoice.service.ts` không đụng
   `temp_warehouse_lines`, nên hóa đơn bị hủy vẫn để lại dòng kho tạm mang `invoice_id` và
   status `TRANSFERRED` — báo cáo **vẫn tính là đã bán**. Defect này **còn nguyên** sau khi gỡ,
   vì nó nằm ở nhánh kho tạm. Đã giữ một test e2e khẳng định hành vi hiện tại.

Ngoài ra còn một phát hiện độc lập, đã mở task riêng: vị từ kỳ của nhánh kho tạm so cột naive-UTC
với tham số `Date`, nên biên kỳ lệch đúng bằng offset múi giờ của tiến trình API (bằng 0 trong
container UTC, 7 giờ trên máy dev Asia/Saigon).

### ADR-01 — Suy ra luồng bán từ "POS có tiêu thụ dòng kho tạm hay không", bằng phép trừ trên `invoice_items`

**Status:** superseded by ADR-05 (2026-08-15) — đã cài rồi gỡ, giữ lại để hiểu git history

**Bối cảnh.** Hai luồng bán cần phân biệt, nhưng chỉ luồng kho tạm để lại dấu vết trong
`temp_warehouse_lines`. Luồng bán hàng trưng bày không sinh dòng nào: POS trừ tồn thẳng từ vị trí
showroom và `fulfillInvoiceFromTempWarehouse` thoát sớm ở `:1323`.

**Quyết định.** Nhánh `Bán hàng trưng bày` lấy từ `invoice_items`, trừ đi phần SL mà
`temp_warehouse_lines` đã nhận cho cùng `(invoice_id, item_id)` (`tw_claimed`). Phần dư `> 0`
mới sinh dòng.

**Hệ quả.** Báo cáo có hai nguồn với granularity khác nhau: dòng kho tạm = 1 đơn vị; dòng showroom
= một **(hóa đơn, mặt hàng)**, SL có thể > 1. Lưu ý granularity showroom là per-(hóa đơn, mặt hàng)
chứ **không** phải per-dòng-hóa-đơn: nút "Tách dòng" ở POS cố ý tạo nhiều dòng giỏ cho cùng
`itemId`, và `tw_claimed` gộp theo `(invoice_id, item_id)`, nên phải gộp `invoice_items` cùng mức
trước khi trừ — nếu không phần kho tạm đã nhận bị trừ một lần cho mỗi dòng. Đây cũng đúng thứ
AC-02 đòi (một dòng cho một cặp hóa đơn+mặt hàng). Đổi lại: không migration, không đụng đường ghi của POS, và
`SUM(SL bán)` theo số hóa đơn khớp SL OUT của hóa đơn đó. Chi phí: mỗi lần chạy báo cáo quét thêm
`invoice_items` trong kỳ và một GROUP BY trên `temp_warehouse_lines` có `invoice_id`
(có index riêng `IDX_temp_warehouse_lines_invoice`).

### ADR-02 — Không thêm cột provenance vào `invoice_items`

**Status:** superseded by ADR-05 (2026-08-15) — câu hỏi không còn đặt ra khi báo cáo không đọc `invoice_items`

**Bối cảnh.** Ghi thẳng "bán từ kho tạm / bán từ trưng bày" lúc checkout sẽ chính xác hơn suy diễn
và rẻ hơn khi đọc.

**Quyết định.** Không làm trong phạm vi này.

**Hệ quả.** Tránh migration + đổi đường ghi của POS (`checkout-invoice.service.ts:348-373` hiện
publish fire-and-forget, không quyết định gì về kho tạm — thêm cột nghĩa là kéo quyết định đó
ngược vào đường checkout đồng bộ). Đánh đổi: báo cáo gánh phép trừ mỗi lần chạy, và vẫn không cứu
được dữ liệu cũ (ADR-03). Nếu sau này cần provenance cho nhiều báo cáo khác, mở lại quyết định này.

### ADR-03 — Không backfill dữ liệu trước 25/06/2026

**Status:** accepted (2026-08-15)

**Bối cảnh.** Luồng fulfill và cột `invoice_id` (trên cả `temp_warehouse_lines` lẫn
`stock_transfers`) cùng ra đời ở commit `ddaacee3` ngày 25/06/2026; module kho tạm có từ 16/05/2026.
Trong cửa sổ đó, hàng scan kho tạm rồi bán không được ghi `invoice_id` — theo logic mới sẽ hiện
thành `Bán hàng trưng bày` dù thực tế đi qua kho tạm.

**Quyết định.** Chấp nhận, không backfill. Chủ sở hữu chốt phương án này 2026-08-15.

**Hệ quả.** Báo cáo kỳ trước 25/06/2026 đọc sai luồng cho phần hàng kho tạm, không có cách phát
hiện tự động. Đã cân nhắc và loại: ghép ngược qua `stock_transfers.invoice_id` (cùng NULL, cùng
migration), qua chuỗi mô tả `fulfillTransferDescription` (sinh ra ở đúng commit đó), và ghép FIFO
theo (mặt hàng, thời gian, chi nhánh) — phương án cuối là phỏng đoán ghi đè lên chứng từ đã post,
không đáng. Phương án dự phòng nếu sau này cần: chặn nhánh showroom trước một mốc ngày cấu hình được.

### ADR-04 — `source = 'showroom'` xét đầu tiên trong CASE trạng thái

**Status:** superseded by ADR-05 (2026-08-15) — nhánh `source` đã gỡ; ràng buộc thứ tự nhánh vẫn đúng nếu sau này thêm nguồn khác

**Bối cảnh.** Dòng showroom có `out_qty = 0` và `return_qty = 0`. Nhánh sẵn có
`WHEN p.return_qty = p.out_qty THEN ''` khớp `0 = 0`, nên sẽ gán chuỗi rỗng cho mọi dòng showroom
nếu thứ tự không đổi.

**Quyết định.** `WHEN p.source = 'showroom'` là nhánh đầu tiên; năm nhánh còn lại giữ nguyên thứ tự
tương đối để không đổi nghĩa các trạng thái đang dùng (AC-04).

**Hệ quả.** Thứ tự nhánh trở thành ràng buộc đúng-đắn, không phải phong cách. Ghi rõ trong
doc-comment đầu file để lần sửa sau không đảo lại. Test AC-04 khóa hành vi của năm nhãn cũ.
