---
feature: report-row-cap-pushdown
adr_count: 6
---

# Logical design — Đẩy phân trang và lọc cột của báo cáo kho v2 xuống SQL

## Approach

Bảy định nghĩa báo cáo kho v2 hiện đóng vai một tầng truy vấn thứ hai viết bằng
JavaScript: chúng xin engine cả tập (`pageSize: MAX_REPORT_ROWS`), rồi tự lọc, tự cộng
tổng, tự cắt trang. Các engine bên dưới **đã** làm được cả ba việc đó dưới SQL — đường
GET cũ dùng đúng như vậy và không bao giờ chạm trần. Vì thế đây không phải bài toán
tối ưu truy vấn mà là bài toán gỡ bỏ một tầng: xoá tầng JS đi, và chuyển hợp đồng
(`page`, `limit`, `columnFilters`, `filters.unit`, `filters.brand`) xuống thẳng engine.

Mỗi định nghĩa `buildData` sau khi sửa rút về đúng một hình:

```ts
const result = await this.<engine>.aggregate({
  ...scope,
  page: dto.page ?? 1,
  pageSize: dto.limit ?? 20,
  columnFilters: toEngineFilters(dto.columnFilters, KEY_MAP, filters),
});
return {
  rows: projectRows(result.data.map(this.toRow), dto.columns),
  totals: toTotalsRow(dto.columns, result.totals),
  total: result.total,
};
```

Không còn `assertUnderRowCap`, không còn `applyColumnFilters`, không còn `paginateRows`,
không còn `buildTotalsRow`. `totals` giờ đến từ SQL của engine thay vì được cộng lại
trong RAM.

Ba việc phải làm để hình trên chạy được, và chúng chính là ba nhóm ticket:

1. **Lớp chuyển đổi từ vựng.** v2 nói `ColumnFilterDto[]` (`{col, contains, gte, …}`),
   engine nói `Record<string, ReportColumnFilterDto>` (`{operator, value, from, to}`).
   Thêm nữa, khoá cột của báo cáo không trùng tên field của engine. Một hàm dùng chung
   `toEngineFilters(filters, keyMap, scopeFilters)` lo cả hai, và gộp luôn
   `filters.unit` / `filters.brand` vào cùng một map (A-11).
2. **Mở rộng `ReportColumnSpecs` của từng engine** cho tới khi phủ hết cột của báo cáo.
   Đây là phần nặng, và nặng không đều — xem ma trận bên dưới.
3. **`countRows()` cho sáu định nghĩa không dùng con trỏ.** Trần rời khỏi `buildData`
   nên phải có chỗ khác đỡ đường export (ADR-01).

## Alternatives rejected

| Option | Why not |
|---|---|
| Chỉ nâng `MAX_REPORT_ROWS` lên 200000 | Mua thêm vài tháng rồi vỡ lại, và trong lúc đó mỗi lần mở báo cáo vẫn nạp 74515 dòng vào RAM để trả về 50 dòng. Không giải quyết cái gì cả |
| Bỏ `assertUnderRowCap` mà không đẩy pushdown | Hết 400, đổi thành chậm và tốn RAM — và đường export mất luôn chỗ chặn duy nhất (A-06, A-12) |
| Giữ hai đường: có filter JS-only thì rơi về materialize, không thì đi SQL | Hai đường dẫn cho cùng một báo cáo là hai bộ số phải tự khớp nhau mãi mãi. Đúng cái bẫy mà `buildReportColumnFilter` được viết ra để tránh ("một mảnh, ba chỗ dùng") |
| Cột chưa có SQL thì trả 400 vĩnh viễn | Là bước lùi tính năng cho các tổ chức đang dưới trần: hôm nay họ lọc được Nhóm hàng và Nhà cung cấp. Quyết định của chủ sản phẩm 2026-08-22: mở rộng SQL cho hết |
| Dựng bảng snapshot tồn kho theo ngày | Đã cân nhắc và **hoãn có chủ ý** ở đợt khảo sát trước: sửa nghĩa `posted_at` sẽ khiến `posted_at` backdate được, nên snapshot cần cơ chế vô hiệu hoá theo ngày chứng từ. Làm snapshot trước là cache những con số sắp bị định nghĩa lại |
| Đổi giao diện để lưới tự phân trang phía client | Lưới đã gửi `page`/`limit`/`columnFilters` xuống server từ trước; vấn đề nằm hoàn toàn ở phía máy chủ |

## Ma trận độ phủ — cột báo cáo so với spec SQL hiện có

Số cột thiếu spec quyết định kích thước từng UoW. `→` là ánh xạ khoá cần khai báo trong
`keyMap`; `✚` là spec phải viết mới.

| Báo cáo | Engine | Cột | Đã có spec | Phải viết mới |
|---|---|---|---|---|
| temp-warehouse-out | TempWarehouseReport | 13 | 13 (khớp khoá 1-1) | **0** — thả vào là chạy |
| stock-summary | StockPeriod | 24 | 12 (`name→itemName`, `endingQty→closingQty`, …) | **12** ✚ parentSku, parentName, color, size, group, positionCode, positionName, supplier, 4 cột điều chuyển |
| stock-summary-by-store | StockPeriod | 19 | 12 | **7** ✚ parentSku, parentName, color, size, group, branchCode, branch |
| stock-quantity-detail | StockPeriod | 26 | 15 (`inTotal→inQty`, `inPurchase→inQtyPurchase`, …) | **5** ✚ parentSku, parentName, color, size, group (6 cột còn lại là chỗ trống, A-05) |
| transfer-by-store | TransferReport | 16 | 7 | **9** ✚ parentSku, parentName, color, size, group, brand, targetBranch, outAvgPrice, inAvgPrice |
| document-detail | DocumentDetail | 27 | 11 (`reference→referenceNumber`) | **16** ✚ date, documentType, warehouse, notes, group, parentSku, parentName, color, size, inSalePrice, outSalePrice, customer, 4 cột chi nhánh |
| stock-by-store-pivot | StockBalancePivot | 10 + động | **0** (engine chỉ băm vào khoá cache, A-09) | **10 + động** ✚ toàn bộ, cộng specs sinh động cho `branch.qty.<id>` |

Ba báo cáo dùng chung `StockPeriodService` nên phần lớn spec mới ở đó dùng lại được:
viết một lần cho `parentSku` / `parentName` / `color` / `size` / `group` là cả ba hưởng.

## Contracts

Không có hợp đồng HTTP nào thay đổi. `InventoryReportSearchDto`,
`InventoryReportResult`, và cả bảy endpoint giữ nguyên chữ ký — không cần chạy
`openapi:generate`, không đụng `packages/api-client`.

Hợp đồng nội bộ mới, đặt cạnh `report-column-filter.util.ts`:

```ts
/** Khoá cột của báo cáo → tên field mà engine hiểu. Khoá vắng mặt nghĩa là trùng tên. */
export type ReportKeyMap = Readonly<Record<string, string>>;

/**
 * Chuyển từ vựng của lưới sang từ vựng của engine.
 * Ném BadRequest khi một cột mang nhiều hơn một toán tử (ADR-02).
 */
export function toEngineFilters(
  filters: ColumnFilterDto[] | undefined,
  keyMap: ReportKeyMap,
): Record<string, ReportColumnFilterDto>;
```

Bổ sung vào hợp đồng `ReportDefinition` — đã khai báo sẵn ở `report-definition.ts:65`,
chỉ là chưa định nghĩa nào cài đặt:

```ts
countRows?(dto: TDto, actor: ActorContext): Promise<CountedRows>;
```

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| Ma trận cột → biểu thức SQL | `ReportColumnSpecs` của từng engine, trong `services/*.ts` | Tĩnh, trừ specs sinh động của bảng pivot |
| Ánh xạ khoá báo cáo → field engine | Hằng `KEY_MAP` cạnh `COLUMNS` trong từng `*.report.ts` | Tĩnh |
| Phân trang, count, tổng toàn tập | Engine, dưới SQL | Một request |
| Trần số dòng | `report-core/row-cap.util.ts`, gọi từ `ReportExportService` | Chỉ đường export và print |
| Kết quả đã cache | `SearchInventoryReportHandler`, Redis, 45s | Không đổi trong feature này |

## Error taxonomy

| Condition | Failure subtype | UI |
|---|---|---|
| Lọc một cột không có trong catalog của báo cáo | `BadRequestException` — `Unknown report columns: <keys>` (`assertKnownColumns`, sẵn có) | Toast lỗi; là lỗi lập trình phía lưới |
| Lọc một cột có trong catalog nhưng chưa có biểu thức SQL | `BadRequestException` — `Cột "<key>" không hỗ trợ lọc trên báo cáo này` (`buildReportColumnFilter`, sẵn có) | Toast lỗi. Trạng thái trung gian giữa các UoW; hết khi UoW cuối đóng (AC-11) |
| Một cột mang nhiều toán tử | `BadRequestException` nêu tên cột và các toán tử xung đột (mới, ADR-02) | Toast lỗi; lưới không sinh ra được tình huống này (A-01) |
| Export / print vượt trần | `BadRequestException` — `Report exceeds 50000 rows (N)` từ `assertUnderRowCap` qua `countRows()` | Toast lỗi trước khi tải file, đúng như hôm nay |
| Search vượt trần | **Không còn tồn tại** — đây chính là lỗi cần diệt | — |
| Join thiếu ở câu count | Lỗi Postgres 42P01 lúc chạy | Phải chặn bằng test trước khi giao (A-08) |

## Observability

`assertUnderRowCap` chỉ còn được gọi từ `ReportExportService`. Sau khi giao, mọi
`Report exceeds` xuất hiện trong log kèm đường `search` đều là hồi quy — một định nghĩa
còn sót `assertUnderRowCap` trong `buildData`. Một test canh trực tiếp điều đó: quét
thư mục `report/reports/` và khẳng định không file nào còn tham chiếu
`assertUnderRowCap` hay `MAX_REPORT_ROWS` (T-01-05).

`ReportExportService.onComplete` đã ghi số dòng thật của mỗi lần export; con số đó
không đổi nghĩa.

## ADRs

### ADR-01 — Trần chuyển từ `buildData` sang `countRows()`, trong cùng một lượt

**Context:** `ReportExportService.prepareExport` (`report-export.service.ts:183-186`)
chỉ gọi `assertUnderRowCap` khi định nghĩa có `countRows()`. Không định nghĩa kho nào
trong sáu cái không-cursor cài đặt `countRows()`. Nghĩa là thứ duy nhất đang canh đường
export hôm nay là lời gọi `assertUnderRowCap` **bên trong** `buildData` — đúng lời gọi
mà feature này phải gỡ.

**Decision:** Không UoW nào được gỡ `assertUnderRowCap` khỏi một `buildData` mà không
bổ sung `countRows()` cho chính định nghĩa đó trong cùng lượt. Hai thay đổi luôn nằm
chung một ticket, không tách.

**Consequences:** Mỗi UoW gánh thêm một ticket `countRows()` và một test export. Đổi lại,
không có cửa sổ thời gian nào đường export chạy không người canh. `document-detail` là
ngoại lệ hợp lệ: nó có `exportSource` nên stream bằng con trỏ và cố ý không áp trần.

**Status:** accepted

---

### ADR-02 — Adapter từ chối nhiều toán tử, không lặng lẽ bỏ bớt

**Context:** `ColumnFilterDto` diễn đạt toán tử bằng tên trường (`gt`, `lt`, `contains`)
nên một cột mang được nhiều toán tử cùng lúc; `ReportColumnFilterDto` chỉ có một
`operator` cộng cặp `from`/`to`. `gte`+`lte` chuyển được thành khoảng; `gt`+`lt` thì không.

**Decision:** Adapter ném `BadRequestException` nêu tên cột và các toán tử xung đột.
Không đoán, không chọn một vế.

**Consequences:** Một tổ hợp mà lưới không bao giờ sinh ra (A-01) trở thành lỗi rõ ràng
thay vì một trang lọc thiếu trông như đã lọc đủ. Client tự dựng nào đang gửi tổ hợp đó
sẽ vỡ — và đáng vỡ, vì hôm nay nó đang nhận kết quả sai âm thầm.

**Status:** accepted

---

### ADR-03 — Khoá cột của báo cáo là từ vựng ở biên; engine giữ tên field của nó

**Context:** Lưới gửi `name`, `endingQty`, `reference`, `inTotal`. Engine biết
`itemName`, `closingQty`, `referenceNumber`, `inQty`. Có ba chỗ đặt phép ánh xạ: giao
diện (đã có `toColumnFilterPayload`, nhưng chỉ cho các trang GET cũ), DTO, hoặc định
nghĩa báo cáo.

**Decision:** Đặt ở định nghĩa báo cáo — mỗi `*.report.ts` mang một hằng `KEY_MAP` nằm
cạnh `COLUMNS` của chính nó. Giao diện và DTO không đổi.

**Consequences:** Catalog cột và phép ánh xạ của nó nằm cạnh nhau, đọc một chỗ là đủ.
Một engine phục vụ nhiều báo cáo với khoá khác nhau (`StockPeriodService` phục vụ ba)
không phải biết báo cáo nào gọi mình. Đổi lại, thêm một hằng cho mỗi báo cáo, và một
test khẳng định mọi khoá trong `COLUMNS` đều tra ra spec — nếu không thì đó là cột chỉ
hiển thị được chứ không lọc được, và phải cố ý ghi ra như vậy.

**Status:** accepted

---

### ADR-04 — Câu count phải mang đúng bộ join của câu dữ liệu

**Context:** `StockPeriodService.buildItemSqls` dựng `dataSql` với join `locations`,
`products`, `inventory_item_categories`, nhưng `countSql` chỉ join `items`
(`stock-period.service.ts:499-556`). Cùng một mảnh vị từ đi vào cả hai. Ngay khi có một
spec trỏ tới `ic.name` hay `loc.code`, câu count vỡ với 42P01.

**Decision:** Mọi spec văn bản mới phải kèm join tương ứng vào **cả hai** câu. Nếu một
join làm nở số dòng ở câu count thì phải viết lại thành `EXISTS`, không được để lệch.

**Consequences:** Câu count đắt hơn. Đây là cái giá phải trả để footer và lưới không bao
giờ mô tả hai tập khác nhau — đúng bất biến mà `buildReportColumnFilter` được viết ra
để giữ. Mỗi spec mới đi kèm một test chạy thật cả câu dữ liệu lẫn câu count.

**Status:** accepted

---

### ADR-05 — Chuyển hẳn từng báo cáo một, không giữ đường JS song song

**Context:** Cám dỗ tự nhiên là giữ đường JS làm bản dự phòng cho những cột chưa có spec.

**Decision:** Mỗi UoW chuyển trọn một báo cáo sang SQL và xoá đường JS của nó ngay trong
lượt đó. Cột chưa có spec trả 400 (hành vi sẵn có), không rơi về JS.

**Consequences:** Có một khoảng thời gian giữa các UoW mà vài cột lọc được hôm qua thì
hôm nay trả 400. Đó là lý do thứ tự UoW bắt đầu bằng báo cáo có sẵn độ phủ đầy đủ
(`temp-warehouse-out`, 0 spec mới) và các UoW của cùng một báo cáo đi liền nhau. Đổi lại,
không bao giờ có hai bộ số phải tự khớp nhau, và không có cột nào lọc sai âm thầm.

**Status:** accepted

---

### ADR-06 — `filters.unit` và `filters.brand` gộp vào `columnFilters`, không thêm trường mới vào engine

**Context:** Hai bộ lọc trên thanh lọc hiện lọc bằng JS ở năm báo cáo. `periodColumnSpecs`
đã có sẵn spec SQL cho `unit` và `brand`.

**Decision:** Adapter gộp chúng vào map `columnFilters` dưới dạng toán tử `EQUALS`, thay
vì thêm `unit?` / `brand?` vào `StockPeriodQuery`.

**Consequences:** Không đụng chữ ký engine nên đường GET cũ không chịu rủi ro (A-10).
Nghĩa của phép so khớp đổi nhẹ: JS dùng `===` phân biệt hoa thường, SQL dùng
`LOWER(...) = LOWER(...)` — cùng hướng với A-02 và cùng nghĩa với đường GET cũ. Nếu
người dùng lọc cả thanh lọc lẫn ô lọc trên cùng một cột, hai vị từ phải AND với nhau
chứ không đè lên nhau; adapter chịu trách nhiệm và có test riêng.

**Status:** accepted

---

### ADR-07 — Cột "Sắp nhận về" được sửa đúng thay vì port nguyên quy tắc cũ

**Context:** ADR-05 và UOW-03 ban đầu giả định bốn cột điều chuyển chỉ cần port nguyên
nghĩa từ `applyPendingTransfers` sang SQL. Khi bắt tay vào T-03-03 thì phát hiện không
port được:

- `applyPendingTransfers` khử trùng cột "Sắp nhận về" theo cặp (mã hàng, chi nhánh đích)
  và **chỉ cộng lượt pending đầu tiên**. Mã hàng được chuyển tới cùng một đích từ hai
  nguồn khác nhau vì thế bị **đếm thiếu**. Test `stock-period.service.spec.ts` đã ghim
  hành vi này và nói thẳng: *"Đặc tả hiện trạng, không phải hành vi mong muốn."*
- Tệ hơn: "lượt đầu tiên" **không xác định**. `loadPendingTransfers` không có `ORDER BY`,
  nên lượt nào thắng là do Postgres quyết định, và có thể đổi giữa hai lần chạy.

Không có nghĩa nào để port. Mọi bản SQL đều phải chọn một thứ tự, và lựa chọn đó tự nó
đã đổi kết quả so với production.

**Decision:** Sửa đúng. Cộng **đủ mọi** lượt pending về cùng một chi nhánh đích, bỏ hẳn
phép khử trùng. Chủ sản phẩm chốt 2026-08-22.

Ở lưới gộp theo vị trí thì phát sinh câu hỏi thứ hai: `transfer_orders` chỉ ghi chi nhánh
đích, **không có vị trí đích** — nên một con số mức chi nhánh phải hạ xuống một dòng mức
vị trí. Quy tắc: gán vào **vị trí tiếp nhận mặc định** của chi nhánh đích — vị trí thuộc
kho có `storages.is_default_receiving`, ưu tiên `locations.is_default`, không có thì
`locations.is_unassigned`.

**Consequences:**

- Cột "Sắp nhận về" tăng với mã hàng được chuyển từ nhiều nguồn về cùng một đích. Đây là
  sửa lỗi, và là **thay đổi số nhìn thấy được** — cần nói rõ với người dùng khi phát hành.
- Số trở nên xác định: cùng dữ liệu cho cùng kết quả, ở cả hai đường JS và SQL.
- Quy tắc vị trí tiếp nhận đã kiểm trên `erp_dev`: 3/3 chi nhánh có kho nhận mặc định, và
  **3/3 kho đó có đúng một** vị trí `is_default` hoặc `is_unassigned` (không cái nào có
  cả hai, không cái nào có số khác 1). Truy vấn vẫn sắp thứ tự tường minh
  (`is_default DESC, is_unassigned DESC, code ASC LIMIT 1`) để một chi nhánh cấu hình
  lệch cũng cho kết quả xác định thay vì tuỳ Postgres.
- Chi nhánh chưa đặt kho nhận mặc định sẽ không có dòng nào nhận con số đó. Không có trên
  `erp_dev`, nhưng phải là một test tường minh chứ không phải một giả định.
- **Sửa lại ghi chú ban đầu:** không có hai đường để lệch. `runStockPeriod` của đường GET
  cũ gọi **đúng** `StockPeriodService.aggregate` mà đường v2 gọi
  (`inventory-reports.service.ts:433`), nên sửa một chỗ là cả hai đổi cùng lúc. Đơn giản
  hơn dự tính, và không có cửa sổ nào hai màn hình nói hai con số.
- `applyPendingTransfers`, `totalPendingTransfers`, `buildRowKeysSql` và
  `loadPendingTransfers` mất hết người gọi sau thay đổi này. Chúng là rác do chính thay
  đổi này sinh ra nên bị xoá cùng lượt, không để lại.
- Ba test đang ghim hành vi cũ (`chỉ tính lượt pending đầu tiên...` và hai test kề) vì thế
  không còn đặc tả gì cả — phải viết lại, không phải giữ.

**Status:** accepted
