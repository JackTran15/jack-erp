# Logical design — transfer-summary-drilldown

## Approach

Ba khối, theo đúng thứ tự phụ thuộc: **sửa số → mở tầng L1 → mở tầng L2/L3**. Khối sau không thể
đúng nếu khối trước sai, vì drill-down phải cộng về đúng ô đã mở ra nó.

### Khối 1 — Định nghĩa lại "thực nhận" bằng phép ghép chứng từ

Một vị ngữ SQL, export một lần, dùng ở bốn nơi (báo cáo 6, L1, L2 `leg='received'`, L3
`leg='unmatched'`). Đặt trong `transfer-report.service.ts`:

```ts
/** Chân nhập đã ghép của một phiếu xuất điều chuyển hai pha.
 *  reference_id NULL (phiếu lập tay) không bao giờ khớp — xem ADR-02. */
export const PAIRED_RECEIPT_EXISTS = (gi: string) => `
  ${gi}.reference_type = 'TRANSFER_ORDER'
  AND ${gi}.reference_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM goods_receipts gr_p
    WHERE gr_p.organization_id = ${gi}.organization_id
      AND gr_p.status = 'POSTED' AND gr_p.purpose = 'TRANSFER_IN'
      AND gr_p.reference_type = 'STOCK_TRANSFER'
      AND gr_p.reference_id = ${gi}.reference_id
  )`;
```

`summarize()` đổi ba chỗ:

1. `SELECT b.code AS branch_code` ở truy vấn ngoài; `branchCode: r.branch_code ?? null`; xoá
   comment lỗi thời ở `:27, :35-36`.
2. **Xoá nhánh UNION thứ 6** (`:313-328` — phiếu nhập quy về `gr.source_branch_id`). `received`
   không còn đến từ phía phiếu nhập, ở bất cứ đâu.
3. Nhánh 4 (chân xuất hai pha) gánh thêm `received` trên **chính dòng** đã sinh `out`:

```sql
CASE WHEN ${PAIRED} THEN gil.quantity::numeric ELSE 0 END AS received_qty,
CASE WHEN ${PAIRED} THEN (gil.quantity*gil.unit_price)::numeric ELSE 0 END AS received_value
```

Nhánh 1–3 (`stock_transfers`) không đụng tới (ADR-03). Đây là chỗ bất biến `diff ≤ 0` (AC-03)
thành lập: `received` là **tập con** của `out`, không phải một đại lượng độc lập được so sánh.

`transfer-summary.report.ts` gắn thêm `[REPORT_ROW_BRANCH_ID]: r.branchId` **sau** projection —
`projectRows`/`paginateRows` cắt mọi key ngoài `dto.columns`; mẫu ở `invoice-order-listing.report.ts:95`.

### Khối 2 — L1: `summarizeByCounterpart()`

Cùng file, cùng bốn vị ngữ, thêm `= $anchor` và chuyển `GROUP BY` sang phía đối ứng. Hai statement
dùng chung một CTE (`dataSql` / `countSql`), **phân trang trong SQL** — `report-definitions.guard.spec.ts:51,57`
chỉ miễn trừ `transfer-summary.report.ts` khỏi luật cấm `paginateRows`.

```
1) ST cũ, neo = nguồn:   OUT + RECEIVED,          đối ứng = destination_branch_id
2) ST cũ, neo = đích:    IN,                      đối ứng = source_branch_id
3) GI hai pha, neo = nơi xuất: OUT + RECEIVED có điều kiện, đối ứng = target_branch_id
4) GR hai pha, neo = nơi nhập: IN,                đối ứng = source_branch_id
```

Vì bốn nhánh này là bốn nhánh của báo cáo 6 cộng đúng một vị ngữ, **Σ dòng L1 ≡ dòng cha** trên cả
sáu chỉ tiêu — AC-07 đúng theo cấu trúc, không phải theo may mắn. Spec ở T-02-02 chạy cả hai truy
vấn trên cùng seed và so từng chỉ tiêu.

### Khối 3 — L2/L3: `transfer-detail.service.ts`

Một engine, một tham số `leg ∈ 'in' | 'out' | 'received' | 'unmatched'`, hai report definition ở
trên. Với `out`/`received`/`unmatched`, phiếu xuất là chứng từ chính và `LEFT JOIN LATERAL` tra
chứng từ đối ứng qua `reference_id`; với `in`, phiếu nhập là chính và LATERAL chạy ngược.

```sql
LEFT JOIN LATERAL (
  SELECT gr.document_number, gr.posted_at FROM goods_receipts gr
  WHERE gr.organization_id = gi.organization_id
    AND gr.status='POSTED' AND gr.purpose='TRANSFER_IN'
    AND gr.reference_type='STOCK_TRANSFER' AND gr.reference_id = gi.reference_id
  ORDER BY gr.posted_at ASC LIMIT 1
) pair ON gi.reference_type='TRANSFER_ORDER' AND gi.reference_id IS NOT NULL
...
AND ($leg <> 'received'  OR pair.document_number IS NOT NULL)
AND ($leg <> 'unmatched' OR pair.document_number IS NULL)
```

Nhánh `stock_transfers` bị loại khỏi `leg='unmatched'` bằng `$leg <> 'unmatched'` (ADR-03), và lấy
giá từ `COALESCE(i.purchase_price, 0)` **chứ không phải** `stl.unit_price` — dù cột đó có tồn tại
(`stock-transfer-line.entity.ts:54-71`) — vì báo cáo 6 làm vậy; dùng giá thật ở đây sẽ khiến L2
không cộng về ô đã mở ra nó.

Cột "Kho" lấy `COALESCE(sg.name, loc.name)` qua `locations.storage_id → storages`; mẫu join ở
`stock-period.service.ts:577-580`. **Cả `dataSql` lẫn `countSql` phải mang cùng bộ join** — thiếu
một cái là spec tham chiếu `ic.name` vỡ 42P01 (mẫu `document-detail.service.ts:164-169`).

### Khối 4 — Frontend

Toàn bộ nằm trong hạ tầng có sẵn của [[sales-report-km-and-drilldown]]. Ba việc:

1. **Cờ `link` cho catalog inventory** — `link?: boolean` trên `InventoryColumnDef`, và
   `if (d.link) header.link = true` trong `inventory-report-column.util.ts`. Opt-in nên 8 báo cáo
   kho còn lại không đổi (A-08).
2. **Định dạng số trong ô link** — `ReportPageTableView.tsx:484-497` tính `display` một lần rồi
   mới bọc `<a>` (A-09).
3. **Dialog mở được dialog** — `ReportDrillDownBody` mount thêm `<ReportDrillDownMount />`. Đệ quy
   tự dừng, z-index đã giải sẵn (A-06).

Ba resolver mới trong `_lib/report-drilldown.ts`, kế thừa filter bằng **allow-list tường minh**
theo đúng luật của ADR-01 feature trước. Logic đảo chiều xuất/nhập nằm **duy nhất** trong
`transferDocs(leg)`.

## Alternatives rejected

| Option | Why not |
|---|---|
| Giữ nguyên công thức, chỉ thêm drill-down để người dùng tự diễn giải | Không giải quyết vấn đề gốc. Người dùng vẫn nhìn thấy "xuất 127 nhập về 173" và vẫn phải hỏi. Đã trình bày và người dùng chọn sửa công thức |
| Chặn post phiếu nhập vượt số đã xuất, ở `goods-receipt.service` | Chạm luồng nghiệp vụ chứ không chỉ tầng đọc; rủi ro cao hơn hẳn. Không sửa được dữ liệu lịch sử. Đã trình bày, người dùng chọn không làm |
| Ghép hai chân theo cặp chi nhánh + kỳ, kẹp trần ở số đã xuất | Vẫn ghép sai cặp khi có nhiều chuyến trong kỳ; dialog L3 sẽ trộn hai loại dòng có ý nghĩa khác nhau; và cái trần là một phép chữa cháy không có nghĩa nghiệp vụ. Liên kết thật đã tồn tại — dùng nó |
| Chặn `EXISTS` ở `gr.posted_at < periodEnd` để kỳ đã chốt tái lập được | Người dùng chọn ngược lại (D3): ưu tiên "đến giờ này vẫn chưa ai nhận" để truy được hàng thất lạc. Fixture TO-4 giữ lại để quyết định này kiểm chứng được, và đảo lại là sửa một dòng |
| Mở rộng `document-detail.service.ts` (Báo cáo 2) thay vì viết service mới | Xem ADR-04 |
| Coi phiếu lập tay như tự xác nhận (`received = out`) | Xem ADR-02 |
| Dùng `transfer_orders.export_goods_issue_id` / `import_goods_receipt_id` để ghép | Hai cột này bị set NULL khi phiếu nhập bị xoá/đảo (`goods-receipt.service.ts:624-640`) nên mất mát với dữ liệu lịch sử. `gr.reference_id` sống sót trên chính dòng phiếu nhập |
| Cho ô "Chênh lệch thực nhận" của **báo cáo cha** click được | Một dòng cha gộp nhiều chi nhánh đối ứng nên phụ đề không gọi tên được "cửa hàng nhập", và cần thêm một biến thể truy vấn không-cặp. MISA cũng chỉ mở từ tầng L1 |
| Dựng sẵn hạ tầng drill-down cho `StorageReportShell` | File đã bị xoá trong working tree (A-07). Dựng cho một nhánh có thể không xảy ra là chi phí chắc chắn đổi lấy lợi ích không chắc chắn. Ticket dự phòng mô tả ở ADR-06 |
| Gộp L3 thành `leg` thứ tư của report type L2 | Nhãn báo cáo đi vào tên file xuất khẩu/in (`get-inventory-report-document.handler.ts:81`); gộp thì file L3 mang tên L2 |

## Contracts

### Backend — khoá báo cáo mới

`packages/shared-interfaces/src/inventory-report/column.ts`:

| Khoá | Nhãn VI | Grain |
|---|---|---|
| `inventory-transfer-summary-by-counterpart` | Chi tiết nhập xuất điều chuyển theo cửa hàng | chi nhánh đối ứng |
| `inventory-transfer-document-detail` | Chi tiết phiếu nhập xuất điều chuyển theo cửa hàng và chứng từ | dòng chứng từ |
| `inventory-transfer-difference-detail` | Chi tiết chênh lệch điều chuyển | dòng chứng từ chưa ghép |

`INVENTORY_REPORT_TYPE_LABELS_VI` và `INVENTORY_REPORT_COLUMN_LABELS_VI` là
`Record<InventoryReportKey, …>` nên TypeScript **bắt buộc** điền — đó là chốt chặn chống quên.

Cột L2: `date`, `documentNumber`, `referenceDate`, `reference`, `warehouse`, `sku`, `name`,
`unit`, `qty`, `unitPrice`, `value`, `parentSku`, `parentName`, `group`. L3 = L2 trừ `warehouse`.
Nhãn: `Ngày chứng từ`, `Số chứng từ`, `Ngày chứng từ tham chiếu`, `Tham chiếu`, `Kho`, `Mã SKU`,
`Tên hàng hóa`, `Đơn vị tính`, `Số lượng`, `Đơn giá`, `Giá trị`, `SKU mẫu mã`, `Tên mẫu mã`,
`Nhóm hàng`.

L1 dùng đúng 12 khoá cột và 5 dải của `inventory-transfer-summary`.

### Backend — DTO

`sourceStoreId` / `receivingStoreIds` **đã có sẵn** (`inventory-report/search.ts:57-60`,
`inventory-report-filter.dto.ts:83-92`) và ánh xạ đúng nơi xuất / nơi nhập. Thêm đúng một trường:

```ts
export const TRANSFER_LEGS = ['in','out','received','unmatched'] as const;
export type TransferLeg = (typeof TRANSFER_LEGS)[number];

@ApiPropertyOptional({ enum: TRANSFER_LEGS })
@IsOptional() @IsIn(TRANSFER_LEGS as unknown as string[])
transferLeg?: TransferLeg;
```

`ValidationPipe` chạy `forbidNonWhitelisted: true` ⇒ không khai thì request 400.

L1 **không** cần trường mới: neo lấy từ `filters.store = { scope:'group', storeIds:[branchId] }`,
tái dùng `resolveInventoryBranchIds` nên thừa hưởng luôn clamp 403/400; definition từ chối nếu
không đúng một id.

Thêm `REPORT_ROW_BRANCH_ID = '_branchId'` cạnh `REPORT_ROW_INVOICE_ID`
(`invoice-report/search.ts:136`).

**`pnpm openapi:generate` là bắt buộc** (`transferLeg` đổi schema body
`POST /reports/inventory/search`). Chạy **một lần**, sau khi UOW-02 của
[[stock-by-store-branch-scope]] land — snapshot hiện còn 8 path `GET /reports/inventory/*` mà nó
đã xoá.

### Frontend — hợp đồng drill-down

```
"inventory-transfer-summary": { branchName: transferByCounterpart }
"inventory-transfer-summary-by-counterpart": {
  inQty: transferDocs("in"), outQty: transferDocs("out"),
  receivedQty: transferDocs("received"), diffQty: transferDifferenceDetail,
}
```

Allow-list filter, **không spread**:

| Tầng | Filter chuyển đi |
|---|---|
| L1 | `STORE = {scope:"group", storeIds:[branchId]}` (thay thế, không kế thừa), `REPORT_PERIOD`, `RANGE_DATE` |
| L2/L3 | `SOURCE_STORE`, `RECEIVING_STORE`, `TRANSFER_LEG`, `REPORT_PERIOD`, `RANGE_DATE` |

L2/L3 **không** chuyển `STORE` — cặp chi nhánh đã quyết định phạm vi, gửi cả hai là mời gọi mâu
thuẫn. Không chuyển `PRODUCT_GROUP`/`SKU`/`BRAND` — báo cáo cha không có các dòng filter đó nên
chuyển sang chỉ mang state cũ.

Dòng filter mới `TRANSFER_LEG = 'transfer_leg'` theo mẫu `SKU` (`report-filters.constant.ts:20-22`
— "Không phải một ô nhập liệu"), thêm vào `ReportFilterValues` và map trong
`buildInventorySearchFilters`.

Ba report type mới **không** được thêm vào `STORAGE_REPORTS` (`report-category.constant.ts`) — đã
kiểm chứng đó là mảng tường minh chứ không phải `Object.values` như `REPORT_TYPE_SALES`, nên
dialog-only report type ở ngoài ô chọn báo cáo (AC-14). Cũng **không** thêm vào
`SINGLE_MODE_HEADER_STORE_REPORTS` (`inventory-report-v2.api.ts:27-34`): set đó ghi đè
`payload.store` bằng chi nhánh trên header, sẽ tiêm một `store` scope mâu thuẫn với cặp xuất/nhập.

## Error taxonomy

| Tình huống | Tầng xử lý | Hành vi |
|---|---|---|
| Ô giá trị 0, hoặc thiếu `_branchId` trên dòng | Resolver FE | Trả `null` ⇒ ô là text thường. Dialog rỗng tệ hơn ô không bấm được (AC-13) |
| `filters.store` của L1 không đúng một chi nhánh | Report definition | `BadRequestException` — dialog luôn được mở từ một dòng, nên nhiều hơn một id là lỗi lập trình, không phải lỗi người dùng |
| Chi nhánh neo ngoài quyền của actor | `resolveInventoryBranchIds` / `permittedBranchIds` | 403 như mọi báo cáo kho khác; không tự ý thu hẹp im lặng |
| Chi nhánh đối ứng không thuộc tổ chức | Report definition L2/L3 | `BadRequestException`; mẫu `transfer-by-store.report.ts:118-148` |
| `transferLeg` không thuộc enum | `ValidationPipe` toàn cục | 400 |
| Phiếu xuất `reference_id IS NULL` | SQL | Không bao giờ khớp `PAIRED_RECEIPT_EXISTS` ⇒ `received = 0`, nằm trong L3 (AC-04). **Không phải lỗi** — là quy tắc |
| Một phiếu xuất ghép nhiều phiếu nhập | LATERAL `ORDER BY posted_at ASC LIMIT 1` | Lấy phiếu nhập sớm nhất làm Tham chiếu. Ghép ở mức chứng từ nên không có khái niệm "ghép một phần" |
| Cặp chi nhánh không có chứng từ nào trong kỳ | SQL | 0 dòng, `total: 0`. Không thể xảy ra qua đường drill-down vì ô 0 không click được |
| Dev server chưa bật khi chạy verify | ai-dlc-verify | Toàn bộ bước đỏ với `ERR_CONNECTION_REFUSED`; T-04-04 bật server trước |

## ADRs

### ADR-01 — Ghép hai chân bằng `transfer_orders.id`, `received` đo bằng số lượng của phiếu xuất
**Status:** accepted

Hôm nay `received` được cộng từ **phía phiếu nhập** (nhánh UNION 6), rồi đem so với `out` cộng từ
phía phiếu xuất. Hai vế là hai tập dòng khác nhau, mỗi vế lọc theo `posted_at` của chứng từ của
chính nó, chỉ chung nhau cặp chi nhánh. Vì thế `received > out` xảy ra ở biên kỳ, khi nhập trùng,
và khi luồng cũ bị cộng hai lần.

Quyết định: `received` đo bằng **số lượng của chính dòng phiếu xuất**, có điều kiện *"tồn tại phiếu
nhập đã post ghép được"*. Hệ quả không phải là một cải thiện về độ chính xác mà là một **thay đổi
về loại**: `received` trở thành tập con của `out`, nên `diff ≤ 0` là bất biến cấu trúc, và
`|diff|` chính xác bằng tập kết quả của L3. Việc đối chiếu giữa các tầng do đó là hệ quả, không
phải thứ phải đi kiểm tra.

Đánh đổi đã chấp nhận: mọi kỳ lịch sử sẽ đổi số. Phiếu nhập trong kỳ mà phiếu xuất ở kỳ trước hết
được tính; phiếu nhập trùng hết làm phồng số. Phải ghi vào release note.

Không chặn `gr.posted_at < periodEnd` (D3 của người dùng): "chênh lệch" nghĩa là *"đến giờ này vẫn
chưa ai nhận"*. Đổi lại, số của kỳ đã chốt sẽ đổi khi phiếu nhập về muộn. Fixture TO-4 tồn tại
riêng để quyết định này kiểm chứng được, và đảo lại là sửa một dòng.

### ADR-02 — Phiếu điều chuyển lập tay (`reference_id IS NULL`) tính là chưa xác nhận nhận
**Status:** accepted

`GoodsIssueFormDialog` cho tạo thẳng phiếu xuất "Điều chuyển đến cửa hàng khác" và
`GoodsReceiptFormDialog` cho tạo thẳng phiếu nhập "Điều chuyển", cả hai không qua `transfer_orders`
nên `reference_id` NULL và **không bao giờ ghép được**.

Phương án bị loại: coi chúng như tự xác nhận (`received = out`, giống luồng legacy). Sạch hơn về
mặt nhiễu, nhưng biến một khoảng trống dữ liệu thật thành một con số khẳng định điều mà hệ thống
không biết.

Quyết định của người dùng: `received = 0`. Chúng nằm vĩnh viễn trong L3. Đánh đổi được nêu rõ
trước khi chốt và người dùng chấp nhận. Rủi ro còn lại là A-02 — nếu vận hành dùng nhiều luồng lập
tay thì cột chênh lệch thành nhiễu; T-01-04 đếm số phiếu này và báo lại **trước khi** merge UoW-1,
đủ để mở lại quyết định qua `aidlc reopen G2` nếu cần.

### ADR-03 — Luồng `stock_transfers` cũ giữ nguyên, `received = out`
**Status:** accepted

Chứng từ nguyên tử: POSTED ghi cả hai chân trong một transaction, không có chứng từ đối ứng để
ghép. Cho nó đi qua phép ghép mới sẽ khiến mọi điều chuyển legacy thành "chưa nhận" — sai, và ồn.

Giữ nhánh 1–3 nguyên vẹn; loại nhánh ST khỏi `leg='unmatched'`. Hệ quả: L3 chỉ nói về luồng hai
pha, và điều đó đúng — chỉ luồng hai pha mới có khái niệm "chưa xác nhận nhận".

### ADR-04 — Service mới `transfer-detail.service.ts`, không mở rộng `document-detail.service.ts`
**Status:** accepted

Mở rộng Báo cáo 2 sẽ phải luồn sáu tham số qua một truy vấn 560 dòng — lọc `purpose`, cặp chi
nhánh **có thứ tự**, `leg`, tra chứng từ ghép (số **và** ngày), join kho, vị ngữ matched/unmatched
— tất cả đều chết trên đường Báo cáo 2 thật sự đi, và tất cả đều rơi vào một CTE đang nuôi cả
đường export keyset với bộ spec riêng.

Grain khác nhau về bản chất: dòng của Báo cáo 2 là **một chứng từ độc lập**; dòng của L2/L3 là
**một chân của một cặp**, mang theo chứng từ đối ứng. ~300 dòng chuyên dụng rẻ hơn ~120 dòng điều
kiện bôi khắp một truy vấn dùng chung, và giữ được AC-15 (Báo cáo 2 không xê dịch).

Symbol dùng chung duy nhất giữa hai file là `PAIRED_RECEIPT_EXISTS`.

### ADR-05 — Dialog mở được dialog, bằng cách `ReportDrillDownBody` tự mount lại `ReportDrillDownMount`
**Status:** accepted

L2 và L3 mở từ **bên trong** dialog L1. Hôm nay `ReportDrillDownBody` chỉ mount lại
`InvoiceDetailDialog`, nên tối đa hai tầng.

`ReportDrillDownMount` đọc `useReportStore(s => s.drillDown)`; đặt trong `ReportStoreProvider`
lồng thì đó là store lồng, nên click ô ở L1 mở L2 dưới một provider nữa. Đệ quy tự dừng vì
`drillDown` ở tầng trong cùng là `null`. z-index đã giải sẵn (`app-modal.tsx:18-19, 381-383`,
stack modal ở module scope), tiền lệ `InvoiceDetailDialog` mở từ trong drill-down dialog đã verify
xanh.

`tableInitialState` dùng chung id `${category}-${branch}-drilldown` ở mọi tầng: `tableId` được lưu
vào state và **không đọc ở đâu cả** (`table.factory.ts:32`, `table.interface.ts:33`), không persist
localStorage. Không phải lỗi — **đừng "sửa"**.

### ADR-06 — Không dựng trước hạ tầng drill-down cho `StorageReportShell`
**Status:** accepted

Stack SINGLE đã bị xoá trong working tree bởi [[stock-by-store-branch-scope]] UOW-02;
`/reports/inventory` route sang `ReportPage` cho cả hai `STORE_TYPE`, nên một bản cài đặt phục vụ
cả hai chế độ xem.

Nếu UOW-02 đó bị revert: thêm `linkColumns: string[]` + `onCellClick(row, key)` vào
`StorageReportShell` và render `ReportDrillDownDialog` từ trang storage, bọc trong một
`ReportStoreProvider` tối thiểu chỉ cấp `category`/`branch`. **Tái dùng thân dialog**, không dựng
bảng thứ hai — `ReportDrillDownDialog` vốn tự chứa và chỉ đọc đúng hai trường từ store bao ngoài;
dựng lại sort/pin/filter cột/footer server/export bên trong `StorageReportShell` là nhân đôi
~1.500 dòng đang chạy tốt.

Không dựng sẵn: chi phí chắc chắn đổi lấy lợi ích không chắc chắn.

### ADR-07 — Cờ `link` cấp từ catalog backend, không từ registry FE
**Status:** accepted

Trên đường v2, `ReportTableConfigSync` ghi đè config registry mỗi khi
`columnsResult.columns.length > 0`, và `mapHeadersToTableConfig` (`invoice-report.api.ts:109`) đọc
`h.link`. Phía invoice có `LINK_COLUMNS` (`report-column.util.ts:15, 53`); phía inventory chưa có
tương đương — `buildInventoryHeaders` chưa bao giờ set `link`.

Chỉ khai `link: true` ở registry FE thì ô sẽ click được lúc có lúc không, tuỳ template cột đã lưu.
Vì vậy thêm `link?: boolean` vào `InventoryColumnDef` (opt-in, 8 báo cáo kho còn lại không đổi), và
vẫn khai ở registry FE cho nhánh fallback. Spec ở T-02-03 assert đúng những cột dự kiến mang cờ.
