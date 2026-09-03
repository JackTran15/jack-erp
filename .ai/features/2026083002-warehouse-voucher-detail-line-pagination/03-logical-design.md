---
feature: warehouse-voucher-detail-line-pagination
adr_count: 9
---

# Logical design — Phân trang dòng hàng trong dialog xem chi tiết phiếu nhập / phiếu xuất

## Approach

Ba lớp việc, xếp theo thứ tự bắt buộc.

**1. Cho dòng phiếu xuất một thứ tự thật.** `goods_issue_lines` nhận cột mới
`line_no integer NOT NULL`, đánh số từ 1 trong phạm vi từng phiếu. Migration viết tay
(A-06) gồm: thêm cột cho phép NULL, backfill bằng
`ROW_NUMBER() OVER (PARTITION BY goods_issue_id ORDER BY id)`, đặt `NOT NULL`, rồi
thêm unique index `(goods_issue_id, line_no)`. `GoodsIssueService.getLines`
(`goods-issue.service.ts:796`) đổi `order: { id: 'ASC' }` thành
`order: { lineNo: 'ASC' }`; đường tạo và đường sửa phiếu gán `lineNo` theo đúng thứ tự
mảng dòng nhận được. Phía phiếu nhập **không đụng** — đã có `createdAt` và đã sắp đúng
(A-05).

**2. Cho `GET /:id` một lối ra không kèm dòng.** Cả hai endpoint chi tiết nhận thêm
query param `includeLines` mặc định `true`. Đường mở dialog xem chi tiết
(`GoodsIssuePage.tsx:598`, và đường tương ứng ở `PurchaseOrdersPage`) gọi với
`includeLines=false`, nên phần đầu phiếu về nhẹ còn dòng đi đường riêng. Mặc định giữ
`true` để `GET /:id` đang dùng cho gom mã vạch (`GoodsIssuePage.tsx:534`) và cho
deep-link không phải sửa.

**3. Lưới dòng ở chế độ xem đọc từ endpoint phân trang.** Trong cả hai dialog, khi
`mode === "view"`, mảng `lines` không còn khởi tạo từ `initial.lines`
(`GoodsIssueFormDialog.tsx:439-442`) mà lấy từ `useQuery` trên `/:id/lines` với
`page` và `pageSize`, ghép cùng `PaginationControls` sẵn có. Hai chế độ còn lại giữ
nguyên đường cũ, không đổi một dòng nào.

**4. Lọc dòng đi xuống server, và đường đọc dòng đổi hình.** *(bổ sung 2026-09-03)*
`GET /:id/lines` bị **xoá** ở cả hai controller, thay bằng
`POST /v2/inventory/goods-issues/:id/lines/search` và
`POST /v2/goods-receipts/:id/lines/search`, dựng đúng theo mẫu CQRS V2 đang chạy cho
danh sách phiếu: DTO ghép từ `StringFilterDto` / `CompareFilterDto`, một `*.query.ts`,
một `@QueryHandler` dùng `FilterBuilder`, controller `@Version('2')` dispatch qua
`QueryBus`. Cả hai module đã import `CqrsModule` và đã có sẵn một controller V2 để gắn
thêm route (`goods-issue/controllers/goods-issue-v2.controller.ts`,
`goods-receipt/controllers/goods-receipt-v2.controller.ts`), nên không phải dựng lớp mới.

Handler join `items` để lọc theo mã và tên, tính `total` cùng `totals` trên **cùng điều
kiện lọc** (ADR-08), và sắp `line_no ASC` — cố định trong handler, không có tham số nào
đổi được (ADR-07). Kiểm tra tồn tại và phạm vi vẫn là cú `findOne` gọn trên phiếu cha
với `loadEagerRelations: false`, đúng như `getLines` đang làm, nên `organizationId` +
`branchId` và `@RequirePermission` không đổi.

Phía web, `LineItemGrid` chuyển sang **chế độ có kiểm soát** ở chế độ xem: dialog truyền
`filters` và `onFilterChange`, giữ state lọc, debounce rồi nhét vào `queryKey`. Chế độ
tạo và sửa **không truyền** hai prop đó nên vẫn chạy không kiểm soát trên dòng đang soạn
(AC-16) — điều này quan trọng vì ở chế độ có kiểm soát, `rowIndex` mà lưới trả về là chỉ
số trong mảng **đã lọc**; ở chế độ xem lưới chỉ đọc nên vô hại, ở chế độ sửa thì sẽ sửa
nhầm dòng.

`packages/ui` nhận thêm một cờ `filterable?: boolean` trên `LineColumn` để tắt ô lọc của
Kho / Vị trí / ĐVT (AC-15). Đây là thay đổi duy nhất chạm vào thư viện dùng chung, và nó
cộng thêm chứ không đổi hành vi mặc định.

Điểm rủi ro lớn nhất phía web không nằm ở lưới mà ở **các effect bám vào `lines`**:
`GoodsIssueFormDialog.tsx:239-320` giải kệ ưu tiên và đoán kho cho từng dòng. Chúng
được viết cho dữ liệu đang soạn, và chạy trên một trang dòng ở chế độ xem là vừa thừa
vừa có thể ghi đè dữ liệu đã lưu. Mọi effect loại này phải được chặn bằng `isView`.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Cắt trang ở client trên mảng `initial.lines` đã tải | Akenzy chọn server-side (A-02). Client-side chỉ chữa được độ giật khi render, payload vẫn tỉ lệ với số dòng |
| Dựng endpoint phân trang mới cho dòng phiếu | Hai endpoint đã tồn tại và đã có consumer chạy trong sản phẩm (A-03, A-11). Dựng thêm là trùng lặp |
| Cuộn vô hạn như panel chi tiết ở `GoodsIssuePage.tsx:879` | Người dùng cần nhảy tới một dòng cụ thể và cần biết phiếu có bao nhiêu dòng. Cuộn vô hạn giấu cả hai |
| Bỏ `lines` khỏi `GET /:id` luôn thay vì thêm cờ | Đường gom mã vạch đang dựa vào việc `GET /:id` trả đủ dòng (`GoodsIssuePage.tsx:534`). Bỏ đi là làm hỏng chức năng in tem |
| Thêm `created_at` cho `goods_issue_lines` để giống phía phiếu nhập | Backfill sẽ phải điền cùng một giá trị cho mọi dòng của một phiếu, nên vẫn không sắp được. Cột số thứ tự tường minh mới giải được (ADR-01) |
| Tách thứ tự dòng ra feature riêng, làm phân trang trước | Cắt trang biến thứ tự tuỳ ý thành lỗi thấy rõ ở trang 1 (A-12). Giao phân trang trước là giao một hồi quy |
| Giữ lọc ở client, chỉ tải hết dòng lại khi người dùng bắt đầu gõ | Đúng cái mà A-02 đã bác: payload lại tỉ lệ với số dòng, và tệ hơn — nó chỉ nặng vào đúng lúc người dùng đang chờ kết quả tìm |
| Thêm query param lọc vào `GET /:id/lines` thay vì dựng POST search | Lọc gồm cả toán tử (`*`, `≤`) chứ không chỉ giá trị, nên nhét vào query string là tự phát minh một cú pháp mã hoá thứ hai trong repo. Mẫu V2 đã giải xong bài này bằng body (A-13) |
| Giữ `GET /:id/lines` bên cạnh endpoint mới cho panel cuộn vô hạn | Akenzy chọn thay thế (A-13). Hai đường đọc dòng song song là đúng loại phân đôi ADR-04 đã cảnh báo, và panel đó chỉ là một chỗ sửa |
| Một ô tìm kiếm chung cho cả lưới thay vì lọc theo từng cột | Lưới đã render sẵn một ô lọc mỗi cột và người dùng đã quen. Gộp về một ô là đổi giao diện chứ không phải sửa lỗi |
| Lọc được cả cột Kho và Vị trí | Akenzy chọn không (A-15). Cần join thêm `locations` + kho, mà hai cột đó gần như luôn giống nhau trên cả phiếu nên lọc theo chúng lọc ra gần như cả phiếu |

## Domain model

| Entity | Thay đổi | Ghi chú |
| --- | --- | --- |
| `GoodsIssueLineEntity` | thêm `lineNo: number` (`line_no`) | Đánh số từ 1, duy nhất trong phạm vi một phiếu |
| `GoodsReceiptLineEntity` | thêm `lineNo: number` (`line_no`) | *Sửa 2026-09-03 (A-14).* Trước đó ghi "không đổi". `created_at` vẫn còn và vẫn đúng, nhưng thứ tự đọc ra chuyển sang `line_no` để hai loại phiếu dùng chung một cơ chế |

## Contracts

### GET /inventory/goods-issues/:id và GET /goods-receipts/:id
Thêm query param `includeLines` kiểu boolean, mặc định `true`.
`includeLines=false` trả đúng phần đầu phiếu, trường `lines` vắng mặt.
Failure modes giữ nguyên: 401, 403 thiếu quyền, 404 ngoài phạm vi chi nhánh.

### ~~GET /inventory/goods-issues/:id/lines và GET /goods-receipts/:id/lines~~ — XOÁ

*Quyết định 2026-09-03 (A-13, ADR-06).* Hai route này bị gỡ khỏi controller cùng với
`getLines` ở hai service. Consumer duy nhất ngoài dialog là panel chi tiết cuộn vô hạn ở
`GoodsIssuePage.tsx:879`, chuyển sang endpoint mới trong cùng UoW.

### POST /v2/inventory/goods-issues/:id/lines/search và POST /v2/goods-receipts/:id/lines/search

Gắn vào `GoodsIssueV2Controller` / `GoodsReceiptV2Controller` sẵn có, `@Version('2')`,
giữ nguyên `@RequirePermission('inventory.goods-issue.read')` /
`@RequirePermission('goods_receipt.read')` và `@RequireBranchScope()`.

Request body (`GoodsIssueLineSearchV2Dto` / `GoodsReceiptLineSearchV2Dto`):

```ts
{
  page?: number;                 // mặc định 1
  limit?: number;                // mặc định 50, tối đa 200
  itemCode?: StringFilterDto;    // cột Mã SKU   → items.code
  itemName?: StringFilterDto;    // cột Tên hàng hóa → items.name
  quantity?: CompareFilterDto;   // cột Số lượng
  unitPrice?: CompareFilterDto;  // cột Đơn giá
  lineTotal?: CompareFilterDto;  // cột Thành tiền → quantity * unit_price (ADR-07)
}
```

**Không có** trường `sort`, `orderBy` hay tương đương. Đó là cách "luôn theo line-order"
được thi hành bằng hợp đồng chứ bằng quy ước — không ai thêm được sắp xếp mà không phải
sửa DTO và bị nhìn thấy trong review.

Response, theo đúng envelope của các endpoint search V2 khác:

```ts
{
  data: Line[];    // đã join item + location, sắp line_no ASC
  total: number;   // số dòng KHỚP ĐIỀU KIỆN LỌC, không phải số dòng của phiếu
  page: number;
  limit: number;
  totals: { totalQuantity: number; totalAmount: number };  // cũng trên tập đã lọc (ADR-08)
}
```

Failure modes: 401; 403 thiếu quyền; 404 khi phiếu không tồn tại hoặc ngoài phạm vi chi
nhánh — giữ nguyên thông điệp tiếng Việt mà `getLines` đang ném.

Cả `GET /:id` (từ T-02-01) lẫn hai endpoint mới đều đổi bề mặt OpenAPI, nên phải chạy
`pnpm openapi:generate` và commit `openapi.snapshot.json` cùng
`packages/api-client/src/generated/schema.ts`.

### LineColumn (packages/ui)

Thêm `filterable?: boolean`, mặc định `true`. `false` thì ô lọc của cột đó render rỗng
và không gõ được. Cộng thêm, không đổi hành vi sẵn có.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Trang hiện tại của lưới dòng | state cục bộ trong dialog | Mỗi lần mở dialog, reset khi đóng |
| Một trang dòng | TanStack Query, key `["goods-issue-lines", id, page, pageSize, filters]` | Theo cache của query |
| Điều kiện lọc của lưới ở chế độ xem | state cục bộ trong dialog, debounce trước khi vào `queryKey` | Mỗi lần mở dialog; đổi lọc thì reset về trang 1 |
| Điều kiện lọc ở chế độ tạo và sửa | `LineItemGrid` tự giữ (không kiểm soát), như hôm nay | Theo vòng đời lưới |
| Phần đầu phiếu ở chế độ xem | prop `initial` do trang truyền vào, như hiện tại | Mỗi lần mở dialog |
| Mảng dòng ở chế độ tạo và sửa | `useState<FormLine[]>` như hiện tại | Không đổi |

## Error taxonomy

| Condition | Failure subtype | UI |
| --- | --- | --- |
| Request lấy dòng lỗi mạng | `NetworkFailure` | Lưới hiện trạng thái lỗi kèm nút thử lại, phần đầu phiếu vẫn đọc được |
| Trang vượt quá tổng số trang | không phải lỗi | Trả trang rỗng; điều khiển phân trang không cho bấm quá trang cuối (AC-07) |
| Phiếu không thuộc chi nhánh đang chọn | 404 như hiện tại | Toast lỗi, dialog không mở |
| Thiếu quyền đọc | 403 | Toast lỗi, dialog không mở |
| Lọc không khớp dòng nào | không phải lỗi | Lưới hiện `noMatchText`, chân lưới hiện 0/0/0, thanh phân trang báo tổng 0 |
| Người dùng đổi lọc khi đang ở trang 5 | không phải lỗi | Reset về trang 1 trước khi bắn request, nếu không sẽ hiện trang rỗng của một tập nhỏ hơn |
| Giá trị số gõ dở trong ô `≤` ("1," hoặc "-") | không phải lỗi | Không bắn request, giữ nguyên kết quả đang hiện — cùng luật với `parseVnNumber` của lưới hôm nay |
| Backfill `line_no` gặp phiếu không có dòng nào | không phải lỗi | `ROW_NUMBER` không sinh hàng nào, phiếu rỗng vẫn hợp lệ |
| Migration chạy lại | đã chặn từ thiết kế | Kiểm tra cột tồn tại trước khi thêm; backfill chỉ chạm dòng còn NULL |

## Cache and offline

Không có yêu cầu offline. Cache là cache mặc định của TanStack Query. Khi lưu phiếu ở
chế độ sửa, phải huỷ hiệu lực theo tiền tố `["goods-issue-lines", id]` và
`["goods-receipt-lines", id]` để lần xem sau không đọc trang cũ.

## Observability

Không thêm sự kiện hay chỉ số mới. Số đo trước và sau của thời gian mở dialog trên
phiếu 200 dòng được ghi tay vào bằng chứng G4, không đo tự động.

## ADRs

### ADR-01 — Dùng cột số thứ tự tường minh, không dùng dấu thời gian
**Context:** `goods_issue_lines` không có cột nào biểu diễn được thứ tự nhập, và dữ
liệu cũ không còn nguồn nào khôi phục thứ tự gốc (A-07).
**Decision:** Thêm `line_no integer NOT NULL`, duy nhất theo `(goods_issue_id, line_no)`,
gán theo thứ tự mảng dòng nhận được ở đường tạo và đường sửa.
**Consequences:** Thứ tự trở thành dữ liệu tường minh, đọc là hiểu, không phụ thuộc độ
phân giải đồng hồ hay thứ tự chèn. Cái giá là một migration có backfill trên bảng đang
chạy, cộng ràng buộc mới mà mọi đường ghi dòng phiếu xuất từ nay phải tôn trọng — kể cả
đường nhập từ Excel và đường sinh phiếu tự động từ lệnh điều chuyển.
**Status:** accepted

### ADR-02 — Thứ tự phiếu cũ lấy thứ tự hiện hành làm gốc, và nói thẳng điều đó
**Context:** Backfill phải chọn một thứ tự cho dòng của phiếu đã tồn tại, mà thứ tự gõ
ban đầu thì đã mất.
**Decision:** ~~`ROW_NUMBER() OVER (PARTITION BY goods_issue_id ORDER BY id)`.~~
**THAY THẾ 2026-09-03 bởi ADR-09** — `ORDER BY ctid`.
**Consequences:** Lập luận gốc ("thứ tự gõ ban đầu đã mất, chỉ còn cách đóng băng thứ tự
đang hiển thị") **sai**, và sai theo hướng tốn kém: thứ tự vẫn còn, nằm trong thứ tự vật
lý của hàng. `ORDER BY id` không đóng băng "thứ tự đang hiển thị" mà đóng băng **nhiễu** —
đo trên `prod_3008`, nó cho 50,7 % cặp dòng liền kề có mã tăng dần, tức đúng bằng tung
đồng xu (A-20).
**Status:** superseded by ADR-09

### ADR-03 — `GET /:id` giữ dòng theo mặc định, chỉ bỏ khi được yêu cầu
**Context:** Payload nặng nằm ở `GET /:id`, nhưng có chức năng khác đang dựa vào việc
nó trả đủ dòng.
**Decision:** Thêm `includeLines` mặc định `true`; chỉ đường mở dialog xem chi tiết
truyền `false`.
**Consequences:** Tương thích ngược tuyệt đối, không caller nào phải sửa. Cái giá là
một cờ trên hợp đồng API và một trường có thể vắng mặt trong kiểu trả về, nên phía web
phải xử lý `lines` không tồn tại thay vì mảng rỗng.
**Status:** accepted

### ADR-04 — Chỉ chế độ xem được phân trang; chế độ tạo và sửa không đụng tới
**Context:** Chế độ tạo và sửa phải giữ toàn bộ dòng chưa lưu trong bộ nhớ để validate
và gửi đi một lượt.
**Decision:** Phân trang chỉ áp cho `mode === "view"`. Hai chế độ kia giữ nguyên đường
`initial.lines` và lưới không cắt trang.
**Consequences:** Trong mỗi dialog sẽ tồn tại hai nguồn dòng song song, rẽ theo `mode` —
một sự phân đôi mà người đọc mã sau này dễ tưởng là rác và dọn nhầm. Bù lại, rủi ro mất
dữ liệu khi soạn phiếu bằng không, và đây là ranh giới Akenzy đã chốt (A-01). Mọi effect
đang bám vào `lines` phải được chặn bằng `isView`, nếu không chúng sẽ chạy trên dữ liệu
một trang và có thể ghi đè dữ liệu đã lưu.
**Status:** accepted

### ADR-05 — Phiếu nhập cũng nhận `line_no`, dù `created_at` đang chạy đúng
**Context:** `goods_receipt_lines` có `@CreateDateColumn` và `getLines` sắp theo nó, cho
ra đúng thứ tự nhập. A-05 kết luận từ đó là "không cần migration", và ADR-01 chỉ áp cho
phiếu xuất. Sau khi phiếu xuất có `line_no`, hai bảng dòng của hai loại phiếu song sinh
biểu diễn cùng một khái niệm bằng hai cơ chế khác nhau.
**Decision:** Thêm `line_no integer NOT NULL` cho `goods_receipt_lines`, unique theo
`(goods_receipt_id, line_no)`, backfill bằng
`ROW_NUMBER() OVER (PARTITION BY goods_receipt_id ORDER BY created_at, id)`. `getLines`
đổi sang `order: { lineNo: 'ASC' }`. Mọi đường ghi dòng phiếu nhập gán `lineNo` theo chỉ
số mảng, gồm cả đường sinh phiếu nhập từ kiểm kê (`stock-take.service.ts:1590`) và
handler v2 (`create-goods-receipt-v2.handler.ts:100`).
**Consequences:** Phần "thêm cột" của quyết định này vẫn đứng. Phần **nguồn của backfill**
thì sai: câu "backfill chép lại đúng thứ tự thật mà `created_at` đang giữ" bị dữ liệu thật
bác bỏ. Trên `prod_3008`, `created_at` **không phân biệt được** thứ tự dòng ở bất kỳ phiếu
nhiều dòng nào — 463/627 phiếu có trùng, chiếm 162.612/162.776 dòng, và phiếu lớn nhất có
**5.000 dòng cùng một `created_at`** (A-21). Điều đó biến `ORDER BY created_at, id` thành
`ORDER BY id`, tức thành nhiễu, ở gần như toàn bảng. Nó cũng có nghĩa `getLines` **hôm nay**
đang trả thứ tự không xác định cho những phiếu đó, chứ không chỉ là chuyện của backfill.
Nguồn thứ tự chuyển sang ADR-09; phần còn lại của ADR-05 giữ nguyên.
**Status:** amended by ADR-09

### ADR-06 — Thay `GET /:id/lines` bằng `POST .../lines/search`, không giữ song song
**Context:** Lọc mang theo toán tử (`*`, `≤`) chứ không chỉ giá trị. Nhét vào query
string là tự phát minh cú pháp mã hoá thứ hai, trong khi repo đã có mẫu V2 giải xong bài
này bằng body. `GET /:id/lines` có đúng một consumer khác là panel cuộn vô hạn.
**Decision:** Dựng `POST /v2/.../:id/lines/search` theo mẫu CQRS V2, chuyển panel cuộn vô
hạn sang nó, rồi **xoá** `GET /:id/lines` và `getLines` ở cả hai service.
**Consequences:** Một đường đọc dòng duy nhất, không có phân đôi để người sau đoán nhầm.
Cái giá: breaking change trên bề mặt API — chấp nhận được vì cả hai consumer đều nằm
trong repo này và được sửa trong cùng UoW; nhưng bất kỳ client ngoài nào (không biết cái
nào) sẽ gãy. Phải chạy lại `openapi:generate`, và phải grep toàn repo cho `"/lines"` chứ
đừng tin trí nhớ về việc chỉ có hai consumer.
**Status:** accepted

### ADR-07 — Chỉ năm cột lọc được, và ba cột kia phải tắt ô lọc tường minh
**Context:** Lưới render một ô lọc cho **mọi** cột. Cột Kho, Vị trí, ĐVT là dữ liệu join
qua `locations` và `items`; đưa chúng xuống server tốn thêm join, mà trên thực tế gần như
mọi dòng của một phiếu dùng chung một kho nên lọc theo chúng lọc ra gần như cả phiếu.
**Decision:** Lọc phía server mở cho Mã SKU, Tên hàng hóa, Số lượng, Đơn giá, Thành tiền.
Ba cột kia nhận `filterable: false` ở chế độ xem, ô lọc render rỗng và không gõ được. Cột
Thành tiền lọc theo `quantity * unit_price` — cùng công thức mà lưới đang hiện và cùng
công thức `TOTAL_AMOUNT_SUBQUERY` của search danh sách phiếu dùng, chứ không theo cột
`line_total` (A-18).
**Consequences:** Không có ô lọc nào gõ được mà không lọc gì — đó là toàn bộ lý do phải
thêm cờ vào `packages/ui` thay vì chỉ bỏ qua ở handler. Rủi ro còn lại: nếu có dòng nào
mà `line_total` khác `quantity * unit_price` (dữ liệu cũ, hoặc chiết khấu ghi thẳng vào
`line_total`), lọc theo Thành tiền sẽ lọc trên một con số khác con số đang hiện. A-18 để
mở đúng chỗ này và phải kiểm bằng dữ liệu thật trước khi đóng G5.
**Status:** accepted

### ADR-08 — Ba số ở chân lưới theo tập đã lọc, đảo quy ước "totals are document-wide"
**Context:** `line-item-grid.tsx:107` ghi rõ totals là của cả chứng từ nên không đi theo
bộ lọc, và T-02-02 đã dựng chân lưới đọc `totalQuantity`/`totalAmount` tính SUM toàn
phiếu. Nhưng khi người dùng lọc ra ba dòng, câu hỏi họ đang hỏi là "ba dòng này bao nhiêu
tiền", không phải "cả phiếu bao nhiêu tiền" — con số đó đã có sẵn trên đầu phiếu.
**Decision:** `totals` trong response tính trên **cùng điều kiện lọc** với `data`. Khi
không có bộ lọc nào, nó bằng đúng tổng toàn phiếu như hôm nay.
**Consequences:** Chân lưới đổi ý nghĩa khi đang lọc, và có thể **lệch** con số tổng tiền
trên đầu phiếu — đó là chủ ý, nhưng là chủ ý dễ bị báo là bug. Giao diện phải cho thấy
lưới đang lọc đủ rõ để hai con số khác nhau không đọc thành mâu thuẫn. Quy ước cũ trong
`packages/ui` chỉ còn đúng cho lưới không kiểm soát; comment ở đó phải được sửa cho khỏi
nói dối người đọc sau.
**Status:** accepted

### ADR-09 — Backfill lấy thứ tự vật lý của hàng làm nguồn, dùng đúng một lần
**Context:** ADR-02 và ADR-05 đều dựa trên một tiền đề chưa ai đo: rằng thứ tự nhập gốc
đã mất. Đo trên `prod_3008` ngày 2026-09-03 cho thấy nó **chưa mất** — nó nằm trong thứ tự
vật lý của hàng, vì mọi đường ghi đều chèn cả bộ dòng trong một lượt theo đúng thứ tự mảng,
và không đường nào cập nhật một dòng tại chỗ (A-22).

Số đo, trên toàn bộ phiếu nhiều dòng, tính bằng tỉ lệ cặp dòng liền kề có mã hàng tăng dần —
file import thường xếp theo mã, nên tỉ lệ này là proxy cho "thứ tự có nghĩa hay không":

| | cặp liền kề | `ctid` | `id` |
| --- | --- | --- | --- |
| `goods_receipt_lines` | 162.149 | **94,5 %** | 49,8 % |
| `goods_issue_lines` | 6.452 | **82,6 %** | 50,7 % |

49–51 % là tung đồng xu. Đọc mắt thường một phiếu 5.000 dòng cho cùng kết luận: theo `ctid`
là `AK169188-D-40, -41, -42, -43, -44, -N-38…`; theo `id` là dãy mã không liên quan gì nhau.

**Decision:** Backfill sắp theo thứ tự vật lý:
`goods_issue_lines` dùng `ORDER BY ctid`; `goods_receipt_lines` dùng
`ORDER BY created_at, ctid` — giữ `created_at` làm khoá chính cho trường hợp nó *có* mang
thông tin, và `ctid` thay `id` làm khoá phá hoà.

**Consequences:** ~99 % dòng phiếu nhập và toàn bộ dòng phiếu xuất lấy lại được thứ tự
người dùng thật sự đã nhập, thay vì một hoán vị ngẫu nhiên. Đây cũng là lần đầu thứ tự của
những phiếu này trở nên **xác định**: `ORDER BY created_at` với 5.000 giá trị bằng nhau vốn
không hứa hẹn gì về thứ tự trả về, nên phiếu đó hôm nay có thể đọc ra khác nhau giữa hai
lần gọi.

Cái giá, và nó thật: `ctid` là vị trí vật lý, **không phải** một bảo đảm logic. `VACUUM FULL`,
`pg_repack`, hay một vòng dump–restore đều có thể viết lại bảng và xáo nó. Vì thế ADR này
giới hạn `ctid` vào **đúng một lần dùng, trong bước backfill của migration** — không mã sản
phẩm nào được đọc `ctid` lúc chạy, và `line_no` sau khi backfill là nguồn thứ tự duy nhất.
Rủi ro còn lại: nếu bảng bị viết lại trước khi migration chạy trên production, backfill lấy
được một thứ tự kém hơn — vẫn không tệ hơn `ORDER BY id`, vốn là nhiễu đảm bảo. `prod_3008`
tự nó là một bản restore và tín hiệu vẫn còn 94,5 %, nên một vòng dump–restore không xoá nó.
**Status:** accepted

**Bổ sung 2026-09-03 sau khi đo trên `prod_3008` (không đảo quyết định, chỉ thêm hệ quả):**
migration này là **cửa một chiều**. Chính bước backfill `UPDATE` mọi hàng, mà `UPDATE` trong
Postgres ghi phiên bản hàng mới ở vị trí vật lý mới — nên ngay khi migration chạy xong,
`ctid` không còn phản ánh thứ tự chèn nữa mà phản ánh thứ tự chính lần `UPDATE` đó đã ghi
lại. `down()` rồi chạy lại là đọc phải một thứ tự do chính migration này làm hỏng: đo được
**94,5 % ở lần chạy đầu, 92,5 % ở lần chạy thứ hai sau revert**, với 161.731/162.776 dòng
đổi số. Vẫn hơn hẳn 49,8 % của `ORDER BY id`, nhưng mỗi vòng revert–rerun mất thêm một ít.

`down()` giữ lại để phục vụ phát triển. Trên bất kỳ DB nào mà thứ tự dòng có giá trị, cách
phục hồi đúng là **restore snapshot trước migration**, không phải revert rồi chạy lại.
