---
feature: warehouse-voucher-edit-delete
adr_count: 7
---

# Logical design — Sửa và xoá phiếu nhập / phiếu xuất kho

## Approach

Toàn bộ feature quy về **một phép toán duy nhất**: cho một phiếu đã ghi sổ, so sánh bộ
dòng hàng *đang có trên sổ* với bộ dòng hàng *người dùng vừa nhập*, rồi ghi đúng phần
chênh lệch xuống sổ kho và sổ kế toán. Sửa là chạy phép toán đó với bộ dòng mới; xoá là
chạy nó với bộ dòng rỗng. Nhờ vậy lỗi "xoá phiếu nhập không đảo bút toán" biến mất theo
cấu trúc chứ không phải bằng một bản vá riêng.

Phép toán nằm ở một hàm thuần `computeVoucherDelta(before, after)` (không import
`@nestjs/*`, không TypeORM) trả về danh sách `LineDelta { itemId, locationId, quantityDelta,
valueDelta, unitCostForDelta }`, khoá theo cặp `(itemId, locationId)`. Hai dịch vụ nghiệp vụ
gọi cùng hàm này và chỉ khác nhau ở phần hạch toán tiền:

```
update(id, dto) / cancel(id)
  └─ transaction
       ├─ SELECT … FOR UPDATE trên chính dòng phiếu, đọc lại status  ← chặn ghi trùng
       ├─ before = dòng hàng hiện tại, after = dto.lines (hoặc [] khi xoá)
       ├─ delta  = computeVoucherDelta(before, after)
       ├─ stockLedger.recordBatchMovements(delta → RecordMovementParams[])
       ├─ hạch toán tiền theo phần chênh lệch (CASH | CREDIT | phiếu xuất: không có)
       ├─ ghi đè dòng hàng + header, revision += 1
       └─ (chân điều chuyển) lan sang chân đối ứng
```

**Ba bất biến đối soát** là hợp đồng của feature, và cũng là thứ các test kiểm:

- **INV-1 (số lượng):** với mọi phiếu P và mọi cặp `(itemId, locationId)`,
  `SUM(stock_ledger_entries.quantity WHERE reference_id = P)` bằng đúng số lượng trên dòng
  phiếu hiện tại — dấu dương cho phiếu nhập, âm cho phiếu xuất, bằng 0 nếu phiếu đã xoá.
- **INV-2 (giá trị):** `SUM(stock_ledger_entries.line_value WHERE reference_id = P)` bằng
  đúng giá trị dòng phiếu hiện tại, cùng quy ước dấu.
- **INV-3 (kế toán):** tổng phát sinh do P sinh ra trên TK 156 bằng giá trị phiếu hiện tại;
  đối ứng nằm trên TK 111 (phiếu tiền mặt) hoặc TK 331 + `supplier_debts.originalAmount`
  (phiếu công nợ). Phiếu đã xoá thì cả ba đều bằng 0.

Không dòng `stock_ledger_entries` hay `journal_entries` nào bị `UPDATE`/`DELETE`. Tính bất
biến của **sổ** được giữ nguyên; cái được nới ra là tính bất biến của **chứng từ** — xem
ADR-01.

## Alternatives rejected

| Option | Why not |
|---|---|
| Mở luồng DRAFT: tạo nháp → sửa → ghi sổ | Không client nào tạo DRAFT hôm nay và "Lưu là ghi sổ ngay" là hành vi người dùng đang quen. Dựng DRAFT là đổi thói quen vận hành để né một bài toán kỹ thuật — sai chỗ. Xem A-16. |
| Đảo toàn bộ rồi ghi lại (reverse + repost) | Người dùng đã chốt ghi chênh lệch. Đảo-rồi-ghi-lại làm sổ kho phình gấp đôi số dòng mỗi lần sửa và biến sổ chi tiết mặt hàng thành thứ không đọc được. |
| Sửa thẳng dòng `stock_ledger_entries` cũ | Phá tính bất biến của sổ — đúng cái mà `CLAUDE.md` cấm, và làm mọi báo cáo đã in ra trước đó không tái lập được. |
| Bảng version phiếu (giữ mọi bản sửa) | Giải quyết bài toán kiểm toán chứ không phải bài toán đối soát; chi phí lớn hơn hẳn giá trị ở thời điểm này. Xem A-13. |
| Dùng `CashService.recordMovement` cho phần tiền chênh lệch rồi outbox sinh chứng từ | Hai chủ sở hữu cùng ghi một bút toán tiền — đúng hình dạng của lỗi double-post đã từng xảy ra ở luồng trả hàng. Đi qua `createAndPostInternal` để mỗi biến động quỹ có đúng một chủ. Xem ADR-05. |

## Domain model

| Entity | Fields | Notes |
|---|---|---|
| `LineDelta` | `itemId`, `locationId`, `quantityDelta`, `valueDelta`, `unitCostForDelta` | Value object thuần, sinh bởi `computeVoucherDelta`; không có id, không lưu DB |
| `VoucherRevision` | `revision` (int) trên `goods_receipts` / `goods_issues` | Tăng 1 mỗi lần sửa thành công. Dùng làm khoá phân biệt chứng từ quỹ điều chỉnh giữa các lần sửa (xem ADR-06) |
| `SupplierDebtStatus` | thêm giá trị `overpaid` | Khi `remainingAmount < 0` vì phiếu bị sửa xuống dưới số đã trả (A-03) |
| `StockLedgerEntry` | thêm khả năng nhận `lineValue` tường minh | Hiện `line_value` luôn được suy ra `quantity × unitCost`, nên không ghi nổi một điều chỉnh chỉ đổi giá trị (A-09). Xem ADR-04 |

Quy tắc tính `unitCostForDelta`:

| Loại phiếu | `quantityDelta > 0` | `quantityDelta < 0` | `quantityDelta = 0`, `valueDelta ≠ 0` |
|---|---|---|---|
| Phiếu nhập | đơn giá mới trên dòng phiếu | đơn giá đã ghi sổ của phiếu | ghi dòng `quantity = 0`, `lineValue = valueDelta` |
| Phiếu xuất | ~~giá bình quân tức thời tại thời điểm sửa (A-05)~~ → **đơn giá mới trên dòng phiếu** | đơn giá đã ghi sổ của phiếu | như trên |

> **Luật của phiếu xuất đã bị thay, 2026-08-22.**
> Xem `../goods-issue-line-unit-price/03-logical-design.md` → **ADR-03**.
>
> Feature này giả định đơn giá dòng phiếu xuất luôn do server gán (bình quân tức thời), nên
> phần tăng khi sửa cũng phải định giá theo bình quân, và dòng phiếu phải được đặt lại thành
> bình quân gia quyền `Σ lineValue / Σ quantity` để INV-2 đúng khi một dòng mang hai gốc giá vốn.
>
> Feature `goods-issue-line-unit-price` (ADR-01) đổi đơn giá dòng phiếu xuất thành **giá do
> người dùng nhập**, ngang hàng với phiếu nhập. Hệ quả:
>
> - Phần tăng định giá theo **đơn giá mới của chính dòng đó**, không theo bình quân (ADR-03).
> - Vòng đặt lại đơn giá theo bình quân gia quyền **đã bị xoá** (ADR-02). Một dòng không còn
>   mang hai gốc giá vốn, nên tình huống nó xử lý không còn tồn tại.
> - **INV-1, INV-2, INV-3 không đổi** — chúng vẫn là hợp đồng. Chỉ *cách đạt* INV-2 đổi: từ
>   "tính lại đơn giá dòng cho khớp sổ" sang "sổ luôn ghi theo giá của chính phiếu, nên
>   `Σ line_value = Σ (số lượng × đơn giá)` là hiển nhiên".
>
> Bảng trên giữ nguyên câu chữ gốc (gạch ngang) thay vì xoá, để người đọc thấy được luật nào
> đã bị thay chứ không chỉ thấy luật hiện hành.

## Contracts

### PATCH /goods-receipts/:id
Sửa một phiếu nhập ở trạng thái `DRAFT` **hoặc** `POSTED`.
Request: `UpdateGoodsReceiptDto` — bổ sung `paymentMethod` vào whitelist (hiện thiếu, gây
400 vì `forbidNonWhitelisted`) nhưng **chỉ chấp nhận khi trùng giá trị đang lưu**; đổi
CASH ↔ CREDIT trả 400 (A-11).
Response 200: phiếu sau khi sửa, kèm `revision`.
Failure: 404 `NotFoundException`, 409 `ConflictException` (đã huỷ / đang bị sửa bởi request khác),
400 `BadRequestException` (quỹ không đủ, thiếu tài khoản 156/331, đổi `paymentMethod`).

### PATCH /inventory/goods-issues/:id  *(mới)*
Request: `UpdateGoodsIssueDto` — `lines[]`, `counterpartyKind/Id`, `notes`, `deliverer`,
`references`, `occurredAt`, `reasonId`. Không nhận `purpose`, không nhận `targetBranchId`.
Response 200: phiếu sau khi sửa. Failure: như trên.

### DELETE /goods-receipts/:id · POST /inventory/goods-issues/:id/cancel
Giữ nguyên đường dẫn và mã trạng thái hiện tại. Điểm khác duy nhất: thân xử lý gọi cùng
engine chênh lệch với `after = []`, nên sổ kế toán và quỹ được đảo chứ không chỉ sổ kho.

### Sự kiện
- `erp.cash.voucher.needed.goods_receipt` — giữ nguyên cho lần ghi sổ đầu.
- Chứng từ quỹ điều chỉnh **không** đi qua outbox mới: gọi thẳng
  `CashPaymentsService.createAndPostInternal` (tăng tiền) hoặc
  `CashReceiptsService.createAndPostInternal` (giảm tiền) trong cùng transaction, với
  `sourceReference = <documentNumber>#rev<n>` để hàm chống trùng sẵn có của chúng không
  nuốt mất chứng từ của lần sửa thứ hai.

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| Dòng hàng của phiếu | `goods_receipt_lines` / `goods_issue_lines` | Vòng đời phiếu; ghi đè mỗi lần sửa |
| Lịch sử số lượng và giá trị | `stock_ledger_entries` | Vĩnh viễn, chỉ thêm |
| Bút toán 156/111/331 | `journal_entries` | Vĩnh viễn, chỉ thêm |
| Biến động quỹ | `cash_movements`, do `CashPaymentsService` / `CashReceiptsService` sở hữu | Vĩnh viễn |
| Dư nợ NCC | `supplier_debts` (một dòng cho một phiếu) | Cập nhật tại chỗ theo giá trị phiếu |
| Khoá ghi trùng | Row lock trên `goods_receipts` / `goods_issues` | Trong transaction |

## Error taxonomy

| Condition | Failure subtype | HTTP | UI |
|---|---|---|---|
| Phiếu không tồn tại hoặc khác tổ chức | `NotFoundException` | 404 | Toast "Không tìm thấy phiếu", đóng form |
| Phiếu đã huỷ | `ConflictException` | 409 | Toast "Phiếu đã huỷ, không sửa được nữa" |
| Request khác đang sửa cùng phiếu | `ConflictException` | 409 | Toast "Phiếu vừa được người khác sửa, vui lòng tải lại" |
| Đổi `paymentMethod` khi sửa | `BadRequestException` | 400 | Trường hình thức thanh toán khoá, kèm chú thích |
| Quỹ không đủ tiền cho phần tăng | `BadRequestException` (từ `CashService`) | 400 | Toast nêu đúng số tiền thiếu; phiếu giữ nguyên |
| Chưa cấu hình TK 156 / 331 | `BadRequestException` | 400 | Toast hướng dẫn cấu hình hệ thống tài khoản |
| Chân điều chuyển mà lệnh đã huỷ | `ConflictException` | 409 | Toast "Lệnh điều chuyển đã huỷ" |
| Mặt hàng của dòng mới không thuộc tổ chức | `BadRequestException` | 400 | Đánh dấu đỏ dòng lỗi trong lưới |

Mọi thông báo phía backend viết tiếng Anh; chuỗi tiếng Việt nằm ở lớp frontend.

## Cache & offline

Không có cache riêng. Sau khi sửa hoặc xoá, frontend `invalidateQueries` theo tiền tố
`goods-receipts` / `goods-issues` và các khoá tồn kho (`inventory-stock-balances`), giống
cách hai màn hình đang làm sau khi tạo phiếu. Không có yêu cầu offline.

## Observability

- Log một dòng cho mỗi lần sửa: id phiếu, số phiếu, `revision`, số dòng chênh lệch, tổng
  `quantityDelta`, tổng `valueDelta`, người sửa.
- `notes` của dòng ledger chênh lệch ghi rõ `Adjustment for <documentNumber> rev <n>` để tra
  ngược từ sổ chi tiết về lần sửa.
- Một script đối soát chạy được thủ công, kiểm INV-1/INV-2/INV-3 trên toàn bộ phiếu của một
  chi nhánh và in ra các phiếu vi phạm — dùng khi nghiệm thu G4 và khi có nghi ngờ lệch số.

## ADRs

### ADR-01 — Chứng từ sửa được, sổ thì không
**Context:** `CLAUDE.md` quy định giao dịch nghiệp vụ bất biến sau khi ghi sổ, sửa bằng bút
toán đảo chứ không sửa tại chỗ. Người dùng lại cần sửa phiếu mà giữ nguyên số phiếu.
**Decision:** Nới tính bất biến ở mức **chứng từ** (dòng hàng của phiếu bị ghi đè), giữ tuyệt
đối ở mức **sổ** (ledger và bút toán chỉ được thêm dòng chênh lệch, không sửa, không xoá).
**Consequences:** Đọc phiếu cho biết hiện trạng, đọc sổ cho biết lịch sử. Muốn biết phiếu
từng mang giá trị nào thì phải cộng ngược sổ — chấp nhận được vì đã bỏ bảng version (A-13).
**Status:** accepted

### ADR-02 — Xoá là một trường hợp của sửa
**Context:** Luồng xoá hiện tại đảo sổ kho nhưng bỏ quên sổ cái và quỹ.
**Decision:** `cancel()` gọi đúng engine chênh lệch với `after = []`, rồi mới đặt trạng thái
`CANCELLED` và soft-delete.
**Consequences:** Một đường mã cho hai nghiệp vụ; lỗi bỏ sót kế toán không tái diễn được vì
không còn nhánh riêng để quên. Đổi lại, mọi thay đổi engine đều ảnh hưởng cả hai — nên bộ
test của engine phải đủ dày.
**Status:** accepted

### ADR-03 — Bất biến đối soát là hợp đồng, không phải mong đợi
**Context:** "Đối soát trên ledger và stock ledger" cần một định nghĩa kiểm được bằng máy.
**Decision:** INV-1, INV-2, INV-3 ở phần Approach là hợp đồng của feature; mỗi UoW có ít nhất
một test khẳng định trực tiếp bất biến của mình, và có script đối soát chạy trên dữ liệu thật.
**Consequences:** Test viết theo bất biến chứ không theo lời gọi hàm, nên vẫn còn giá trị khi
cài đặt bên trong đổi.
**Status:** accepted

### ADR-04 — `RecordMovementParams` nhận `lineValue` tường minh
**Context:** `deriveCostFields` luôn tính `line_value = quantity × unitCost`, nên một điều
chỉnh chỉ đổi đơn giá (`quantityDelta = 0`) sẽ ghi giá trị 0 và giá vốn bình quân giữ nguyên
giá cũ — mọi phiếu xuất sau đó tính sai giá vốn.
**Decision:** Thêm trường tuỳ chọn `lineValue?: number` vào `RecordMovementParams`; khi có thì
dùng thẳng, khi không thì giữ nguyên công thức cũ.
**Consequences:** Chạm một service dùng chung toàn hệ thống, nên thay đổi phải cộng tính (chỉ
thêm nhánh, không đổi hành vi mặc định) và có test cho cả hai nhánh.
**Status:** accepted

### ADR-05 — Mỗi biến động quỹ có đúng một chủ sở hữu
**Context:** Luồng ghi sổ hiện tại gọi `CashService.recordMovement` rồi phát sự kiện để một
consumer dựng phiếu chi quanh chính movement đó. Nếu phần chênh lệch cũng vừa `recordMovement`
vừa gọi dịch vụ chứng từ thì bút toán tiền bị ghi hai lần — đúng hình dạng lỗi double-post đã
gặp ở luồng trả hàng.
**Decision:** Phần tiền chênh lệch đi qua `CashPaymentsService.createAndPostInternal` (tăng
tiền) hoặc `CashReceiptsService.createAndPostInternal` (giảm tiền), truyền `manager` của
transaction hiện tại. Hai hàm này tự ghi cash movement, bút toán và chứng từ.
**Consequences:** Đường ghi sổ lần đầu và đường sửa dùng hai cơ chế khác nhau (outbox so với
gọi trực tiếp) — chấp nhận, vì cái quan trọng là mỗi movement chỉ có một chủ. Phiếu chi gốc
không bị sửa hay huỷ; sổ quỹ đọc thành một chuỗi chứng từ cộng dồn.
**Status:** accepted

### ADR-06 — `revision` là khoá phân biệt chứng từ điều chỉnh
**Context:** `createAndPostInternal` chống trùng theo `sourceReference`, và
`deterministicCashVoucherEventId` chống trùng theo `(sourceType, sourceId)`. Sửa phiếu lần thứ
hai sẽ bị hai cơ chế này nuốt mất nếu vẫn dùng cùng một khoá.
**Decision:** Thêm cột `revision` trên cả hai bảng phiếu, tăng 1 mỗi lần sửa thành công, và
đưa vào khoá chống trùng: `sourceReference = <documentNumber>#rev<n>`.
**Consequences:** Chống trùng vẫn đúng trong phạm vi một lần sửa (retry cùng revision là no-op)
mà không chặn lần sửa kế tiếp. `revision` cũng là chỗ để frontend hiển thị "đã sửa n lần".
**Status:** accepted

### ADR-07 — Chân điều chuyển được điều chỉnh từ phía lệnh
**Context:** Một lệnh điều chuyển sinh phiếu xuất ở chi nhánh nguồn và phiếu nhập ở chi nhánh
đích. Người dùng đã chốt sửa một chân thì chân kia phải theo.
**Decision:** `TransferOrderService` là chỗ duy nhất biết cả hai chân. Dịch vụ phiếu phát hiện
`referenceType = TRANSFER_ORDER` thì uỷ quyền cho `TransferOrderService.applyLegRevision(orderId,
delta, actor)`; dịch vụ này áp cùng engine chênh lệch lên chân đối ứng, dùng chi nhánh của chân
đó chứ không phải chi nhánh của người đang thao tác.
**Consequences:** Không có vòng phụ thuộc mới — `forwardRef` giữa hai module đã tồn tại sẵn.
Người dùng ở chi nhánh A gây ra thay đổi tồn kho ở chi nhánh B mà không đứng ở B; log phải ghi
rõ điều đó.
**Status:** accepted
