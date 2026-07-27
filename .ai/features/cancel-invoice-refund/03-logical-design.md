---
feature: cancel-invoice-refund
adr_count: 6
---

# Logical design — Hoàn tiền & hoàn kho khi hủy hóa đơn

## Approach

Giữ nguyên hình dạng hiện tại của luồng hủy: `CancelInvoiceService` chốt trạng thái
trong một transaction rồi phát `INVOICE_CANCELLED`; mọi hệ quả tiền/kho do consumer
xử lý bất đồng bộ. Feature này thêm ba việc vào đúng khung đó.

1. **`CancelInvoiceService` siết điều kiện và tính sẵn phần hoàn.** Chặn hóa đơn
   không phải `SALE` và hóa đơn đã có phiếu trả/đổi trỏ tới. Đọc `invoice_payments`,
   gộp theo quỹ đích, giải quyết COA doanh thu (dùng chính `accountResolver` mà
   checkout đang dùng) và quỹ tiền mặt chi nhánh (`CashFundResolverService`), rồi
   nhét kết quả vào payload sự kiện. Module `pos` vẫn không gọi thẳng service kế toán.

2. **Hai consumer sinh phiếu chi, mỗi consumer một loại quỹ.** Chân tiền mặt do
   một consumer mới trong `cash-vouchers/cash-voucher-consumers/` xử lý, sao đúng
   hình dạng `refund-cash.consumer.ts`. Chân tiền gửi do `DepositRefundConsumer`
   hiện có đảm nhiệm, nhưng đổi ruột: thay vì tự ghi movement thô, nó gọi
   `BankPaymentsService.createAndPostInternal` để phiếu chi sở hữu movement.
   Cả hai đều idempotent sẵn nhờ `findByReference` bên trong `createAndPostInternal`.

3. **Bảng `voucher_links` ghi cặp chứng từ.** Consumer chân tiền mặt tra phiếu thu
   `POS_SALE` gốc (cùng module, cùng bảng `cash_receipts`) rồi ghi một dòng link
   trong cùng transaction với phiếu chi.

Chân tồn kho không đổi kiến trúc — `StockReturnConsumer` chỉ đổi cách chọn vị trí:
bỏ `locationId` trên dòng hóa đơn, dùng `resolveBranchItemLocations(..., { showroomOnly: true })`.

## Alternatives rejected

| Option | Why not |
|---|---|
| Sinh phiếu chi đồng bộ ngay trong transaction của `cancel()` | `pos` phải inject `CashPaymentsService` + `BankPaymentsService`, phá ranh giới module mà mọi hệ quả hủy khác đang tôn trọng. Một lỗi khóa kỳ kế toán sẽ làm rollback cả việc hủy hóa đơn — trong khi nghiệp vụ muốn hóa đơn hủy được kể cả khi chân tiền vướng |
| Consumer tự đọc `invoice_payments` từ DB | Module `accounting` chưa từng đọc bảng của `pos`; payload mang đủ dữ liệu là quy ước sẵn có (`CashMovementFromPaymentPayload`, `InvoiceCancelledPayload.items`) |
| Đảo phiếu thu gốc bằng `CashReceiptsService.reverse()` | Akenzy đã loại ở vòng G0: lưới "Phiếu chi" sẽ không có dòng nào, kế toán không thấy chứng từ chi tiền |
| Thêm cột liên kết vào từng bảng chứng từ | Akenzy chọn bảng `voucher_links` dùng chung (A-08) |
| Sửa luôn double-post GL ở chân bán | Akenzy chốt để ngoài phạm vi (A-13); xem ADR-05 |
| Bắt `StockReturnConsumer` tự truy vấn kho showroom bằng SQL riêng | `resolveBranchItemLocations` đã là đường đi chuẩn của mọi luồng POS và đã có test |

## Domain model

| Entity | Fields | Notes |
|---|---|---|
| `RefundLeg` (value object, trong payload) | `invoicePaymentIds`, `fundKind: CASH \| DEPOSIT`, `cashAccountId?`, `depositAccountId?`, `amount`, `contraAccountId` | Một dòng cho mỗi quỹ đích, đã gộp từ nhiều dòng `invoice_payments` cùng quỹ |
| `VoucherLinkEntity` | `id`, `organizationId`, `branchId`, `fromKind`, `fromId`, `toKind`, `toId`, `relation`, `invoiceId?`, `createdBy` | Bảng `voucher_links`, đa hình, không FK cứng sang bảng chứng từ |
| `VoucherLinkKind` (enum) | `CASH_RECEIPT`, `CASH_PAYMENT`, `BANK_RECEIPT`, `BANK_PAYMENT` | Chỉ 4 giá trị đang cần; thêm sau khi có nhu cầu |
| `VoucherLinkRelation` (enum) | `REFUNDED_BY` | Một giá trị; enum để mở đường cho quan hệ khác mà không đổi schema |

## Contracts

### `INVOICE_CANCELLED` payload (mở rộng)

```ts
export interface InvoiceCancelledPayload {
  invoiceId: string;
  documentNumber: string;
  reason: string;
  branchId?: string;
  items: InvoiceCancelledItem[];
  organizationId: string;
  actorId: string;
  refunds: InvoiceCancelledRefundLeg[];   // MỚI — rỗng khi không thu được đồng nào
}

export interface InvoiceCancelledRefundLeg {
  invoicePaymentIds: string[];       // các dòng đã gộp vào chân này
  fundKind: 'CASH' | 'DEPOSIT';
  cashAccountId?: string;            // cash_accounts.id, chỉ khi CASH
  depositAccountId?: string;         // deposit_accounts.id, chỉ khi DEPOSIT
  amount: number;                    // tổng thực thu của chân này
  contraAccountId: string;           // COA doanh thu, đối ứng của bút toán movement
}
```

Trường cũ giữ nguyên tên và ý nghĩa nên consumer chưa nâng cấp vẫn chạy được.
`refunds` bổ sung ở cuối; consumer đọc `?? []`.

### Bảng `voucher_links`

```sql
CREATE TABLE voucher_links (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  branch_id        uuid NULL,
  from_kind        voucher_link_kind_enum NOT NULL,
  from_id          uuid NOT NULL,
  to_kind          voucher_link_kind_enum NOT NULL,
  to_id            uuid NOT NULL,
  relation         voucher_link_relation_enum NOT NULL,
  invoice_id       uuid NULL,
  created_by       uuid NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_voucher_links_pair
  ON voucher_links (organization_id, from_kind, from_id, to_kind, to_id, relation);
CREATE INDEX idx_voucher_links_from ON voucher_links (organization_id, from_kind, from_id);
CREATE INDEX idx_voucher_links_to   ON voucher_links (organization_id, to_kind, to_id);
CREATE INDEX idx_voucher_links_invoice ON voucher_links (organization_id, invoice_id);
```

Unique index là cơ chế chống ghi trùng khi sự kiện bị gửi lại (AC-09).

### Phiếu chi sinh ra

| | Chân tiền mặt | Chân tiền gửi |
|---|---|---|
| Service | `CashPaymentsService.createAndPostInternal` | `BankPaymentsService.createAndPostInternal` |
| `purpose` | `CashPaymentPurpose.REFUND` | `BankPaymentPurpose.REFUND` |
| `referenceType` | `CashPaymentReferenceType.REFUND` | `BankPaymentReferenceType.INVOICE` (enum không có REFUND — ADR-03) |
| `referenceId` | `invoiceId` | `invoiceId` |
| `contraAccountId` | COA doanh thu từ payload | COA doanh thu từ payload |
| `description` | `Hoàn tiền hủy hóa đơn <mã HĐ>` | `Hoàn tiền hủy hóa đơn <mã HĐ>` |
| Movement | `CashMovementType.WITHDRAWAL` | `source=POS_INVOICE`, `sourceRefId=invoiceId`, `sourceRefLineId=<depositAccountId>-CANCEL` |
| Category | `CashVoucherCategoryResolverService.resolveId(org, 'CHI_KHAC')` | không áp dụng |

### API đọc liên kết (AC-10)

`GET /cash-payments/:id` và `GET /cash-receipts/:id` trả thêm:

```json
{ "linkedVoucher": { "kind": "CASH_RECEIPT", "id": "…", "documentNumber": "PT0001", "relation": "REFUNDED_BY" } }
```

`null` khi chứng từ không có liên kết. Không đổi field nào đang có.

### POS — hủy hóa đơn

Không có endpoint mới. Frontend gọi `POST /invoices/:id/cancel` với `{ reason }`,
quyền backend giữ `pos.invoice.write`, việc "chỉ admin" chặn ở UI (A-09).

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| Trạng thái hóa đơn + tất toán công nợ | `CancelInvoiceService`, trong một transaction | Vĩnh viễn |
| Số dư quỹ tiền mặt + bút toán chân tiền mặt | Phiếu chi tiền mặt (movement do `createAndPostInternal` ghi) | Vĩnh viễn |
| Số dư tài khoản tiền gửi + bút toán chân tiền gửi | Phiếu chi tiền gửi | Vĩnh viễn |
| Bút toán doanh thu / công nợ | `JournalReverseConsumer` (đảo JE bán, giữ nguyên hành vi) | Vĩnh viễn |
| Cặp liên kết chứng từ | Consumer chân tiền mặt, cùng transaction với phiếu chi | Vĩnh viễn |
| Tồn kho | `StockReturnConsumer` | Vĩnh viễn |
| Trạng thái nút "Hủy hóa đơn" trên POS | Dialog chi tiết hóa đơn (state cục bộ) + TanStack Query cache | Màn hình |

## Error taxonomy

| Condition | Failure | Hệ quả |
|---|---|---|
| Hóa đơn không tồn tại trong org | `NotFoundException` 404 | Không thay đổi gì |
| Trạng thái ngoài paid/debt/partial_debt | `BadRequestException` 400 | Hành vi sẵn có, giữ nguyên (AC-16) |
| `type` là RETURN/EXCHANGE | `BadRequestException` 400 — "Chỉ hóa đơn bán mới được hủy" | Không phát sự kiện (AC-14) |
| Đã có hóa đơn trả/đổi trỏ tới | `BadRequestException` 400 | Không phát sự kiện (AC-15) |
| Không giải quyết được quỹ tiền mặt chi nhánh | `BadRequestException` 400 tại `cancel()` | Chặn hủy ngay từ đầu, không để sinh sự kiện không xử lý được |
| Quỹ tiền mặt không đủ số dư khi ghi phiếu chi | `BadRequestException` từ `cashService.recordMovement` → consumer ném → DLQ | Hóa đơn đã hủy; kế toán nạp quỹ rồi replay từ DLQ |
| Kỳ kế toán tiền gửi bị khóa (BR-LOCK-01) | `ConflictException` từ `createAndPostInternal` → DLQ | Có thể retry sau khi mở kỳ — cố ý không nuốt lỗi |
| Hóa đơn có nhiều hơn một quỹ tiền gửi | `ConflictException` — không tạo phiếu nào → DLQ | Xem ADR-06 |
| Không tìm thấy phiếu thu gốc để link | Ghi log cảnh báo, **vẫn tạo phiếu chi**, bỏ qua dòng link | Tiền quan trọng hơn liên kết; kế toán vẫn có chứng từ chi |
| Frontend nhận 400 | Hiển thị message từ API | Hóa đơn giữ nguyên (AC-20) |

## Cache & offline

Không có tầng offline. Sau khi hủy thành công, POS invalidate query key `["invoices", …]`
theo prefix để danh sách và dialog chi tiết cùng nạp lại (AC-19). Không có cache
phía server nào chứa trạng thái hóa đơn.

## Observability

- `CancelInvoiceService`: log `invoiceId`, mã hóa đơn, số chân hoàn và tổng tiền hoàn.
- Consumer chân tiền mặt: log `invoiceId` → số phiếu chi + số tiền + id phiếu thu đã link.
- Consumer chân tiền gửi: log `invoiceId` → số phiếu chi + tài khoản tiền gửi + số tiền.
- `StockReturnConsumer`: giữ log hiện có, thêm số dòng được định tuyến về showroom.
- Mọi lỗi không nuốt được đi DLQ `dead_letter_events` như các consumer khác — không thêm cơ chế mới.

## ADRs

### ADR-01 — Phiếu chi sinh bất đồng bộ qua consumer, payload mang sẵn phần hoàn
**Context:** `cancel()` nằm trong module `pos`; các service phiếu chi nằm trong `accounting`.
Mọi hệ quả khác của việc hủy (đảo bút toán, hoàn kho, đảo tiền gửi) đã đi qua sự kiện.
**Decision:** Giữ đúng khung sự kiện. `CancelInvoiceService` tính sẵn `refunds[]` từ
`invoice_payments` và gắn vào `INVOICE_CANCELLED`; consumer bên `accounting` sinh phiếu.
**Consequences:** Hủy hóa đơn không bị rollback vì lỗi kế toán; đổi lại có khoảng thời gian
hóa đơn đã CANCELLED nhưng phiếu chi chưa sinh, và lỗi chân tiền chỉ thấy được ở DLQ.
Chấp nhận được vì đây đã là hợp đồng vận hành sẵn có của luồng hủy.
**Status:** accepted

### ADR-02 — `voucher_links` là bảng liên kết đa hình dùng chung
**Context:** `reverses_voucher_id` / `reversed_by_voucher_id` sẵn có chỉ trỏ trong cùng bảng.
Cặp cần nối ở đây là phiếu thu ↔ phiếu chi, khác bảng.
**Decision:** Một bảng `voucher_links` (`from_kind/from_id/to_kind/to_id/relation`), không
thêm cột vào bảng chứng từ nào. Chống trùng bằng unique index trên bộ khóa đầy đủ.
**Consequences:** Mọi màn hình muốn hiện chứng từ đối phía phải join thêm một bảng, và
không có FK cứng nên xóa chứng từ (soft-delete) không tự dọn link. Đổi lại, cặp chứng từ
mới sau này (phiếu thu ↔ phiếu thu, thu tiền gửi ↔ chi tiền mặt) không cần migration.
**Status:** accepted

### ADR-03 — Chân tiền gửi dùng `referenceType = INVOICE`, không thêm giá trị enum
**Context:** `CashPaymentReferenceType` có `REFUND`; `BankPaymentReferenceType` thì không —
thêm giá trị vào enum Postgres cần một migration riêng và phải cẩn thận với thứ tự
add-then-use.
**Decision:** Chân tiền gửi dùng `BankPaymentReferenceType.INVOICE` với `referenceId = invoiceId`;
lý do hoàn tiền đã nằm ở `purpose = REFUND`.
**Consequences:** Hai chân không đối xứng về `reference_type`, khác với chữ nghĩa của AC-08 —
đã nêu rõ khi trình G2. Truy vấn "mọi phiếu chi hoàn tiền" phải lọc theo `purpose`, không
lọc theo `reference_type`.
**Status:** accepted

### ADR-04 — Phiếu chi tiền gửi sở hữu deposit movement
**Context:** `DepositRefundService.reverseForCancelledInvoice` hiện ghi movement WITHDRAWAL
thô, không chứng từ. Nếu vừa giữ movement đó vừa thêm phiếu chi thì quỹ tiền gửi bị trừ hai lần.
**Decision:** Bỏ đường ghi movement thô trong luồng hủy. `BankPaymentsService.createAndPostInternal`
tạo movement + JE + phiếu trong một transaction, mang `source = POS_INVOICE`,
`sourceRefId = invoiceId`, `sourceRefLineId = <depositAccountId>-CANCEL`.
**Consequences:** Movement gốc của lần bán **không** bị đảo mà bị bù bằng một movement rút mới
— nghĩa là ràng buộc "đã đối chiếu thì không đảo được" (BR-REF-02) không còn chặn việc hủy,
và A-10 tự tan. `DepositRefundService.reverseForCancelledInvoice` không còn được gọi từ luồng hủy;
giữ lại hay xóa hẳn quyết định khi làm ticket, sau khi kiểm tra không còn caller nào khác.
**Status:** accepted

### ADR-05 — Giữ nguyên double-post GL ở chân bán, khóa hành vi bằng test
**Context:** `JournalSaleConsumer` ghi DR COA tiền cho từng dòng thanh toán, trong khi bút toán
của movement (phiếu thu POS_SALE) cũng ghi DR COA tiền / CR doanh thu cho đúng khoản đó — COA
tiền và doanh thu bị ghi đôi trên mọi hóa đơn bán tiền mặt. `journal-return.consumer.ts` đã
sửa theo chuẩn "bút toán movement sở hữu chân tiền"; chân bán thì chưa.
**Decision:** Để ngoài phạm vi (A-13). Luồng hủy vẫn đảo **toàn bộ** JE bán như hiện tại, và
phiếu chi mới ghi bút toán chân tiền của nó. Cộng dồn ra đúng — nhưng đúng vì hai chỗ ghi đôi
triệt tiêu nhau, không phải vì từng chỗ đúng.
**Consequences:** Ai sửa double-post ở chân bán **bắt buộc** phải sửa luồng hủy trong cùng
lần đó, nếu không COA tiền sẽ bị credit thừa khi hủy. Ràng buộc này được khóa bằng một unit
test đặt cạnh `JournalReverseConsumer`, tên nói thẳng sự phụ thuộc, kèm comment trỏ về ADR này.
**Status:** accepted

### ADR-06 — Một phiếu chi cho mỗi cặp (hóa đơn, quỹ); nhiều quỹ tiền gửi thì dừng và báo
**Context:** `createAndPostInternal` chống trùng theo `(referenceType, referenceId)`. Với
`referenceId = invoiceId`, hai phiếu chi tiền gửi trên cùng hóa đơn sẽ bị coi là trùng và
phiếu thứ hai âm thầm không được tạo — mất tiền không ai biết.
**Decision:** Gộp các dòng thanh toán theo quỹ đích. Chân tiền mặt luôn đúng một phiếu (một
quỹ tiền mặt / chi nhánh). Chân tiền gửi: đúng một quỹ thì đi đường bình thường; từ hai quỹ
trở lên thì **không tạo phiếu nào** và ném lỗi để sự kiện rơi vào DLQ kèm hướng dẫn xử lý tay.
**Consequences:** Hóa đơn trả bằng hai tài khoản ngân hàng khác nhau sẽ không tự hoàn tiền —
hiếm, và thà dừng hẳn còn hơn hoàn thiếu trong im lặng. Nếu về sau nghiệp vụ cần, cách mở là
đổi khóa chống trùng sang mức dòng thanh toán.
**Status:** accepted
