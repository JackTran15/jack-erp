# Code Review — ERP-007 / post-invoice

Branch: `ERP-007/post-invoice`
Reviewed against working tree on 2026-05-11.

Mỗi issue được kiểm tra trực tiếp trên code hiện tại. Một số mục nghi ngờ trong báo cáo gốc đã không còn áp dụng vì service đã được refactor sang luồng Kafka publisher + DLQ.

## Tổng hợp mức độ rủi ro

| #   | File                                               | Issue                                                       | Mức                         | Trạng thái                                                             |
| --- | -------------------------------------------------- | ----------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| 1   | `migrations/1778700000000-*`                       | Trùng timestamp giữa hai migration                          | Trung bình                  | **CONFIRMED**                                                          |
| 2   | `pos/services/cancel-invoice.service.ts:60-71`     | Không cho phép hủy `PARTIAL_DEBT`; `wasDebt` không bao quát | Cao (lỗi nghiệp vụ)         | **CONFIRMED**                                                          |
| 3   | `pos/services/checkout-invoice.service.ts`         | `issuedAt: null as any`                                     | —                           | **NOT FOUND** (đã refactor)                                            |
| 4   | `pos/services/cancel-invoice.service.ts:114-139`   | `catch` chỉ log với stock & journal reversal                | Cao (lệch sổ kế toán & kho) | **CONFIRMED** (di chuyển sang `cancel-invoice`, không phải `checkout`) |
| 5   | `pos/services/checkout-invoice.service.ts:191-200` | Award điểm chỉ warn                                         | —                           | **NOT FOUND** (đã chuyển sang Kafka + idempotent consumer)             |
| 6   | `promotion/promotion-apply.service.ts:208-234`     | `revertPromotions` cập nhật trực tiếp tên bảng + `as any`   | Trung bình                  | **CONFIRMED**                                                          |

---

## 1. Migration trùng timestamp — CONFIRMED

`apps/api/src/database/migrations/`:
- `1778700000000-AddCompanyFieldsToCustomer.ts` — thêm `company_name`, `tax_code` vào `customers`.
- `1778700000000-AddCostPriceAndDefaultPriceToInvoiceItems.ts` — thêm `unit_price_default`, `cost_price` vào `invoice_items`.

**Phân tích:** Hai migration đụng vào bảng độc lập (`customers` ↔ `invoice_items`) nên không có ràng buộc FK/cột phụ thuộc. Tuy nhiên TypeORM sắp xếp migration theo timestamp; với hai bản ghi trùng, thứ tự còn lại phụ thuộc thứ tự đọc thư mục của Node — non-deterministic giữa các máy. Không gây vỡ lúc này, nhưng là bom hẹn giờ cho refactor sau.

**Đề xuất:**
- Đổi timestamp một trong hai (vd. `AddCostPriceAndDefaultPriceToInvoiceItems` → `1778700000001`).
- Đổi tên class theo timestamp mới để TypeORM coi là chưa chạy với DB cũ — nếu môi trường nào đã chạy, cần `migration:revert` rồi chạy lại với tên/timestamp mới. Trên môi trường dev seed lại được; trên prod chưa chạy thì sửa trước khi merge.

---

## 2. Cancel không bao quát `PARTIAL_DEBT` — CONFIRMED

`apps/api/src/modules/pos/services/cancel-invoice.service.ts:60-71`:

```ts
if (
  invoice.status !== InvoiceStatus.PAID &&
  invoice.status !== InvoiceStatus.DEBT
) {
  throw new BadRequestException(`Only paid or debt invoices can be cancelled...`);
}
const items = await this.itemRepo.find({ where: { invoiceId: id } });
const wasDebt = invoice.status === InvoiceStatus.DEBT;
```

`InvoiceStatus` (`pos/entities/invoice.entity.ts:4-11`) có giá trị: `DRAFT | PENDING | PAID | DEBT | PARTIAL_DEBT | CANCELLED`. Checkout (`checkout-invoice.service.ts:124-129`) sinh ra `PARTIAL_DEBT` khi `totalPaid > 0 && remainder > 0`, kèm `InvoiceDebtEntity` (`checkout-invoice.service.ts:170-172`).

**Lỗi rõ:**
1. Hóa đơn `PARTIAL_DEBT` không hủy được dù về nghiệp vụ cần được phép hủy như `DEBT`.
2. `wasDebt = status === DEBT` ⇒ với `PARTIAL_DEBT` sẽ không đóng bản ghi `InvoiceDebtEntity` (block `if (wasDebt)` ở dòng 82-89). Nếu mở rộng điều kiện hủy ở (1) mà không sửa (2) → vẫn còn dòng nợ treo sau khi hủy.

**Đề xuất sửa:**
```ts
const cancellableStatuses = new Set([
  InvoiceStatus.PAID,
  InvoiceStatus.DEBT,
  InvoiceStatus.PARTIAL_DEBT,
]);
if (!cancellableStatuses.has(invoice.status)) {
  throw new BadRequestException(`Only paid/debt/partial-debt invoices can be cancelled. Current: ${invoice.status}`);
}
const hasOutstandingDebt =
  invoice.status === InvoiceStatus.DEBT ||
  invoice.status === InvoiceStatus.PARTIAL_DEBT;
```

Và đổi `if (wasDebt)` → `if (hasOutstandingDebt)`. Đồng thời cần kiểm tra logic refund: với `PARTIAL_DEBT` khách đã thanh toán một phần — cần xác nhận với team xem hủy có sinh nghiệp vụ hoàn tiền/cash movement không (hiện code không xử lý refund).

---

## 3. `issuedAt: null as any` — NOT FOUND

`grep "null as any" apps/api/src/modules/pos/services/checkout-invoice.service.ts` ⇒ 0 match.

Code hiện tại (`checkout-invoice.service.ts:143`): `invoice.issuedAt = now;` — gán `Date`, không phải `null`. Entity (`invoice.entity.ts:29-30`) đã khai báo `issuedAt?: Date` nullable. Draft tạo qua `InvoiceService.create` không set `issuedAt` (để `undefined`) — type-safe.

Cảnh báo từ báo cáo gốc có vẻ tham chiếu phiên bản cũ trước khi `checkout-invoice.service.ts` được tách khỏi `checkout.service.ts`. **Không cần action.**

---

## 4. `catch` chỉ log — CONFIRMED (ở `cancel-invoice.service.ts`)

Trong `checkout-invoice.service.ts` hiện không còn try/catch journal trực tiếp — journal posting đã được dời sang Kafka publisher (`JournalSalePublisher.publish`, line 202-217) với DLQ (`event-consumer.service.ts:124-158` ghi vào `dead_letter_events`). Đây là refactor đúng hướng.

Tuy nhiên **`cancel-invoice.service.ts` vẫn còn 2 chỗ catch-and-log đáng lo:**

- **Line 100-118 (stock return):** Nếu `stockLedgerService.recordBatchMovements` lỗi → chỉ log `CRITICAL`. Hóa đơn đã chuyển `CANCELLED` (transaction line 76-95) nhưng kho không được trả lại ⇒ lệch tồn.
- **Line 122-139 (journal reversal):** Tương tự, nếu reverse lỗi → chỉ log. Sổ kế toán treo bút toán bán hàng cho hóa đơn đã hủy ⇒ lệch sổ.

**Đề xuất:**
1. Đổi sang publisher pattern giống checkout: publish `INVOICE_CANCELLED` event và để các consumer (stock-return, journal-reverse) xử lý async với DLQ + retry. Sẽ thống nhất với hướng kiến trúc đã chọn cho luồng checkout.
2. Trong khi chưa refactor: ít nhất ghi một dòng vào `dead_letter_events` (hoặc bảng `cancellation_followup_required` mới) với `invoiceId` + lỗi để vận hành biết cần đối soát thủ công. Không dựa duy nhất vào log.
3. Cân nhắc cờ `invoice.stock_returned` / `invoice.journal_reversed` (boolean) để job đối soát quét lại các hóa đơn `CANCELLED` chưa hoàn tất hậu xử lý.

Lưu ý thứ tự: hiện tại stock-return chạy trước journal-reverse và đều nằm sau commit transaction huỷ. Nếu chuyển sang publisher, cần partition key + idempotency theo `invoiceId` để retry an toàn.

---

## 5. Award điểm khi thất bại chỉ warn — NOT FOUND (đã giải quyết bằng kiến trúc mới)

`checkout-invoice.service.ts:191-200` gọi `loyaltyPointsPublisher.publish(...)` — đẩy event lên Kafka, không try/catch warn nội tuyến.

Tính idempotency đã có trong consumer (`customer/consumers/loyalty-points.consumer.ts:26-35`):
```ts
const existing = await this.historyRepo.findOne({ where: { invoiceId, organizationId } });
if (existing) { ... return; }
```

→ Retry an toàn theo `invoiceId`. Nếu consumer fail nhiều lần, message sẽ vào DLQ và xuất hiện trong bảng `dead_letter_events` (xem `event-consumer.service.ts:147-156`).

**Còn thiếu:**
- Metric/alert cho `dead_letter_events` theo `eventType = LOYALTY_POINTS_AWARD_REQUESTED`. Nếu không có dashboard/alert thì khách vẫn có thể không được cộng điểm mà không ai biết. Nên thêm:
  - Endpoint hiện có `dead-letter.controller.ts` — đủ cho ops query thủ công.
  - Nhưng cần health/metric exporter (Prometheus counter `dead_letter_events_total{event_type}`) hoặc job định kỳ cảnh báo nếu count > threshold.

→ **Action ops/monitoring**, không phải lỗi code.

---

## 6. `revertPromotions` cập nhật trực tiếp tên bảng — CONFIRMED

`apps/api/src/modules/promotion/promotion-apply.service.ts:208-234`:

```ts
await manager
  .createQueryBuilder()
  .update('vouchers')
  .set({ is_used: false, redeemed_invoice_id: null } as any)
  ...
await manager
  .createQueryBuilder()
  .update('discount_codes')
  .set({ used_count: () => 'GREATEST(used_count - 1, 0)' } as any)
  ...
```

**Vấn đề:**
- Hard-code tên bảng (`'vouchers'`, `'discount_codes'`) + tên cột snake_case (`is_used`, `redeemed_invoice_id`, `used_count`) — không bám entity. Nếu đổi `@Entity('vouchers')` hoặc rename cột qua migration mà quên file này → silent broken (test pass nếu test mock manager, prod hủy hóa đơn sẽ throw SQL error).
- `as any` né type-check, làm IDE/CI không phát hiện được lệch.
- Đây là nhánh **revert** (ít chạy), nên dễ lọt qua kiểm thử thường ngày.

**Đề xuất sửa:**
- Đối xứng với `commitPromotions` (line 191-202): đã dùng `discountCodeService.incrementUsedCount` và `voucherService.markUsed`. Thêm hai method tương ứng và gọi qua service:

```ts
// VoucherService
async unmarkUsed(voucherId: string, invoiceId: string, manager: EntityManager): Promise<void> {
  await manager.getRepository(VoucherEntity).update(
    { id: voucherId, redeemedInvoiceId: invoiceId },
    { isUsed: false, redeemedInvoiceId: null },
  );
}

// DiscountCodeService
async decrementUsedCount(codeId: string, manager: EntityManager): Promise<void> {
  await manager
    .createQueryBuilder()
    .update(DiscountCodeEntity)
    .set({ usedCount: () => 'GREATEST(used_count - 1, 0)' })
    .where('id = :id', { id: codeId })
    .execute();
}
```

Lúc đó `revertPromotions` chỉ delegate và TypeORM tự dịch tên cột — refactor entity sẽ kéo theo lỗi compile thay vì lỗi runtime.

- Thêm unit test cho `cancelInvoiceService.cancel` với một invoice có cả discount_code + voucher để bảo vệ nhánh revert.

---

## Action items (đề xuất sắp xếp ưu tiên)

1. **[HIGH]** Sửa điều kiện hủy hóa đơn để bao quát `PARTIAL_DEBT` (issue #2). Có unit test cho cả 3 trạng thái hủy được + hủy với debt còn dư.
2. **[HIGH]** Xử lý hậu cancel: ít nhất ghi `dead_letter_events` khi stock return / journal reverse lỗi; trung hạn refactor sang publisher pattern giống checkout (issue #4).
3. **[MED]** Refactor `revertPromotions` sang gọi service tương ứng để bám entity (issue #6). Bổ sung test.
4. **[MED]** Đổi timestamp một trong hai migration `1778700000000` (issue #1). Sửa trước khi merge.
5. **[LOW / Ops]** Thêm metric / alert cho `dead_letter_events` (issue #5), đặc biệt theo `eventType`.
6. **[INFO]** Issues #3 và phần checkout của #4, #5 không còn áp dụng — báo cáo gốc dựa trên code trước khi refactor.
