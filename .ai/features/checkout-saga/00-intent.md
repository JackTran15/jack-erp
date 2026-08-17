---
feature: checkout-saga
slug: checkout-saga
owner: Akenzy
created: 2026-08-04
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Checkout Saga v2 (luồng thanh toán POS)

Nguồn: kế hoạch đã duyệt `~/.claude/plans/sharded-hugging-cascade.md`, đọc trực tiếp
`apps/api/src/modules/pos/services/checkout-invoice.service.ts` (475 dòng) ngày 2026-08-04.
Luồng cũ **không bị xóa và không bị sửa** — nó vẫn phục vụ POS cho tới khi bật cờ.

## Problem

Thanh toán một hóa đơn POS hôm nay chạy trong `CheckoutInvoiceService.runCheckout()` — một hàm
~371 dòng, 18 dependency, một `dataSource.transaction` bọc đúng phần lõi hóa đơn, rồi **7 lệnh
`await publish()` chạy sau khi transaction đã commit**. Hệ quả là luồng này không đảm bảo ACID
và không truy vết được. Tám lỗi cụ thể đã xác minh trên code:

| # | Lỗi | Bằng chứng |
|---|---|---|
| a | Số hóa đơn bị đốt khi rollback — `documentNumbering.generate` commit transaction `SERIALIZABLE` riêng *trước* khi transaction checkout mở | `checkout-invoice.service.ts:222` vs `:231`; `document-numbering.service.ts:354` |
| b | Hóa đơn ghi PAID nhưng không có hệ quả nào — Kafka chết ở lệnh publish đầu tiên → đã đốt voucher, đã trừ điểm, nhưng **không trừ kho, không bút toán, không thu quỹ** | `:314–453` |
| c | Fan-out đứt giữa chừng — 8 `await` tuần tự, không batch, không wrapper | `:364` |
| d | Trừ kho từng phần — publisher loop từng item; hóa đơn 5 dòng fail ở dòng 3 → trừ 2 dòng | `stock-deduction.publisher.ts:36-58` |
| e | `resolveBranchCashFund` throw **sau** commit. Đây là lỗi *cấu hình*, xác suất thật cao nhất: lúc nó chạy thì kho đã trừ, doanh thu đã ghi GL, nhưng tiền không bao giờ vào quỹ. Sổ lệch vĩnh viễn, thu ngân nhận `400` tưởng đơn bị từ chối | `:390`; `cash-fund-resolver.service.ts:34-42` |
| f | Checkout đồng thời hai lần — invoice đọc ngoài transaction, không lock, `InvoiceEntity` không có `@VersionColumn`, không re-guard trong transaction | `:109`, `:117` |
| g | Không có compensation nào — cả `runCheckout` không có một `try/catch` nào ngoài wrapper metrics chỉ rethrow | `:94-101` |
| h | Voucher không có reservation — `apply` và `commitPromotions` là hai transaction cách nhau vài phút; hai draft cùng áp một voucher đều checkout được | `promotion-apply.service.ts:111` vs `:186` |

Và không có test nào bắt được nhóm lỗi này: `checkout-invoice.service.spec.ts` mock
`dataSource.transaction` nên không bao giờ chạy rollback thật; e2e checkout là `describe.skip`
(`pos.e2e-spec.ts:119`).

Đây cũng là vật cản của epic kế tiếp: ghép khuyến mại và voucher vào một luồng đã không truy vết
được sẽ nhân đôi số cách hỏng thay vì thêm tính năng.

## Affected personas

| Persona | Hành vi hiện tại | Hành vi mong muốn |
|---|---|---|
| Thu ngân | Bấm thanh toán, gặp lỗi 400/500, không biết đơn đã ghi hay chưa; bấm lại thì nhận "not a draft" | Hoặc đơn xong hẳn, hoặc không có gì xảy ra; lỗi kèm mã tra cứu |
| Kế toán | Phát hiện sổ lệch sau nhiều ngày, không lần được đơn nào hỏng ở bước nào | Mỗi đơn có một saga row + trail từng bước, tra bằng một endpoint |
| Dev trực | Đọc log dòng lẻ, không biết bước nào chạy, bước nào chưa | Log có cấu trúc theo bước, kèm `sagaId` và `correlationId` |

## Success signal

Một lần chạy hỏng giữa chừng để lại **đúng 0 dòng** ghi mới trong 8 bảng nghiệp vụ
(`invoices`, `invoice_payments`, `invoice_debts`, `stock_ledger_entries`, `journal_entries`,
`journal_lines`, `cash_movements`, `outbox_messages`) và counter số hóa đơn **không tăng** —
đo bằng `SELECT count(*)` trước/sau trong e2e, và bằng `checkout_saga` có đúng một row `FAILED`
kèm trail đủ số bước đã chạy.

## Out of scope

- **Đơn trả / đổi hàng** (`checkout-return.service.ts`, 936 dòng). Lý do: gấp đôi khối lượng, có
  hoàn tiền CASH/BANK, offset công nợ, hoàn kho showroom — đủ lớn cho một epic riêng. Bộ step +
  orchestrator viết ở đây sẽ dùng lại được.
- **Xóa hoặc sửa `CheckoutInvoiceService`.** Ràng buộc cứng của epic: code cũ chỉ để tham chiếu.
  Việc gỡ nó là một quyết định sau khi v2 chạy thật ổn định.
- **Chuyển 4 consumer cũ** (`stock-deduction`, `journal-sale`, cash, deposit) sang dùng chung với
  v2. Chúng giữ nguyên để phục vụ v1 trong lúc song song.
- **Loyalty EARN và temp-warehouse fulfill chạy inline.** Hai việc này cộng thêm và idempotent,
  đi qua outbox là đủ (xem ADR-04).
- **Báo cáo / màn hình backoffice cho saga trail.** Chỉ có `GET /v2/pos/checkout/sagas/:id` trả JSON.

## Constraints

| Kind | Detail |
|---|---|
| Ràng buộc cứng | Không sửa một dòng nào của **luồng checkout** hiện tại. Năm ngoại lệ đã thỏa thuận với Akenzy: (1) một dòng `imports` ở `pos.module.ts`; (2) `apps/pos-web/src/services/invoice.service.ts` và (3) `apps/pos-web/src/dtos/invoice.dto.ts` cho cờ cutover (UOW-05); (4) `apps/api/test/e2e/setup/jest-setup.ts` nâng hook timeout 30s→180s, vì e2e của **toàn repo** đang fail trước khi chạy test nào (A-18); (5) hai `@Column` bổ sung trên `apps/api/src/modules/pos/entities/invoice-item.entity.ts`, bắt buộc vì e2e dựng schema từ entity chứ không từ migration (A-17, A-20) |
| Kiến trúc | Theo house pattern saga sẵn có (4 bản trong `accounting/`), không thêm thư viện state machine |
| Dependency | Không thêm dependency mới: không pino/winston, không OpenTelemetry, không BullMQ, không `nestjs-cls` |
| DB | `synchronize: false`; đổi schema chỉ qua migration viết tay; `migrationsTransactionMode: 'each'` |
| Ngôn ngữ | Source backend English-only; tiếng Việt chỉ ở chuỗi hiển thị và ở tài liệu này |

## Existing surface touched

- **Tái dùng, không sửa:** `OutboxService.enqueue(manager, …)` + `OutboxRelayService.dispatchNow()`
  (`modules/events/outbox/`, `EventsModule` là `@Global()`); `StockLedgerService.recordBatchMovements(_, manager)`;
  `JournalService.post(_, _, manager)`; `CashService.recordMovement(_, _, manager)`;
  `DepositService.createAndPostInternal(…, manager)`; `VoucherService.markUsed(id, invoiceId, manager)`;
  `MembershipCardService.redeemPointsForInvoice(_, manager, _)`; `ItemCostSnapshotService.snapshotOne`;
  `AccountResolverService`; `CashFundResolverService`; `EvaluateCartQuery` qua `QueryBus`.
- **Đọc làm khuôn:** `accounting/cash-vouchers/debt-collection/debt-collection-saga.service.ts`
  (khuôn saga), `pos/services/cancel-invoice.service.ts:89` (khuôn "resolve trước transaction"),
  `pos/services/checkout-invoice.service.ts` (nguồn parity).
- **Feature liền kề:** `.ai/features/promotion-programs-engine/` — engine đã xong ở G3, epic này
  đóng luôn giả định A-20 của nó (trừ kho hàng quà).
- **Entry point mới:** `POST /v2/pos/checkout`, `GET /v2/pos/checkout/sagas/:id`.
