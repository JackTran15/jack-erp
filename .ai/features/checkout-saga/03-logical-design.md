---
feature: checkout-saga
adr_count: 6
---

# Logical design — Checkout Saga v2

## Approach

Một module mới `apps/api/src/modules/pos/checkout-saga/` dựng lại luồng thanh toán đơn bán thành
một **orchestrated saga**: một danh sách step có kiểu, chạy tuần tự bởi một orchestrator, mỗi step
ghi lại tên, kết quả, thời lượng và lỗi vào một trail truy vết được. Hình dạng lấy từ house pattern
sẵn có trong `accounting/` (bốn bản saga: `debt-collection`, `supplier-debt-payment`,
`deposit-debt-collection`, `supplier-deposit-payment`) — bảng saga có `idempotency_key` unique theo
tổ chức, `status PENDING|COMPLETED|COMPENSATED|FAILED`, toàn bộ step trong **một**
`dataSource.transaction`, replay khi gặp `COMPLETED`. Cái epic này thêm vào so với house pattern:
step là object có kiểu chứ không phải comment, có bảng log từng bước, có outbox ở đuôi, và có
correlation id xuyên suốt.

Luồng chia hai phase. **Preflight** đọc và resolve mọi thứ có thể ném lỗi — draft, khuyến mại, tài
khoản hạch toán, quỹ, tổng tiền — *trước khi* mở transaction; nguyên tắc này chép từ
`cancel-invoice.service.ts:89` và chính là chỗ luồng hiện tại làm ngược (lỗi (e)).
**Transactional** mở một transaction duy nhất bọc mọi ghi DB: saga row, khoá hóa đơn, cấp số, tiêu
voucher, hóa đơn, thanh toán, công nợ, điểm, **trừ kho, bút toán GL, thu quỹ tiền mặt, quỹ tiền
gửi**, và các dòng outbox. Bốn cái in đậm hôm nay chạy async sau commit; đưa vào trong transaction
là điều biến "hỏng giữa chừng" từ mất dữ liệu vĩnh viễn thành một `ROLLBACK`.

Vì mọi ghi nằm trong một transaction, **compensation gần như không tồn tại**: rollback *là* phép bù
cho tất cả các step DB. Đây là điểm khác biệt có chủ ý so với saga kiểu sách giáo khoa, và là lý do
mô hình này đạt ACID thật thay vì nhất quán sau cùng.

Endpoint mới đứng song song, luồng cũ không bị chạm. POS chuyển sang bằng `VITE_CHECKOUT_V2`.

## Alternatives rejected

| Option | Why not |
|---|---|
| Saga mỗi step một transaction + compensation ngược chiều (kiểu sách giáo khoa) | Không cho ACID — vẫn tồn tại state trung gian nhìn thấy được (hóa đơn PAID mà chưa có bút toán), và bản thân compensation cũng có thể fail nên cần thêm retry/DLQ riêng cho nó. Người dùng đặt yêu cầu là *đảm bảo ACID*, không phải *đúng hình mẫu saga* |
| Giữ trừ kho / GL / quỹ ở consumer async, chỉ bọc outbox để không mất event | Nhẹ hơn nhiều nhưng vẫn là nhất quán sau cùng ở đúng phần tiền và kho; một consumer hỏng vĩnh viễn vẫn để hóa đơn PAID mà sổ trống. Đã cân nhắc và bị loại khi chốt mô hình |
| Sửa `CheckoutInvoiceService` tại chỗ cho gọn | Vi phạm ràng buộc cứng của epic. Ngoài ra sửa một hàm 371 dòng đang chạy production, không có e2e xanh nào bảo vệ (`pos.e2e-spec.ts:119` là `describe.skip`), là cách nhanh nhất để hỏng doanh thu |
| Dùng `@nestjs/cqrs` Saga / `EventBus` | Repo không dùng `EventBus` ở đâu (0 hit), không có `@EventsHandler`, không có `@Saga`. Đưa vào đây là dựng một cơ chế thứ hai song song với Kafka mà không ai khác dùng |
| Thêm `nestjs-cls` / AsyncLocalStorage để truyền correlation id ngầm | Thêm dependency cho một thứ giải được bằng một trường trên `CheckoutContext`. Ràng buộc "không thêm dependency" |
| Thêm bảng outbox riêng cho checkout | `outbox_messages` + `OutboxRelayService` đã có, đã chạy production, `EventsModule` là `@Global()`. Dựng cái thứ hai là nợ kỹ thuật thuần |

## Domain model

| Thành phần | Vai trò | Ghi chú |
|---|---|---|
| `CheckoutStep` | Hợp đồng một bước | `{ name, phase, execute(ctx), compensate?(ctx) }` |
| `CheckoutContext` | Túi trạng thái chảy qua các step | `actor`, `dto`, `correlationId`, `sagaId`, `manager?`, và các ô kết quả tích lũy |
| `CheckoutSagaOrchestrator` | Chạy step theo thứ tự, đo thời lượng, ghi trace, map lỗi | Không chứa nghiệp vụ |
| `CheckoutTrace` | Trail trong RAM | Flush vào DB ở step cuối khi thành công, ở transaction thứ hai khi hỏng |
| `CheckoutSagaEntity` | Bảng `checkout_saga` | `idempotency_key`, `correlation_id`, `status`, `current_step`, `error` |
| `CheckoutSagaStepEntity` | Bảng `checkout_saga_step` | `saga_id, seq, name, phase, status, started_at, duration_ms, output jsonb, error` |

### Thứ tự step

**Preflight** — ngoài transaction, chỉ đọc và resolve.

| # | Step | Việc |
|---|---|---|
| 01 | `load-draft` | đọc invoice + items; guard `isDraft`; guard items ≠ rỗng; guard mọi item có `locationId` |
| 02 | `evaluate-promotion` | `queryBus.execute(new EvaluateCartQuery(...))` — server tự tính (UOW-04) |
| 03 | `resolve-accounts` | REVENUE, RECEIVABLE, COA + `depositAccountId` từng dòng thanh toán |
| 04 | `resolve-funds` | quỹ tiền mặt chi nhánh + deposit target; **và** `documentNumbering.preview()` để đảm bảo rule đánh số tồn tại (A-07) |
| 05 | `compute-totals` | subtotal, chiết khấu, điểm, đặt cọc, `amountDue`, `totalPaid`, `remainder`, `newStatus`, `pointsEarned`; chặn trả thừa; chặn công nợ không có khách |

**Transactional** — BEGIN.

| # | Step | Việc |
|---|---|---|
| 06 | `open-saga` | insert `checkout_saga` PENDING; `COMPLETED` cùng key → replay; `PENDING` cùng key → 409 |
| 07 | `lock-invoice` | `SELECT … FOR UPDATE`, khẳng định lại DRAFT — vá lỗi (f) |
| 08 | `next-document-number` | khoá `document_number_counters` bằng `manager`, tăng, format — xem ADR-02 |
| 09 | `redeem-voucher` | `VoucherService.markUsed(id, invoiceId, manager)` — 0 row → `ConflictException` |
| 10 | `persist-invoice` | header + dòng quà + snapshot CTKM |
| 11 | `persist-payments` | `invoice_payments` |
| 12 | `create-debt` | `invoice_debts` khi `remainder > 0` |
| 13 | `redeem-points` | `MembershipCardService.redeemPointsForInvoice(…, manager)` |
| 14 | `deduct-stock` | `StockLedgerService.recordBatchMovements(movements, manager)`, gồm cả dòng quà |
| 15 | `post-journal` | `JournalService.post(dto, actor, manager)` |
| 16 | `post-cash` | `CashService.recordMovement(…, manager)` mỗi dòng CASH |
| 17 | `post-deposit` | `DepositService.createAndPostInternal(…, manager)` mỗi dòng non-CASH |
| 18 | `enqueue-outbox` | `OutboxService.enqueue(manager, …)`: `SALE_POSTED`, `TEMP_WAREHOUSE_INVOICE_FULFILL`, `LOYALTY_POINTS_AWARD`, thông báo WS |
| 19 | `close-saga` | saga → `COMPLETED`, flush bảng step |

COMMIT → `outboxRelay.dispatchNow()`.

**Thứ tự khoá cố định để tránh deadlock:** `invoices` → `document_number_counters` →
`membership_cards` → `invoice_debts` → `vouchers`. Ghi thành comment trong `checkout-step.ts` và
kiểm ở code review.

## Contracts

### POST /v2/pos/checkout

Guards như luồng cũ: `PermissionGuard` + `BranchScopeGuard`, `@RequirePermission('pos.invoice.write')`,
`@RequireBranchScope()`. Header `x-idempotency-key` tùy chọn; thiếu thì lấy `invoiceId` (A-13).

Request:
```jsonc
{
  "invoiceId": "uuid",
  "payments": [
    { "paymentMethod": "cash", "amount": 100000, "paymentAccountId": "uuid?", "reference": "string?" }
  ],
  "dueDate": "2026-08-20",          // optional
  "creditDays": 15,                  // optional
  "selectedProgramIds": ["uuid"],    // optional, UOW-04
  "voucherCode": "string?",          // optional, UOW-05
  "dryRun": false                    // optional
}
```

Response 200 (thật) / 200 (dry-run, `committed: false`):
```jsonc
{
  "sagaId": "uuid",
  "committed": true,
  "invoice": { "id": "uuid", "code": "HD202608-00042", "status": "PAID", "amountDue": 100000 },
  "totals": { "subtotal": 0, "promotionDiscount": 0, "pointsDiscountAmount": 0,
              "depositAmount": 0, "amountDue": 0, "totalPaid": 0, "remainder": 0,
              "pointsEarned": 0 },
  "appliedPrograms": [],             // UOW-04
  "steps": [ { "seq": 1, "name": "load-draft", "phase": "preflight",
               "status": "OK", "durationMs": 4 } ]
}
```

Lỗi mang thêm `sagaId` và `failedStep` để tra cứu. **Hình dạng thân lỗi do
`HttpExceptionFilter` toàn cục quyết định** (`common/filters/http-exception.filter.ts:30-42`), không
do controller này: filter ghi đè `code` ở mức trên cùng thành `HTTP_<status>` và gộp toàn bộ response
object của exception vào `details`. Nên step ném `new BadRequestException({ code, ... })` sẽ ra:

```jsonc
{
  "code": "HTTP_400",
  "message": "…",
  "details": {
    "requestId": "…",
    "code": "CASH_FUND_NOT_CONFIGURED",
    "sagaId": "uuid",
    "failedStep": "resolve-funds"
  }
}
```

Client đọc mã nghiệp vụ ở `details.code`, không phải `code`. Đây là hành vi chung của mọi endpoint
trong repo; epic này đi theo cho nhất quán thay vì dựng filter riêng. Bảng "Error taxonomy" bên dưới
nói về giá trị `details.code`.

### GET /v2/pos/checkout/sagas/:id

Trả `checkout_saga` + mảng `checkout_saga_step` theo `seq`. Scope theo `actor.organizationId`,
404 nếu không thuộc tổ chức. Gương của `DebtCollectionSagaService.getSaga`.

### Schema mới

```sql
-- checkout_saga
id uuid pk, organization_id varchar not null, branch_id varchar,
created_by varchar not null, created_at/updated_at timestamptz,
idempotency_key varchar(200) not null, correlation_id varchar(200),
invoice_id uuid, document_number varchar(64),
status checkout_saga_status_enum not null default 'PENDING',
current_step varchar(64), total_steps int, duration_ms int,
started_at timestamptz, finished_at timestamptz, error jsonb
-- partial unique: (organization_id, idempotency_key) WHERE status <> 'FAILED'   [A-13]
-- idx: (organization_id, status), (invoice_id)

-- checkout_saga_step
id uuid pk, saga_id uuid not null, seq int not null, name varchar(64) not null,
phase varchar(16) not null, status varchar(16) not null,
started_at timestamptz, duration_ms int, output jsonb, error text
-- unique (saga_id, seq); idx (saga_id)
```

UOW-04 thêm: `invoice_items.is_gift boolean not null default false`,
`invoice_items.promotion_program_id uuid null`, và bảng `invoice_checkout_promotions`
(snapshot CTKM đã áp: `invoice_id, program_id, code, name, type, priority, discount_amount,
line_discounts jsonb, gifts jsonb`). Không đụng bảng `invoice_promotions` cũ.

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| Kết quả từng step | `CheckoutContext` trong RAM | Một request |
| Trail truy vết | `CheckoutTrace` trong RAM, rồi `checkout_saga_step` | Vĩnh viễn sau khi flush |
| Ranh giới transaction | `CheckoutSagaOrchestrator` | Chỉ phase transactional |
| `manager` | Orchestrator gán vào `ctx` khi mở transaction | Chỉ trong transaction |
| Chống trùng | Unique index trên `checkout_saga` | Vĩnh viễn |
| Event chưa gửi | `outbox_messages` | Tới khi relay publish |

## Error taxonomy

Mọi lỗi mang `sagaId` và `failedStep`. Ánh xạ sang exception NestJS sẵn có; không thêm filter mới.
Cột "Mã" là giá trị `details.code` trong thân trả về (xem mục Contracts).

Orchestrator **không** tự đặt mã theo step: nó giữ nguyên `HttpException` mà step ném (kể cả status),
chỉ gắn thêm `sagaId` + `failedStep`. Lỗi không phải `HttpException` là lỗi lập trình và thành 500
`CHECKOUT_FAILED`. Riêng `POSTING_FAILED` do chính step 14–17 bọc, vì orchestrator không được biết
ngữ nghĩa của từng step.

| Điều kiện | Mã | HTTP | Xảy ra ở | Hệ quả |
|---|---|---|---|---|
| Hóa đơn không tồn tại / không thuộc tổ chức | `INVOICE_NOT_FOUND` | 404 | 01 | không có gì |
| Không phải draft, không có dòng hàng, dòng thiếu `locationId` | `INVOICE_NOT_CHECKOUTABLE` | 400 | 01 | không có gì |
| Item hoặc khách không tồn tại khi tính CTKM | `UNKNOWN_ITEM` / `UNKNOWN_CUSTOMER` | 400 | 02 | không có gì |
| Thiếu cấu hình COA doanh thu / phải thu | `ACCOUNT_NOT_CONFIGURED` | 400 | 03 | không có gì |
| `paymentAccountId` sai chi nhánh hoặc sai phương thức | `PAYMENT_ACCOUNT_INVALID` | 400 | 03 | không có gì |
| Chi nhánh không có quỹ tiền mặt, hoặc có nhiều hơn một | `CASH_FUND_NOT_CONFIGURED` | 400 | 04 | không có gì — **đây là lỗi (e), nay bắt được trước transaction** |
| Không có rule đánh số và không tự tạo được | `DOC_NUMBER_RULE_MISSING` | 400 | 04 | không có gì |
| Trả thừa, hoặc còn nợ mà không có khách | `PAYMENT_INVALID` | 400 | 05 | không có gì |
| Saga cùng key đang `PENDING` | `CHECKOUT_IN_PROGRESS` | 409 | 06 | rollback |
| Hóa đơn bị request khác giành mất giữa chừng | `INVOICE_NOT_CHECKOUTABLE` | 409 | 07 | rollback |
| Voucher đã dùng hoặc bị giành mất | `VOUCHER_ALREADY_USED` | 409 | 09 | rollback |
| Thẻ không đủ điểm | `INSUFFICIENT_POINTS` | 400 | 13 | rollback |
| Kho / GL / quỹ ném lỗi bất kỳ | `POSTING_FAILED` | 500 | 14–17 | rollback |
| Saga cùng key đã `COMPLETED` | — | 200 | 06 | **replay**, không phải lỗi |

Bất biến chung: với mọi lỗi ở step 06–19, số dòng của 8 bảng nghiệp vụ và `currentValue` của counter
không đổi (AC-17).

## Observability

- Một dòng log mỗi step qua Nest `Logger`, không thêm dependency:
  `[checkout-saga][saga=3f2a…][corr=req-7c1…][step=14/19 deduct-stock][OK] 23ms lines=5`
- Dòng tổng kết khi hỏng: `ROLLBACK after 15/19 — 412ms total`.
- `correlationId` lấy từ `x-request-id` (`RequestIdInterceptor` đã có), truyền tay qua
  `CheckoutContext` vì repo không có AsyncLocalStorage.
- Trail đọc được qua `GET /v2/pos/checkout/sagas/:id`.
- `MetricsService.observeCheckout` đã có — luồng v2 dùng lại với nhãn riêng để so p95 v1 với v2.

## ADRs

### ADR-01 — Trace của lần chạy hỏng ghi ở transaction thứ hai, sau rollback
**Context:** step row ghi trong transaction chính sẽ biến mất khi rollback — tức là đúng ca cần trace
nhất lại không để lại dấu vết.
**Decision:** orchestrator giữ trail trong RAM; thành công thì flush cùng transaction ở step 19; hỏng
thì sau khi rollback mở một transaction mới ghi `checkout_saga(status=FAILED)` + toàn bộ trail.
**Consequences:** đơn giản hơn nhiều so với mở connection riêng và cho cùng mức quan sát; trace của
ca hỏng đến sau lỗi vài ms; nếu process chết ngay lúc rollback thì mất trace DB nhưng log dòng vẫn còn.
**Status:** accepted

### ADR-02 — Saga tự cấp số hóa đơn trong transaction, không gọi `DocumentNumberingService`
**Context:** `generate()` mở transaction `SERIALIZABLE` riêng và không nhận `manager`, nên số đã cấp
không rollback theo được → nhảy số. Sửa nó là sửa code cũ, bị cấm.
**Decision:** thêm step `next-document-number` khoá dòng `document_number_counters` bằng
`setLock('pessimistic_write')` qua `manager` của saga, tăng và format theo `document_number_rules`.
Dùng lại đúng bảng và entity đang có. Preflight gọi `documentNumbering.preview()` (public, đã tự
`ensureDefaultActiveRule`) để đảm bảo rule tồn tại, nên step 08 không tự tạo rule.
**Consequences:** không nhảy số; nhưng phải chép ~40 dòng thuần `computeResetKey` +
`formatDocumentNumber` + `formatDate` vì chúng là private (A-06) — bù bằng test parity bắt buộc
(AC-14). Dòng counter bị khoá từ step 08 tới COMMIT nên checkout cùng `(branch, INVOICE)` tuần tự hoá
(A-09); đường lùi là chuyển step này xuống áp chót + `UPDATE invoices SET code`. Trong giai đoạn song
song, v1 (`SERIALIZABLE`) và v2 (`FOR UPDATE`) tranh cùng dòng counter — v1 đã có sẵn đường retry
`40001` (`document-numbering.service.ts:343`), vẫn phải kiểm bằng AC-15.
**Status:** accepted

### ADR-03 — Trừ kho / bút toán / thu quỹ chuyển vào inline; luồng v2 không publish 4 topic cũ
**Context:** bốn việc này hôm nay chạy ở consumer async sau commit, là nguồn gốc của lỗi (b), (c), (d).
**Decision:** gọi thẳng `StockLedgerService` / `JournalService` / `CashService` / `DepositService` với
`manager` của saga — cả bốn đều đã nhận `manager` và được module export, nên không phải sửa file nào.
Luồng v2 **không** publish `STOCK_DEDUCTION`, `JOURNAL_POST_SALE`, `CASH_MOVEMENT_FROM_PAYMENT`,
`DEPOSIT_VOUCHER_NEEDED_POS_SALE`. Consumer cũ giữ nguyên và vẫn phục vụ v1.
**Consequences:** không có xử lý hai lần khi hai luồng chạy song song. Transaction dài hơn (~4 lượt
ghi) nên phải đo p95 (A-09, T-03-06). Đổi lại: hỏng giữa chừng thành `ROLLBACK` thay vì mất dữ liệu.
**Status:** accepted

### ADR-04 — Loyalty EARN và temp-warehouse fulfill vẫn async, qua outbox
**Context:** hai việc này cộng thêm, idempotent, và thuộc mối quan tâm khác — fulfill vốn no-op khi
chi nhánh không có phiên ACTIVE.
**Decision:** giữ async nhưng phát qua `OutboxService.enqueue(manager, …)` trong chính transaction,
thay vì publish thẳng. `pointsBalanceAfter` vẫn chiếu trong transaction như luồng cũ.
**Consequences:** không thể mất event nữa; điểm tích vẫn đến sau vài giây. Nếu
`awardPointsForInvoice` hoá ra có nhận `manager` (A-10) thì vẫn giữ nguyên quyết định này để tránh
kéo dài transaction.
**Status:** accepted

### ADR-05 — Chống trùng đặt ở tầng DB, không dựa vào `IdempotencyInterceptor`
**Context:** interceptor Redis chỉ lưu **sau khi** handler resolve nên không có khoá in-flight — hai
request giống hệt vẫn chạy cả hai; và nó chỉ hoạt động khi client chịu gửi header.
**Decision:** `checkout_saga` mang `UNIQUE (organization_id, idempotency_key) WHERE status <> 'FAILED'`;
`idempotency_key` mặc định là `invoiceId` khi client không gửi header. `COMPLETED` cùng key → replay
kết quả; `PENDING` cùng key → 409.
**Consequences:** một hóa đơn chỉ checkout được một lần kể cả khi client không gửi header — đóng lỗi
(f) ở tầng DB. Lần chạy `FAILED` không chặn lần chạy lại nhờ partial index (A-13). Interceptor toàn
cục vẫn chạy và vô hại.
**Status:** accepted

### ADR-06 — Gọi engine khuyến mại qua `QueryBus`, không import `PromotionResolver`
**Context:** `promotion.module.ts` chỉ export bốn service cũ; `PromotionResolver` và các port không
được export. Thêm export là sửa code hiện tại.
**Decision:** step `evaluate-promotion` dispatch `new EvaluateCartQuery(dto, actor)` qua `QueryBus` —
handler đã đăng ký sẵn và bus của `CqrsModule` là toàn app.
**Consequences:** không đụng `promotion.module.ts`. Đánh đổi: engine đọc dữ liệu bằng transaction
riêng, ngoài transaction saga, nên CTKM đổi giữa preflight và COMMIT thì đơn dùng bản đọc lúc
preflight (A-11) — chấp nhận, vì `POST /v2/promotions/evaluate` vốn đã đọc như vậy.
**Status:** accepted
