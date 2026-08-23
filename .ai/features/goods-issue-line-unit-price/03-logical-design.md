---
feature: goods-issue-line-unit-price
adr_count: 6
---

# Logical design — Đơn giá theo từng dòng trên phiếu xuất kho

## Approach

Feature này **không dựng cơ chế mới**. Nó kéo `goods-issue` về đúng hợp đồng định giá mà hai
module chứng từ kho anh em đã dùng:

> Đơn giá trên dòng phiếu **là** giá vốn ghi sổ. Server chỉ điền giá khi caller bỏ trống.

`goods-receipt.service.ts:814,1275` và `stock-transfer.service.ts:375-376,557-559` đã làm
đúng như vậy. Ba thay đổi dưới đây phần lớn là **gỡ bỏ một lớp ghi đè**, không phải thêm code:

**1. `post()` — định giá một lần, theo từng dòng** (`goods-issue.service.ts:282-315`)

Thay `costByItemId` (một giá cho mỗi `itemId`, áp lên mọi dòng) bằng phép giải theo từng dòng:

```
resolved(line) = Number(line.unitPrice) > 0
               ? Number(line.unitPrice)                      // người dùng đã nhập
               : instantAverage(line.itemId)                 // bỏ trống → bình quân (A-02)
```

Bình quân chỉ được tra khi thực sự có dòng rơi vào nhánh fallback. Vòng `manager.update` chỉ
ghi ngược lại **những dòng đã fallback** (để AC-03 thấy giá vốn thay vì 0); dòng có giá người
dùng nhập không bị đụng tới. `RecordMovementParams.unitCost` lấy giá đã giải của chính dòng đó.

An toàn ở tầng sổ: `writeBatchMovements` ghi **một dòng ledger cho mỗi movement, không bao giờ
gộp** (`stock-ledger.service.ts:800-801`), và `upsertBalancesBatch` mới là chỗ cộng dồn. Nên
hai movement cùng `itemId` với hai `unitCost` khác nhau là hợp lệ, không cần thay đổi gì ở ledger.

**2. `update()` — dùng thẳng kết quả của `computeVoucherDelta`** (`goods-issue.service.ts:426-540`)

Hiện `update()` đặt `unitPrice = '0.00'` cho mọi dòng mới rồi tự tính lại giá qua hai vòng lặp.
Cả hai vòng bị **xoá**:

- `resolvedDeltas` (`:461-495`) — vòng quyết định "tăng thì tính theo bình quân, giảm thì đảo
  theo giá đã ghi sổ". Thay bằng chính `d.unitCostForDelta` / `d.valueDelta` mà
  `computeVoucherDelta` đã trả về, đúng như `goods-receipt.service.ts:345-363` đang làm, chỉ
  thêm phép đảo dấu cho chiều xuất.
- vòng re-price (`:524-540`) — vòng gán lại đơn giá cho từng dòng. Đây chính là chỗ hai dòng
  trùng SKU bị đè thành một giá. Sau khi xoá, dòng giữ nguyên đơn giá người dùng gửi lên.

`nextLines` nhận `unitPrice` từ DTO thay vì `'0.00'`, nên `toLineSnapshot` đưa vào
`computeVoucherDelta` giá thật ở **cả hai phía**.

**Vì sao INV-2 tự đúng sau khi xoá hai vòng đó.** Nếu mọi dòng ledger của một phiếu đều được
ghi theo giá của chính phiếu ấy, thì `Σ line_value = Σ (số lượng × đơn giá)` là hiển nhiên —
đúng ở lần ghi sổ đầu, và đúng sau mỗi lần sửa vì `valueDelta = giá trị sau − giá trị trước`.
Vòng re-price chỉ tồn tại để vá lại sự lệch pha do chính lớp ghi đè tạo ra. Bỏ lớp ghi đè thì
vá cũng thừa.

**3. `transfer-order` — giữ danh tính dòng qua chân nhập**

- `:668-670` — màn "Điều chuyển từ cửa hàng khác" duyệt `o.lines` (dòng **lệnh điều chuyển**,
  mỗi mã hàng một dòng) rồi tra ngược một dòng phiếu xuất bằng `candidate.itemId === line.itemId`.
  Cấu trúc này **không thể** biểu diễn hai dòng cùng mã hàng. Khi lệnh đã có phiếu xuất, view
  phải duyệt thẳng `gi.lines` (nguồn sự thật của việc đã xuất những gì, giá bao nhiêu); `o.lines`
  chỉ còn là fallback cho lệnh chưa xuất.
- `:1608-1621` — `applyDeltaToLines` khoá chênh lệch theo `itemId` rồi cộng vào **mọi** dòng
  trùng mã hàng, nhân đôi chênh lệch. Chênh lệch phải được rót vào các dòng cùng mã hàng theo
  thứ tự, mỗi dòng nhận phần của mình cho tới khi hết.
- `deriveExportLines:941` giữ nguyên `items.purchase_price` (A-03/ADR-04).

```
Người dùng            goods-issue                     stock ledger
   │  30×350.000          │                                │
   │  60×340.000          │                                │
   ├─────────────────────►│ post(): giải giá theo từng dòng│
   │                      │  350.000 (nhập) ──────────────►│ −30 @350.000
   │                      │  340.000 (nhập) ──────────────►│ −60 @340.000
   │                      │  DD480: 0 → bình quân ────────►│ −30 @bq
   │                      │                                │  Σ = −30.900.000  (INV-2)
   │                      │
   │  sửa 60→50           │ update(): computeVoucherDelta  │
   ├─────────────────────►│  (giá thật ở CẢ HAI phía)      │
   │                      │  Δqty −10, Δvalue −3.400.000 ─►│ +10 @340.000
   │                      │  (không re-price dòng nào)     │  Σ = −27.500.000  (INV-2)
```

## Alternatives rejected

| Option | Why not |
|---|---|
| Tách thành hai cột: `unit_price` (giá người dùng) + `unit_cost` (giá vốn) | Người dùng đã chốt giá nhập tay **là** giá vốn ghi sổ. Hai cột thêm một khái niệm mới vào 3 service báo cáo và 3 bất biến, đổi lấy không gì |
| Sửa vòng re-price để phân bổ đúng theo từng dòng | Không sửa được. `beforeByKey` đã mất dòng trước khi vòng chạy, và `computeVoucherDelta` gộp theo `(item, location)` **theo thiết kế** (A-11). Phải bỏ hẳn, không phải sửa |
| Chặn hai dòng trùng SKU trên một phiếu | Người dùng cố tình nhập hai mức giá — chặn là từ chối chính use case đang báo lỗi |
| Gán id ổn định cho dòng phiếu để `update()` sửa tại chỗ | `update()` xoá sạch rồi ghi lại toàn bộ dòng; đổi sang sửa tại chỗ là đổi hợp đồng của cả `goods-receipt` lẫn `goods-issue` và viết lại engine chênh lệch. Ngoài phạm vi |
| Đổi `deriveExportLines` sang bình quân tức thời | Đã đề xuất và **bị bác** — xem ADR-04 |

## Domain model

Không entity mới, không migration. Chỉ đổi **ngữ nghĩa nguồn** của một cột đã có:

| Cột | Trước | Sau |
|---|---|---|
| `goods_issue_lines.unit_price` | luôn là bình quân tức thời của `itemId` tại chi nhánh, do server ghi đè ở `post()` | giá vốn ghi sổ của **chính dòng đó**: giá người dùng nhập, hoặc bình quân tức thời nếu bỏ trống |
| `goods_issue_lines.line_total` | `quantity × unit_price` | không đổi |
| `stock_ledger_entries.unit_cost` / `line_value` | một giá cho mọi dòng cùng `itemId` | theo từng dòng |

Ý nghĩa cột **không đổi** — vẫn là "giá vốn đã ghi sổ" — nên `inventory-reports` không phải sửa (A-07).

## Contracts

### `POST /goods-issues` và `POST /goods-issues/:id/post`

Request `lines[]` giữ nguyên hình dạng. Ngữ nghĩa `unitPrice` đổi:

| `unitPrice` gửi lên | Hành vi |
|---|---|
| `> 0` | dùng nguyên làm giá vốn ghi sổ |
| `0`, `null`, `undefined` | server điền bình quân tức thời của `itemId` tại chi nhánh, rồi ghi ngược vào dòng |
| `< 0` | `400` — từ chối cả phiếu, không ghi sổ dòng nào |

Response: `lines[].unitPrice` luôn là giá **đã giải**, không bao giờ là 0 vì bỏ trống.

### `PATCH /goods-issues/:id`

`lines[].unitPrice` tham gia vào `computeVoucherDelta` ở phía "sau". Bỏ trống thì giải bình quân
**trước** khi tính chênh lệch, để hai phía luôn so bằng giá thật.

### Màn "Điều chuyển từ cửa hàng khác"

`lines[]` của một lệnh **đã xuất** lấy từ `goods_issue_lines` của phiếu xuất, một phần tử cho mỗi
dòng phiếu xuất (kể cả trùng mã hàng), giữ nguyên `unitPrice` từng dòng. Lệnh **chưa xuất** giữ
nguyên hành vi cũ: một phần tử cho mỗi dòng lệnh, giá lấy từ `items.purchase_price`.

## Error taxonomy

| Condition | Failure | UI |
|---|---|---|
| `unitPrice < 0` trên bất kỳ dòng nào | `BadRequestException` | thông báo nêu rõ mã hàng của dòng sai; phiếu không được lưu |
| Bỏ trống giá và mặt hàng chưa từng có giao dịch tại chi nhánh | không phải lỗi — `getInstantAverageCost` trả `PURCHASE_PRICE_FALLBACK` và đã tự `logger.warn` (`stock-ledger.service.ts:251-260`) | dòng hiển thị giá catalog; hành vi hiện tại, không đổi |
| Bỏ trống giá, mặt hàng cũng chưa có `purchase_price` | giá vốn `0`, ghi sổ giá trị 0 | hành vi hiện tại, không đổi — nằm ngoài phạm vi |
| Sửa phiếu đã bị huỷ / sai `revision` | `ConflictException` như hiện tại | không đổi |

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| Đơn giá đã giải của một dòng | `goods_issue_lines` (server) | vĩnh viễn, đổi chỉ qua `PATCH` + bút toán chênh lệch |
| Giá vốn bình quân tức thời | `stock_ledger_entries` qua `getInstantAverageCost` | đọc tại thời điểm ghi sổ, không lưu |
| Đơn giá đang gõ dở trên lưới | `GoodsIssueFormDialog` (React state) | vòng đời dialog |

## Cache & offline

Không có cache mới. `getInstantAverageCost` vẫn đọc thẳng sổ trong cùng transaction ghi sổ.
Số lần gọi **giảm**: chỉ tra cho những `itemId` thực sự có dòng bỏ trống giá, thay vì mọi `itemId`
trên phiếu.

## Observability

- `post()` log ở mức `debug` số dòng đã fallback trên mỗi phiếu — chỉ số này gần 0 nghĩa là người
  dùng đang chủ động đặt giá; gần 100% nghĩa là FE lại prefill 0 và cần xem lại.
- Cảnh báo `Average cost fallback:` sẵn có ở `stock-ledger.service.ts:258` giữ nguyên.
- Script đối soát INV-1/2/3 (`database/seeds/voucher-invariant-audit.script.ts`) là cách kiểm
  hồi quy rẻ nhất sau khi triển khai — nó đã đọc `goods_issue_lines` sẵn.

## ADRs

### ADR-01 — Đơn giá dòng phiếu xuất là giá vốn ghi sổ do người dùng nhập
**Context:** `goods-issue` ghi đè giá client gửi bằng bình quân tức thời; `goods-receipt` và
`stock-transfer` thì không. Người dùng nhập hai mức giá cho cùng mã hàng và thấy cả hai bị quy về một.
**Decision:** Đơn giá trên dòng là giá vốn ghi sổ. Server chỉ điền khi caller bỏ trống (`≤ 0`).
**Consequences:** Giá vốn xuất kho không còn luôn bằng bình quân, nên giá vốn bình quân của tồn
còn lại sẽ trôi khỏi giá vốn thật; feature chấp nhận và không treo phần chênh vào TK 632 (A-01).
Đổi lại, `goods-issue` hết lệch chuẩn với hai module anh em.
**Status:** accepted

### ADR-02 — Bỏ vòng re-price; INV-2 giữ bằng cấu trúc chứ không bằng tính lại
**Context:** `goods-issue.service.ts:524-540` tính lại đơn giá từng dòng thành bình quân gia quyền
của toàn bộ giá trị đã ghi sổ cho dòng đó, để INV-2 đúng khi một dòng mang hai gốc giá vốn. Chính
vòng này gán cùng một giá cho mọi dòng trùng `(itemId, locationId)`.
**Decision:** Xoá vòng re-price và vòng `resolvedDeltas`. Ghi sổ luôn theo giá của chính phiếu, ở
cả lần ghi đầu lẫn mọi lần sửa, dùng thẳng `unitCostForDelta` / `valueDelta` của `computeVoucherDelta`.
**Consequences:** INV-2 thành hệ quả cấu trúc (`Σ line_value = Σ qty × giá`) thay vì thứ phải sửa
tay để đạt. Một dòng không bao giờ còn mang hai gốc giá vốn, nên tình huống mà vòng đó xử lý biến
mất. `voucher-delta.util.ts` không đổi một dòng nào.
**Status:** accepted

### ADR-03 — Phần tăng số lượng khi sửa phiếu xuất định giá theo đơn giá dòng mới
**Context:** Feature `warehouse-voucher-edit-delete` (A-05 của nó) quy định phần tăng của phiếu
xuất định giá theo bình quân tức thời **tại thời điểm sửa**. Luật đó mâu thuẫn với ADR-01.
**Decision:** Với phiếu xuất, phần tăng định giá theo đơn giá của chính dòng đó. Luật cũ được thay
thế cho riêng phiếu xuất.
**Consequences:** Đã cập nhật `../warehouse-voucher-edit-delete/03-logical-design.md` (T-02-05):
bảng `unitCostForDelta` của nó nay gạch ngang luật cũ và trỏ sang ADR này; INV-1/2/3 của feature
đó giữ nguyên câu chữ, chỉ *cách đạt* INV-2 đổi. Hệ quả đã biết: khi một lần sửa **vừa** đổi giá **vừa** đổi số lượng trên
cùng `(item, location)`, đơn giá in trên dòng bút toán chênh lệch là số dẫn xuất
`|valueDelta / quantityDelta|`, không trùng đơn giá của bất kỳ dòng phiếu nào — đó là bản chất của
phép gộp trong `computeVoucherDelta`, và AC-12 chốt bằng bất biến giá trị thay vì bằng con số đó.
**Status:** accepted

### ADR-04 — Chân xuất tự sinh của lệnh điều chuyển giữ `items.purchase_price`
**Context:** `deriveExportLines:941` gửi `items.purchase_price` làm `unitPrice`. Hôm nay vô hại vì
`post()` ghi đè; sau ADR-01 nó trở thành giá vốn ghi sổ. Đề xuất ban đầu là đổi về 0 để rơi vào
fallback bình quân.
**Decision:** Giữ `purchase_price`. Đề xuất đổi về bình quân **đã bị bác**.
**Consequences:** Chân xuất **đổi hành vi**: điều chuyển tự sinh từ nay định giá theo catalog thay
vì bình quân tức thời. Bù lại, chân nhập `TRANSFER_IN` vốn đã ghi sổ theo `purchase_price`
(`:1344`, `:1155`) nên hai đầu tự cân bằng mà không phải sửa đường tự sinh — diff nhỏ hơn phương
án đã đề xuất. AC-11 tồn tại để khoá hành vi này lại, vì đây là luồng không ai kiểm bằng mắt.
**Status:** accepted

### ADR-05 — Màn nhập điều chuyển lấy dòng từ phiếu xuất, không từ lệnh điều chuyển
**Context:** `transfer-order.service.ts:668-670` duyệt `o.lines` (một dòng mỗi mã hàng) rồi tra
ngược phiếu xuất bằng `itemId`. Cấu trúc này không biểu diễn được hai dòng cùng mã hàng, nên chi
nhánh nhận thấy dòng đầu tiên và mất phần còn lại.
**Decision:** Khi lệnh đã có `exportGoodsIssueId`, view duyệt thẳng `gi.lines`. `o.lines` chỉ còn
là fallback cho lệnh chưa xuất.
**Consequences:** Phiếu xuất trở thành nguồn sự thật cho màn nhập — đúng về nghiệp vụ (không thể
nhận thứ chưa xuất). `TransferOrderLineEntity` giữ nguyên schema.

**Bổ sung 2026-08-22, phát hiện lúc thi công T-03-01** (lượt rà consumer mà ticket bắt buộc):
quyết định trên đúng nhưng danh sách chỗ phải sửa **thiếu một**. Có hai surface, không phải một:

| Surface | Nguồn dòng hiện tại | Người dùng thấy ở đâu |
|---|---|---|
| `listImportable().lines` (`transfer-order.service.ts:668-687`) | `o.lines` + `gi.lines.find(itemId)` | lưới "Chi tiết" ở `TransferInPage.tsx:541` |
| `GET /transfer-orders/:id` → `TransferReceiptDetail` | dòng lệnh: `requestedQty` + `item.purchasePrice` | prefill lưới form phiếu nhập, `GoodsReceiptFormDialog.tsx:660-672` |

Surface thứ hai mới là chỗ quyết định phiếu nhập sinh ra mang dòng gì và giá nào — tức là chỗ
AC-09 thực sự đòi. Nó được cấp ticket riêng (T-03-05, layer `web`) vì nằm ở tầng khác và demo
bằng bước khác. Endpoint `/inventory/transfer-orders/:id/export-goods-issue` đã tồn tại và FE đã
gọi nó sẵn để lấy `deliverer`, nên không phải thêm endpoint mới.

Ghi chú thêm: lưới "Chi tiết" khoá dòng bằng `getRowKey={(row) => row.id || row.itemId}`
(`TransferInPage.tsx:544`). Hai dòng cùng mã hàng sinh từ **một** dòng lệnh sẽ trùng khoá React,
nên `id` trả về phải là id **dòng phiếu xuất**, không phải id dòng lệnh.
**Status:** accepted

### ADR-06 — Vá hạ tầng e2e dùng chung thay vì né nó
**Context:** Phát hiện lúc thi công T-02-04. `goods-issue-roundtrip.e2e-spec.ts` đỏ 2/2 **ở HEAD**,
trước feature này: `test/e2e/setup/test-app.ts` liệt kê tay danh sách quyền và chưa bao giờ được
bổ sung ba key thêm sau — `inventory.goods-issue.update`, `.other-issue`, `.disposal`. Mọi phiếu
`OTHER`/`DISPOSAL` và **mọi lượt sửa phiếu** đều 403 trong e2e. Ba ca AC-02/03/04 né được bằng
`purpose: SALE`, nhưng AC-06 thì không: sửa phiếu bắt buộc cần `inventory.goods-issue.update`.

**Decision:** Vá seed e2e (thêm ba key) thay vì viết AC-06 vòng qua chỗ hỏng. Vá làm lộ tiếp một
assertion đã lỗi thời — nó đọc `row.lines` trên `/v2/.../search`, mà handler **cố ý** bỏ `lines`
khỏi kết quả tìm kiếm từ lâu (`search-goods-issues-v2.handler.ts:53`, dòng chi tiết lấy lười qua
`GET /:id/lines`); assertion đó cũng được sửa theo hợp đồng hiện hành.

**Consequences:** Đây là **hạ tầng test dùng chung**, không phải code chạy — nó gỡ luôn hai test
đỏ có sẵn (0/2 → 6/6). Đổi lại, feature này chạm một file ngoài phạm vi đã khai, và cái giá đó
được trả công khai ở đây thay vì giấu. Cùng họ nhưng **không** sửa: `goods-receipt-from-transfer`
(3 ca) và `goods-issue-from-transfer` (4 ca) đỏ ở HEAD vì đặt `destinationBranchId = sourceBranchId`,
mà một luật thêm sau đã cấm điều chuyển cùng chi nhánh — sửa chúng là đổi ngữ nghĩa test của người
khác, nên ca AC-09 dựng hạ tầng hai chi nhánh riêng và để ba ca kia nguyên.
**Status:** accepted
