---
feature: temp-warehouse-sale-status
adrs: 7
---

# Logical design — Sửa nhãn trạng thái bán trên báo cáo "Hàng hóa xuất kho tạm"

> **Trạng thái hiện hành: HAI NGUỒN (ADR-06, 2026-08-16).** Tài liệu này đã qua hai lần đảo trên
> cùng một câu hỏi phạm vi. Nguồn `invoice_items` được thiết kế (ADR-01), **gỡ** (ADR-05, ship ở
> `#184`), rồi **khôi phục** (ADR-06). Phần Approach/Contracts dưới đây mô tả thiết kế hiện hành.
> Đọc ADR-05 để hiểu vì sao từng gỡ — đánh đổi đó vẫn còn nguyên, chỉ là đã được chọn ngược lại.

## Approach

Toàn bộ thay đổi hành vi nằm trong **một** file:
`apps/api/src/modules/inventory-reports/services/temp-warehouse-report.service.ts`.
Lưới đơn cửa hàng (REST cũ), chế độ chuỗi cửa hàng, Xuất khẩu Excel và In đều gọi
`TempWarehouseReportService.list`, nên sửa ở đây là cả bốn đường khớp nhau theo cấu trúc,
không phải nhờ kỷ luật.

Chuỗi CTE: `base → exp/ret → paired` cho nguồn kho tạm, `tw_claimed → showroom` cho nguồn thứ hai,
hợp ở `movements` rồi mới vào `enriched`:

```
base ──► exp ──┐
       └► ret ──┴► paired ────┐
                              ├► movements ──► enriched ──► {count+totals, rows}
tw_claimed ──► showroom ──────┘
```

Ba điểm mấu chốt:

1. **`sale_qty` / `remaining_qty` tính ở từng nhánh**, không ở `enriched`: nhánh kho tạm suy từ
   `invoice_id`, nhánh showroom lấy phần dư và luôn để `remaining_qty = 0`.
2. **`tw_claimed` cố ý KHÔNG chặn theo kỳ** — dòng stage trước kỳ vẫn mang `invoice_id` của hóa đơn
   trong kỳ; chặn theo kỳ sẽ để lọt phần đó xuống nhánh showroom và đếm trùng.
3. **Nhánh `source = 'showroom'` phải xét ĐẦU TIÊN** trong CASE: dòng showroom có
   `out_qty = return_qty = 0` nên nhánh cân bằng `return_qty = out_qty` sẽ nuốt nó nếu đặt sau.

`enriched` giữ vai trò "tầng duy nhất nơi tồn tại đúng dòng người dùng nhìn thấy" — rows, count
và totals đều đọc từ đó, nên footer không thể mô tả một tập khác lưới, và `buildReportColumnFilter`
vẫn áp trên đúng một chỗ.

Frontend không có logic mới: hai chỗ hard-code danh sách trạng thái đổi thành import
`TEMP_WAREHOUSE_OUT_STATUS_OPTIONS` (AC-07).

## Contracts

**Không đổi schema, không migration.** Truy vấn đọc thêm `invoices` / `invoice_items` (đã có sẵn).

| Hợp đồng | Trạng thái | Ghi chú |
|---|---|---|
| `TempWarehouseIssueRow` (13 field) | **không đổi** | |
| `TempWarehouseReportResult` `{data, total, totals}` | **không đổi** | |
| `TempWarehouseReportQuery` | **không đổi** | 6 tham số, giữ nguyên thứ tự |
| `TEMP_WAREHOUSE_OUT_STATUS_OPTIONS` | 5 → **6** | Thêm `Bán hàng kho tạm`; `Bán hàng trưng bày` giữ lại nhưng đổi nghĩa — giờ là hàng showroom bán ra thật, không còn là nhãn sai của luồng kho tạm |
| Cột báo cáo (`COLUMNS` trong `temp-warehouse-out.report.ts`) | **không đổi** | 13 cột, nhãn VI giữ nguyên |
| Report key của cache | `...goods2` → `...goods3` | **Không phải** `CACHE_NAMESPACE` (vẫn `'inventory-reports:v2'`) — nó là thành phần đầu của cache key `${reportKey}:${orgId}:${hash}`. Chỉ che đường REST v1; đường report-registry (`SearchInventoryReportHandler`, key `sha256(orgId + dto)`, không có version token) vẫn trả nhãn cũ tối đa 45s sau deploy — chấp nhận |
| OpenAPI / `packages/api-client` | **không đổi** | Không endpoint mới, không field mới ⇒ không cần `pnpm openapi:generate` |

Giá trị filter vẫn là chuỗi tiếng Việt backend phát ra (A-12) — đổi sang mã enum sẽ phá template
báo cáo người dùng đã lưu và URL đã chia sẻ.

## Alternatives rejected

| Option | Why not |
|---|---|
| Bỏ hẳn nguồn showroom, báo cáo chỉ đọc `temp_warehouse_lines` | Đã ship ở `#184` rồi bị đảo: chủ sở hữu cần báo cáo phủ cả hai luồng bán (ADR-06). Đánh đổi tỉ lệ dòng vẫn còn, đã được chấp nhận |
| Giữ nguồn showroom nhưng ẩn sau bộ lọc "Nguồn hàng", mặc định tắt | Vẫn là phương án chưa dùng tới. Nếu tỉ lệ dòng thành vấn đề thật khi vận hành, đây là chỗ quay lại trước tiên |
| Tách theo `temp_warehouse_lines.source_location_id` (kho thường vs showroom) | Cột đi theo `direction` của chính dòng đó, nullable, do người dùng chọn tay ở toolbar POS; đường checkout không bao giờ ghi nó (A-R2) |
| Tách theo `temp_warehouse_sessions.direction` | Mọi dòng đã bán đều thuộc phiên `warehouse_to_showroom` (`:1266-1271` hard-code chiều này) ⇒ không phân biệt được gì |
| Backfill `invoice_id` cho dòng trước 25/06/2026 bằng ghép FIFO theo (mặt hàng, thời gian, chi nhánh) | Không có khóa ghép ngược nào (A-R3); ghi đè chứng từ đã post bằng phỏng đoán (ADR-03) |

## Error taxonomy

| Tình huống | Xử lý | Nơi phát |
|---|---|---|
| Cột hoặc khóa lọc không có trong catalog | `BadRequestException` | `assertKnownColumns` (`report-data.util.ts:21`) — hành vi sẵn có, không đổi |
| Kết quả vượt 50.000 dòng | `BadRequestException` "narrow the period or filters" | `assertUnderRowCap` (`row-cap.util.ts:24`) — **áp lực tăng** do nguồn showroom; kỳ lọc rộng có thể chạm trần và fail export. Chưa chạm trên dữ liệu hiện có |
| Không có dòng nào khớp | `{data: [], total: 0, totals: <các số 0>}`, không ném lỗi | `list()` thoát sớm — giữ nguyên |
| `carrier_user_id` không tra được người dùng | `LEFT JOIN users` → `staff` rỗng, không lỗi | `enriched` — giữ nguyên |
| Không resolve được vị trí kệ | Hai LATERAL trả NULL → `location` rỗng | Giữ nguyên |
| Dữ liệu trước 25/06/2026 không có `invoice_id` | **Không phải lỗi runtime**; dòng đó đọc `Chuyển kho xuất đi` hoặc `Xuất không bán`. Hạn chế đã biết, ADR-03 | — |
| Đóng kho tạm (mọi chế độ) | **Không đổi dòng nào trên báo cáo.** `NONE` không đụng gì; `NET_OFFSET` chèn dòng `AUTO_BALANCED` mà báo cáo lọc bỏ, dòng gốc vẫn ACTIVE; `CREATE_TRANSFERS` post phiếu thật nhưng chỉ ghi cột trên *session*, `temp_warehouse_lines.transfer_id` vẫn NULL. Hành vi có chủ đích, có test khoá | AC-11 |
| Hóa đơn bị hủy sau khi đã tiêu thụ kho tạm | **Defect có sẵn, không sửa ở đây**: nhánh showroom loại nó qua `inv.status <> 'cancelled'`, nhánh kho tạm không join `invoices` nên vẫn đọc `Bán hàng kho tạm`. Có test e2e khẳng định hành vi hiện tại | ADR-05 mục 3 |

## ADRs

### ADR-07 — SL tồn trừ luôn phần đã "Xử lý chuyển kho"

**Status:** accepted (2026-08-17)

**Bối cảnh.** Cột SL tồn được mô tả là "số còn lại ở kho tạm", công thức
`SL xuất − SL trả − SL bán`. Nó **không đọc `transfer_id`**, nên một dòng đã bấm "Xử lý chuyển kho"
báo SL tồn = 1: nhãn nói hàng đã chuyển đi, con số nói còn nằm trong kho tạm.

Điều làm rõ vấn đề là mô hình tồn kho: **kho tạm không có tồn kho riêng** — không có location nào
đại diện cho nó trong `stock_balances`, và `addLine` không ghi sổ gì cả. Hàng chỉ dịch chuyển khi
một phiếu chuyển kho được post. Nên "còn ở kho tạm" thực chất nghĩa là **đã dịch chuyển vật lý
nhưng chưa hạch toán**. Phiếu post xong thì hết treo, bất kể vì bán hay vì chuyển kho thủ công.

**Quyết định.** Trừ thêm một vế ở `paired`:
```sql
- (e.transfer_id IS NOT NULL AND e.invoice_id IS NULL)::int
```
Vế `AND e.invoice_id IS NULL` là bắt buộc: dòng đã bán mang **cả** `transfer_id` lẫn `invoice_id`
(`fulfillInvoiceFromTempWarehouse` ghi cùng lúc), không chặn thì bị trừ hai lần và SL tồn ra −1.

**Hệ quả.** Trên `erp_dev` không đổi số nào — chi nhánh HCM có 0 dòng chuyển kho thủ công, nên
defect này chưa từng lộ ra trên dữ liệu thật. Đó cũng là lý do nó sống sót tới giờ. Sau khi seed
một dòng chuyển kho thủ công, dòng đó về đúng SL tồn = 0.

Không đụng phía trả: một dòng trả lẻ vẫn giữ SL tồn = −1 kể cả khi đã chuyển kho — con số đó bù cho
lần xuất nằm ngoài kỳ, là thiết bị net chứ không phải đếm vật lý.

### ADR-06 — Khôi phục nguồn bán showroom; báo cáo phủ cả hai luồng bán

**Status:** accepted (2026-08-16) — **thay thế ADR-05**

**Bối cảnh.** ADR-05 gỡ nguồn `invoice_items` vì nó chiếm 64/71 dòng, làm 90% nội dung của một báo
cáo tên "xuất kho tạm" là hàng chưa từng vào kho tạm. Bản một-nguồn đã ship (`#184`).

Chủ sở hữu đảo quyết định ngày 2026-08-16: báo cáo cần **cả hai** nhãn. Đánh đổi tỉ lệ dòng được
nêu lại trước khi làm và vẫn được chọn.

**Quyết định.** Khôi phục `tw_claimed`, `showroom`, `movements`, cột `source` và nhánh
`WHEN p.source = 'showroom'`. `TEMP_WAREHOUSE_OUT_STATUS_OPTIONS` về 6 giá trị.

**Hệ quả.** Trên `erp_dev` kỳ 08/2026 chi nhánh HCM: 76 dòng, trong đó 69 `Bán hàng trưng bày`,
4 `Bán hàng kho tạm`, 3 `Xuất không bán`. Bất biến "tổng SL bán mỗi hóa đơn = SL OUT của hóa đơn"
giữ trên 22/22 hóa đơn. Rủi ro chạm trần 50.000 dòng khi xuất Excel quay lại — chưa chạm, theo dõi.

**Điều đáng ghi hơn cả quyết định.** Đây là lần đảo thứ hai trên cùng một câu hỏi phạm vi. Cái giá
không nằm ở việc viết lại SQL — nó nằm ở chỗ **bản hai nguồn chưa từng được commit**: nó chỉ sống
trong working tree của phiên trước, nên lần này phải dựng lại từ đặc tả trong `T-02-01`/`T-02-02`
thay vì `git revert`. Đặc tả đủ chi tiết để dựng lại đúng, kể cả ba bản vá từ review (ép
`AT TIME ZONE 'UTC'`, gộp `SUM/MAX` trước khi trừ, danh sách cột tường minh cho `movements`) — đó
là lý do duy nhất việc này rẻ. Bài học: khi một hướng đã chạy đúng và có test, **commit nó lại**
trước khi gỡ, dù đang định gỡ; một commit bị revert rẻ hơn một bản dựng lại từ trí nhớ.

### ADR-05 — Gỡ nguồn bán showroom; báo cáo chỉ đọc `temp_warehouse_lines`

**Status:** superseded by ADR-06 (2026-08-16) — đã ship ở `#184` rồi bị đảo

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

**Status:** accepted lại theo ADR-06 (2026-08-16) — cách suy diễn này quay lại hiệu lực

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

**Status:** accepted lại theo ADR-06 (2026-08-16) — báo cáo đọc `invoice_items` trở lại, nên quyết định "không thêm cột provenance" lại có hiệu lực

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

**Status:** accepted lại theo ADR-06 (2026-08-16) — nhánh `source` đã quay lại và ĐANG đứng đầu CASE đúng vì ADR này; đây là ràng buộc đúng-đắn còn hiệu lực, không phải lịch sử

**Bối cảnh.** Dòng showroom có `out_qty = 0` và `return_qty = 0`. Nhánh sẵn có
`WHEN p.return_qty = p.out_qty THEN ''` khớp `0 = 0`, nên sẽ gán chuỗi rỗng cho mọi dòng showroom
nếu thứ tự không đổi.

**Quyết định.** `WHEN p.source = 'showroom'` là nhánh đầu tiên; năm nhánh còn lại giữ nguyên thứ tự
tương đối để không đổi nghĩa các trạng thái đang dùng (AC-04).

**Hệ quả.** Thứ tự nhánh trở thành ràng buộc đúng-đắn, không phải phong cách. Ghi rõ trong
doc-comment đầu file để lần sửa sau không đảo lại. Test AC-04 khóa hành vi của năm nhãn cũ.
