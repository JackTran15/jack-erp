---
feature: quick-exchange-single-invoice
adr_count: 4
---

# Logical design — Gộp hoá đơn đổi trả nhanh thành một chứng từ

## Approach

Cho `POST /invoices/exchanges` nhận thêm dạng **quick exchange**: khi request **không**
mang `originalInvoiceId`, service bỏ qua kiểm eligibility và lấy `costPrice` của các dòng
trả từ `ItemCostSnapshotService.snapshotCosts` — đúng nhánh QUICK mà
`CreateReturnInvoiceService` đã dùng từ trước. Mọi thứ còn lại (dựng invoice `type=EXCHANGE`,
gán `direction` IN/OUT, resolve kho showroom) giữ nguyên.

Phía POS, bỏ hẳn nhánh hai-chứng-từ của `QUICK_EXCHANGE` trong `finalizeCheckoutAndPrint`
và cho cả hai variant chạy chung nhánh một-chứng-từ vốn đang phục vụ `INVOICE_RETURN`:
`POST /invoices/exchanges` (khi có hàng mua thêm) hoặc `POST /invoices/returns` `mode:"quick"`
(khi chỉ trả), rồi một `POST /invoices/:id/checkout-return`.

Không có bước nào ở phía chốt chứng từ phải sửa: `CheckoutReturnService` đã tính
`netAmount`/`refundedAmount` từ `direction` và đã null-safe với `originalInvoice` ở cả bốn
chỗ có liên quan (kiểm `returned_quantity`, `computeReverseBase`, `computeRedeemedCreditBack`,
hạ cấp OFFSET→CASH).

## Alternatives rejected

| Option | Why not |
|---|---|
| Endpoint mới `POST /invoices/quick-exchanges` | Trùng ~95% `create-exchange-invoice.service.ts`; thêm route, DTO, spec, module wiring cho đúng một nhánh `if`. Hai endpoint cùng nghiệp vụ là nguồn lệch tiếp theo. |
| Thêm field `mode: quick \| regular` vào `CreateExchangeInvoiceDto` (đối xứng với return DTO) | Thừa: sự có mặt của `originalInvoiceId` đã đủ làm discriminator, và một field bắt buộc mới là breaking cho client cũ dưới `forbidNonWhitelisted: true`. Return DTO cần `mode` chỉ vì nó có mặt trước khi `originalInvoiceId` được thêm. |
| Giữ hai chứng từ, chỉ thêm cột liên kết `paired_invoice_id` | Không đáp ứng yêu cầu ("gộp lại thành 1 hoá đơn"), vẫn không atomic, và thêm một khái niệm mới vào schema. |
| Bọc hai call hiện tại trong một transaction phía BE (endpoint "combo") | Vẫn ra hai chứng từ; chỉ vá triệu chứng (a) mà không vá (b) tiền gross-in/gross-out lẫn (c) kế toán không lần được cặp. |
| Đưa đổi trả nhanh vào checkout saga v2 | Saga v2 chưa có trên `main` và `checkout-saga/00-intent.md` cố ý đặt đơn trả/đổi ra ngoài phạm vi cho một epic riêng. Akenzy chốt bỏ qua v2. |

## Domain model

Không thêm entity, không thêm cột, không migration. Các trường đã tồn tại và đã đúng
ngữ nghĩa:

| Trường | Nguồn | Ý nghĩa ở quick exchange |
|---|---|---|
| `invoices.type` | có sẵn | `EXCHANGE` |
| `invoices.original_invoice_id` | có sẵn, `nullable`, comment *"null for quick-return"* | `null` |
| `invoices.net_amount` | có sẵn | `newSubtotal − returnSubtotal` |
| `invoices.refunded_amount` | có sẵn | `max(returnSubtotal − newSubtotal, 0)` |
| `invoice_items.direction` | có sẵn | `IN` cho hàng trả, `OUT` cho hàng mua thêm |
| `invoice_items.original_invoice_item_id` | có sẵn, `nullable` | `null` ở mọi dòng |
| `invoice_items.cost_price` | có sẵn | dòng IN lấy từ `ItemCostSnapshotService`; dòng OUT lấy `purchasePrice` catalog (đã vậy) |

## Contracts

### `POST /invoices/exchanges` — thay đổi duy nhất

`originalInvoiceId` chuyển từ bắt buộc sang tuỳ chọn:

```ts
// create-exchange-invoice.dto.ts
@IsOptional()
@IsUUID()
originalInvoiceId?: string;
```

Luật suy ra trong service:

| `originalInvoiceId` | Chế độ | `returnLines[].originalInvoiceItemId` | Eligibility | `costPrice` dòng IN |
|---|---|---|---|---|
| có | regular (hôm nay) | bắt buộc | `assertLineEligible` mỗi dòng | snapshot của dòng bán gốc |
| vắng | quick (mới) | **phải vắng** | bỏ qua | `ItemCostSnapshotService.snapshotCosts` |

Ràng buộc không đổi: `returnLines.length ≥ 1` **và** `newLines.length ≥ 1`.

### `POST /invoices/:id/checkout-return` — không đổi

Không sửa DTO, không sửa service. Ma trận hoàn tiền hiện có đã phủ cả ba dấu của net.

### FE — hình dạng request sau thay đổi

```
# đổi trả nhanh CÓ mua thêm  (trước: 4 call / 2 chứng từ)
POST /invoices/exchanges          { sessionId, reason, customerId?, returnLines[], newLines[] }   # không originalInvoiceId
POST /invoices/{id}/checkout-return { refundMethod, payments?, refundAccountId?, note }

# đổi trả nhanh CHỈ trả  (không đổi)
POST /invoices/returns            { mode:"quick", ... }
POST /invoices/{id}/checkout-return { ... }
```

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| `returnCart` / `purchaseCart` | `usePosCheckoutSessionStore` (tab) | Tới khi `resetActiveSessionAfterCheckout` |
| `originalInvoiceId` | cùng store, chỉ được set bởi `enterInvoiceReturnWithLines` | Tab |
| `checkoutVariant` | cùng store | Tab; chỉ còn quyết định **cách gom giỏ**, không còn quyết định **số chứng từ** |
| `paymentLines`, `debt`, `refundToDebt` | slice `payment` của tab | Tab |
| Draft EXCHANGE (`isDraft=true`) | DB | Từ `POST /invoices/exchanges` tới `checkout-return`; nếu người dùng bỏ giữa chừng thì thành draft mồ côi — **giống hệt luồng đổi trả theo hoá đơn hôm nay**, không xử lý thêm |

## Error taxonomy

| Điều kiện | Nơi phát hiện | Phản hồi |
|---|---|---|
| Quick + `returnLine` mang `originalInvoiceItemId` | `CreateExchangeInvoiceService` | 400 — dữ liệu tự mâu thuẫn, không đoán ý |
| Regular + thiếu `originalInvoiceItemId` | `CreateExchangeInvoiceService` (đã có) | 400 |
| `returnLines` hoặc `newLines` rỗng | `CreateExchangeInvoiceService` (đã có) | 400. FE không bao giờ chạm tới: rỗng `newLines` thì nó gọi `/invoices/returns` |
| Dòng trả thiếu `locationId` | FE, trước khi gửi (đã có) | Toast `RETURN_LINE_MISSING_LOCATION` |
| net > 0 và `Σ payments < net` và không có customer | `CheckoutReturnService.validateRefundMatrix` (đã có) | 400. Sau AC-11, FE khoá nút trước nên đây là lưới an toàn |
| net < 0, refundMethod `BANK`, thiếu `refundAccountId` | `validateRefundMatrix` (đã có) | 400 |
| net ≤ 0 mà có `payments` | `validateRefundMatrix` (đã có) | 400 |
| `OFFSET` lọt lên từ đơn không có hoá đơn gốc | `CheckoutReturnService` (đã có) | Tự hạ cấp về `CASH`, log warn. AC-10 khiến FE không bao giờ gửi. |
| Chốt chứng từ hỏng sau khi draft đã tạo | — | Draft mồ côi, không có hệ quả nghiệp vụ nào (chưa trừ kho, chưa đụng quỹ). Đây chính là điểm hơn hẳn hôm nay: hỏng ở bước 2 không còn để lại đơn bán đã thu tiền. |

## Cache & offline

Không có. POS yêu cầu kết nối để chốt chứng từ; giỏ hàng nằm ở Zustand có persist
localStorage như trước, không đổi hình dạng.

Một điểm cần chú ý khi triển khai: state cũ trong localStorage có thể còn cờ `debt: true`
từ trước khi AC-10 ẩn checkbox. Ticket T-02-02 phải ép `false` ở tầng gửi request, không
chỉ ẩn UI.

## Observability

Không thêm log mới. Hai dòng log sẵn có đủ để phân biệt hai chế độ:

- `CreateExchangeInvoiceService`: `Created draft EXCHANGE invoice ${id} returnSubtotal=… newSubtotal=… net=…` — bổ sung `originalInvoiceId` vào chuỗi này để đọc log biết ngay quick hay regular.
- `CheckoutReturnService`: `Checked out ${type} invoice ${id} code=${code} method=… refunded=… net=…` — không đổi.

Sự kiện `RETURN_POSTED` đã mang `type: 'EXCHANGE'`, nên consumer hạ nguồn không phân biệt
được quick hay regular — đúng ý: với chúng, hai thứ này là một.

## ADRs

### ADR-01 — `originalInvoiceId` vắng mặt là discriminator của quick exchange

**Context:** Cần một cách phân biệt "đổi có hoá đơn gốc" và "đổi nhanh" trong cùng endpoint.
`CreateReturnInvoiceDto` dùng field `mode` tường minh, nên đối xứng là lựa chọn hiển nhiên.

**Decision:** Không thêm `mode`. Suy ra chế độ từ sự có mặt của `originalInvoiceId`.

**Consequences:** DTO cũ vẫn hợp lệ nguyên vẹn, nới lỏng validation là backward-compatible.
Đổi lại, hai DTO anh em không còn đối xứng — người đọc `create-return-invoice.dto.ts` rồi
sang `create-exchange-invoice.dto.ts` sẽ thấy khác. Bù bằng doc comment trên field.
Nếu sau này cần chế độ thứ ba thì phải quay lại thêm `mode` thật.

**Status:** accepted

### ADR-02 — Không thêm `DocumentType.EXCHANGE`

**Context:** Sau khi gộp, phần "mua thêm" không còn mã `INV-…`; toàn bộ chứng từ lấy số từ
bộ đếm `RETURN` (`RTN-…`). Có thể tách một bộ đếm riêng cho đơn đổi.

**Decision:** Giữ `DocumentType.RETURN` cho cả `RETURN` lẫn `EXCHANGE`, y như hôm nay.

**Consequences:** Không migration, không đụng seed đánh số, đổi trả nhanh và đổi trả theo
hoá đơn hoàn toàn đồng nhất. Đổi lại: không lọc được đơn đổi theo prefix mã, và số thứ tự
trong dải `RTN` trộn hai loại. Chấp nhận được vì `invoices.type` đã phân biệt, và
`/invoices` có thể thêm cột/bộ lọc theo type sau (DTO và handler đã hỗ trợ sẵn).

**Status:** accepted — Akenzy chốt 2026-08-14

### ADR-03 — Đổi trả nhanh không cấn công nợ

**Context:** Đổi trả theo hoá đơn cho phép thu một phần rồi ghi phần chênh vào công nợ
(net > 0), và cấn khoản hoàn vào công nợ hoá đơn gốc (net < 0, `OFFSET`). Không có hoá đơn
gốc thì vế thứ hai vô nghĩa, còn vế thứ nhất là quyết định nghiệp vụ.

**Decision:** Với luồng đổi trả không có `originalInvoiceId`: ẩn cả `DebtCheckRow` lẫn
`RefundToDebtRow`, và ép `putOnDebt`/`offsetToDebt` thành `false` ở tầng dựng request.

**Consequences:** Net > 0 phải thu đủ tiền mới chốt được — đúng hành vi hôm nay của đổi trả
nhanh, nên không ai phải học lại. `RefundMethod.OFFSET` không bao giờ được gửi từ luồng này;
fallback OFFSET→CASH của BE trở thành lưới an toàn thay vì đường đi thường xuyên.
Ẩn ở hai chỗ (UI và tầng request) là cố ý: chỉ ẩn UI thì state cũ trong localStorage vẫn lọt.

**Status:** accepted — Akenzy chốt 2026-08-14

### ADR-04 — Không sửa `CheckoutReturnService`

**Context:** Cám dỗ lớn nhất khi đọc service 936 dòng này là "dọn dẹp luôn thể" — nó có
nhiều nhánh chỉ chạy cho đơn có hoá đơn gốc.

**Decision:** Không sửa một dòng nào của `checkout-return.service.ts` trong epic này. Chỉ
thêm test case chứng minh nó đã đúng với `originalInvoice === null`.

**Consequences:** Rủi ro hồi quy với luồng đổi trả theo hoá đơn về gần bằng 0 — đó là luồng
đang chạy production và không có e2e phủ. Đổi lại, epic không cải thiện gì về khả năng đọc
của file đó. Chấp nhận: refactor nó là việc riêng, và saga v2 nhiều khả năng sẽ viết lại nó.

**Status:** accepted
