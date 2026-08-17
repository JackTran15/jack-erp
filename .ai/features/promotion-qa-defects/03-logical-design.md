# Logical design — promotion-qa-defects

## Approach

Mười lỗi QA không phải mười lỗi độc lập. Chúng gom về **bốn nguyên nhân cấu trúc**, và cách sửa
tốt nhất là vá nguyên nhân chứ không vá triệu chứng:

1. **Dữ liệu đã tính nhưng chưa ghi xuống nơi người ta đọc.** Engine KM tính phân bổ chiết khấu
   theo từng dòng, lưu vào blob `invoice_checkout_promotions.line_discounts`, nhưng không ghi
   ngược về `invoice_items`. Mọi consumer đọc theo dòng — hoàn tiền trả hàng, báo cáo — đều thấy
   giá gộp. → lỗi #1, và một phần #10.
2. **Thứ tự sai giữa hai phép tính phụ thuộc nhau.** Trần đổi điểm chốt trên draft, engine KM chạy
   sau, rồi `Math.max(0, …)` nuốt phần chênh trong im lặng. → lỗi #2.
3. **Một luồng có, luồng song song thì thiếu.** Trả hàng hoàn điểm đã dùng, huỷ đơn thì không.
   `pointsBalanceAfter` có chặn theo `customerId`, `pointsEarned` ngay cạnh thì không.
   Nhánh `ready` có guard, nhánh `loading` thì không. → lỗi #3, #4, #5.
4. **Quyết định nằm sai tầng.** Lý do loại CTKM bị lọc mất trong SQL trước khi tới tầng sinh lý do;
   luật validate thiếu ở tầng domain nên dữ liệu hỏng lọt xuống engine rồi nổ 500; báo cáo cộng
   dồn từ năm nguồn chồng chéo thay vì một nguồn có dấu. → lỗi #6, #7, #8, #9, #10.

Nguyên tắc xuyên suốt: **tái dùng thứ đã đúng ở ngay bên cạnh**. Gần như mọi bản sửa đều có sẵn
một bản tham chiếu chạy đúng trong cùng file hoặc file anh em — `computeReverseBase` cho D2,
`DateWindow.contains` cho D5, luật `CARD_TIER` cho D6, `CashLedgerService.signedCase` làm chuẩn
đối chiếu cho D7. Không phát minh công thức mới ở đâu cả.

---

## D1 — Phân bổ khuyến mại xuống từng dòng hoá đơn

Thêm cột **`invoice_items.promotion_discount`** `numeric(18,2) NOT NULL DEFAULT 0`.

- Ghi tại `persist-invoice.step.ts` (cạnh `persistPromotionSnapshot`) từ `ctx.promotion.lineDiscounts`.
  Dữ liệu đã có sẵn trong context — chỉ là chưa từng ghi xuống.
- Backfill trong migration bằng `UPDATE … FROM jsonb_array_elements(line_discounts)`.
  Tính đúng đắn đã kiểm: xem **A-01**.
- **Không đổi `line_total`.** Đây là ràng buộc cứng: QA xác nhận Hàng bán / Hàng trả đang đúng, và
  `sum(line_total) = subtotal` là bất biến nhiều báo cáo đang dựa vào.

`promotion_discount` là cột **cộng thêm, thuần thông tin phân bổ** — không tham gia công thức
`line_total = quantity × unit_price − line_discount` sẵn có.

## D2 — Công thức hoàn tiền trả hàng

Với hoá đơn gốc `O`:

```
netLine(i)      = line_total(i) − promotion_discount(i)
Σ netLine       = O.subtotal − Σ promotion_discount
headerResidual  = O.pointsDiscountAmount + O.depositAmount
                + max(0, O.discountAmount − Σ promotion_discount)   // chiết khấu tay mức đơn
returnedNet     = Σ netLine(i) × q(i)/Q(i)   trên các dòng trả
share           = returnedNet / Σ netLine     (0 nếu Σ netLine = 0)

refund          = returnedNet − headerResidual × share
```

> **A-02 đã bị bác khi implement T-01-03.** Bản đầu có thêm `refund = min(refundBase,
> share × O.totalPaid)`. Nhưng `invoice-debt.service.ts` **không bao giờ** ghi lại
> `invoices.total_paid` — tiền khách trả nợ về sau chỉ nằm ở `debt_payments` — nên HĐ bán chịu
> **đã trả hết nợ** vẫn đọc `totalPaid = 0` và sẽ bị hoàn 0đ. Mệnh đề đã gỡ. Muốn kẹp đúng thì
> phải cộng cả `debt_payments`; việc đó nằm ngoài phạm vi lỗi #1.

Kiểm chứng đại số:

| Ca | Kết quả |
|---|---|
| Dòng 500.000, KM 100.000, trả dòng đó | `netLine = 400.000`, `share = 1`, `headerResidual = 0` → **400.000** (AC-01) |
| Trả toàn bộ | `share = 1` → `subtotal − Σpromo − pointsDisc − deposit − (discountAmount − Σpromo)` = **`amountDue`** (AC-02) |
| HĐ 580.000 trả bằng 1000 điểm | `headerResidual` nuốt phần điểm → chi tiền mặt đúng `amountDue`; điểm hoàn riêng qua `refundRedeemedPoints` (AC-03) |

**Giữ nguyên `returnSubtotal` là giá gộp** để `computeReverseBase` / `computeRedeemedCreditBack`
(tỷ lệ điểm) không đổi hành vi — `returnedNet` là đại lượng mới đặt cạnh, không thay thế.

**Thoái lui an toàn:** không có hoá đơn gốc (trả nhanh) → giữ hành vi cũ; hoá đơn v1 hoặc trước
backfill (`promotion_discount` = 0) → công thức tự thoái về tỷ lệ trên `amountDue`, vẫn đúng hơn
hiện tại (AC-05).

## D3 — Kẹp điểm sau khi engine khuyến mại chạy

Bước saga mới **`clamp-points`**, đặt sau `evaluate-promotion(2)` và trước `compute-totals(5)`:

```
maxPointsUsable = floor((subtotal − manualDiscount − promotionDiscount − deposit) / POINT_REDEMPTION_VALUE_VND)
effectivePoints = min(invoice.pointsRedeemed, maxPointsUsable)
```

`redeem-points.step` chỉ trừ `effectivePoints`; `pointsRedeemed` / `pointsDiscountAmount` lưu theo
số đã kẹp (AC-07). Ví dụ QA: `floor(464.000/500) = 928` điểm → `amountDue = 0`, khách giữ 72 điểm.

`points-redemption.service.ts` (áp điểm trên draft) **giữ nguyên** — nó chỉ ghi nhận ý định; kẹp
thật nằm ở nơi duy nhất biết đủ dữ kiện, là trong transaction checkout sau khi engine đã chạy.

## D4 — Đưa lý do loại CTKM lên đúng tầng

`typeorm-promotion.repository.ts` `findActive` bỏ các bộ lọc `status` / `startDate` / `endDate` /
branch khỏi SQL, để `PromotionResolver` + `eligibility.ts` quyết định. Nhánh `STOPPED` /
`DATE_WINDOW` / `BRANCH_SCOPE` và nhãn tiếng Việt sẵn có ở `promotionPresentation.ts:97-108` đang
là **code chết** — chúng sống lại ngay khi dữ liệu tới được nơi đó.

Giữ biên để không kéo cả lịch sử: chỉ CTKM chưa xoá mềm của tổ chức, cộng biên ngày rộng ±1 năm
quanh `at` (**A-05**).

## D5 — `TimeWindow` nửa khoảng

Theo đúng mẫu `DateWindow.contains` đang xử lý độc lập từng đầu:

```ts
contains(at: TimeOfDay): boolean {
  if (!this.start && !this.end) return true;                  // cả hai trống = cả ngày
  const target = toMinutes(at);
  if (!this.end)   return target >= toMinutes(this.start!);   // 18:00 → hết ngày
  if (!this.start) return target <= toMinutes(this.end);      // đầu ngày → 18:00
  const start = toMinutes(this.start), end = toMinutes(this.end);
  return start <= end ? target >= start && target <= end
                      : target >= start || target <= end;      // qua đêm — giữ nguyên
}
```

Hai field vẫn optional (**A-08**). `time-window.spec.ts` đang khoá hành vi cũ nên **phải sửa cùng
lúc**, dẫn chiếu A-07 để không bị đọc nhầm là sửa test cho qua.

## D6 — Chặn dữ liệu CTKM thiếu ngay lúc lưu

Phòng thủ hai lớp, vì đã có dữ liệu hỏng nằm sẵn trong DB:

- **Chặn đầu vào** — `promotion-program.ts` `validate()` thêm invariant `groups.length > 0` và luật
  `applyTo === BIRTHDAY ⇒ birthdayMatch` bắt buộc, đặt cạnh hai luật `CUSTOMER_GROUP` /
  `CARD_TIER` sẵn có. DTO thêm `@ArrayNotEmpty()` cho `groups` (update kế thừa nên tự có).
- **Chịu được dữ liệu hỏng** — cả 5 strategy guard `groups[0]`, trả *không áp dụng* thay vì ném.
  Đây là điều làm AC-24 đúng với CTKM đã lưu từ trước.

`T-06-01` **bắt buộc tái hiện ca 500 thật trước khi sửa** (**A-06**).

## D7 — Báo cáo cuối ngày

1. **Tiền KM hiện lên** — `get-pos-daily-summary.handler.ts` đọc `invoice_checkout_promotions`
   thay `invoice_promotions`, tách voucher / CTKM theo `type`; đọc thêm `invoices.discount_amount`
   cho dòng tổng khuyến mại. `promoCodeCount` giữ 0 (**A-03**).
2. **Hết trừ hai lần** — xoá vòng `revenue.cash -= refundedAmount`. Vế `expense` đã đếm đủ Phiếu
   chi. Sau khi xoá: 6.497.000 − 3.970.000 = **+2.527.000**, khớp sổ quỹ. Sửa luôn chú thích sai
   ("khoản hoàn không đi qua phiếu chi" — sai sự thật). Áp cùng cách cho drill-down.
3. **Điểm ra khỏi TỔNG** — bỏ `revenue.points` khỏi `revenue.total`; giữ field hiển thị.

Chuẩn đối chiếu là `CashLedgerService`: một nguồn `cash_movements`, gắn dấu theo `type`. Báo cáo
không đổi sang dùng nó (vượt phạm vi), nhưng mọi con số phải khớp nó.

---

## Alternatives rejected

| Option | Why not |
|---|---|
| **Hoàn tiền theo tỷ lệ trên header `amountDue`** (tái dùng thẳng `computeReverseBase`, ~3 dòng, không migration) | Sửa được 100% ca QA đã báo nhưng **sai với giỏ hỗn hợp**: cart A 500k (không KM) + B 500k (KM −200k), trả riêng A thì tỷ lệ cho 400k trong khi khách trả 500k. Akenzy chốt rõ "line đó 500 km 100 trả sản phẩm line đó thì trả khách 400" — tức yêu cầu chính xác theo dòng. |
| **Đẩy chiết khấu KM vào `line_total`** (không cần cột mới) | `subtotal = Σ line_total` là bất biến nhiều báo cáo dựa vào; `discountAmount` header sẽ đếm trùng. Vỡ Hàng bán / Hàng trả mà QA xác nhận đang đúng. Blast radius quá lớn cho một đợt vá lỗi. |
| **Đọc jsonb `line_discounts` trực tiếp lúc trả hàng, không thêm cột** | Không cần migration, nhưng buộc mọi consumer tương lai (báo cáo doanh thu theo mặt hàng) tự parse jsonb; và jsonb không join được rẻ. Cột hoá là chỗ đúng để dữ liệu đã tính được đọc lại. |
| **Bắt lỗi khi điểm vượt số còn phải thu** (ném `PAYMENT_INVALID`) | An toàn về kiểm soát nhưng chặn quầy: thu ngân phải tính nhẩm rồi nhập lại. Akenzy chọn tự hạ số điểm. |
| **Kẹp điểm ở POS thay vì server** | Không sửa được khi gọi API trực tiếp, và POS không biết kết quả engine cho tới khi preview xong. Server là nơi duy nhất biết đủ. |
| **Bắt buộc nhập cả Giờ bắt đầu và Giờ kết thúc** | Mâu thuẫn với chính D5: một khi nửa khoảng đã có nghĩa thì bắt buộc cả hai lại cắt mất cấu hình hợp lệ (**A-08**). |
| **Lọc `status`/ngày trong SQL rồi truy vấn lần hai để lấy CTKM bị loại** | Hai truy vấn, hai nguồn sự thật về "vì sao loại", chắc chắn lệch nhau theo thời gian. Một nguồn ở tầng engine là đúng. |
| **Đổi báo cáo sang đọc thẳng `cash_movements` như `CashLedgerService`** | Là kiến trúc đúng về lâu dài, nhưng đổi ngữ nghĩa cả báo cáo (thu theo hình thức thanh toán vs theo dòng tiền quỹ) — vượt xa phạm vi vá lỗi. Dùng làm chuẩn đối chiếu thay vì thay thế. |
| **Vá `promoCodeCount` bằng cách trỏ sang bảng mới** | Chẩn đoán của QA sai ở điểm này: nó là hằng số, không phải truy vấn. Trỏ bảng không sửa được gì (**A-03**). |

---

## Contracts

**Schema** — một cột cộng thêm, không phá tương thích:

```sql
ALTER TABLE invoice_items
  ADD COLUMN promotion_discount numeric(18,2) NOT NULL DEFAULT 0;
```

**Saga** — thêm một bước, thứ tự mới:
`load-draft(1) → evaluate-promotion(2) → clamp-points(3) → … → compute-totals → … → redeem-points`

**API** — không đổi chữ ký endpoint nào. Thay đổi quan sát được:

| Endpoint | Thay đổi |
|---|---|
| `POST /v2/promotions/evaluate` | Trả **thêm** CTKM bị loại vì `STOPPED` / `DATE_WINDOW` / `BRANCH_SCOPE`, kèm `reason`. Shape không đổi — danh sách dài hơn. |
| `POST /pos/checkout` (v2) | `pointsRedeemed` trả về có thể **nhỏ hơn** số client gửi (đã kẹp). Client phải đọc giá trị trả về, không giả định bằng số đã gửi. |
| `POST /reports/pos/daily-summary` | `revenue.total` và `netCashFlow` đổi giá trị (bỏ điểm, hết trừ hai lần); `revenue.voucher` bắt đầu khác 0. Shape không đổi. |
| `POST /v2/promotions` · `PUT /v2/promotions/:id` | Thêm lỗi validate: `groups` rỗng, `birthdayMatch` thiếu. |

Đổi shape ở `packages/shared-interfaces` → phải chạy lại `pnpm openapi:generate` và commit
`schema.ts` + `openapi.snapshot.json`.

## Error taxonomy

| Tình huống | Mã | HTTP | Ghi chú |
|---|---|---|---|
| CTKM lưu thiếu nhóm hàng hoá | `VALIDATION_FAILED` field `groups` | 400 | Theo đúng cơ chế `validate()` sẵn có |
| CTKM sinh nhật thiếu kiểu khớp | `VALIDATION_FAILED` field `birthdayMatch` | 400 | Mẫu theo `CARD_TIER_ID_REQUIRED` |
| CTKM hỏng đã nằm trong DB | *không lỗi* | 200 | Strategy trả *không áp dụng*; **không** được thành 500 (AC-24) |
| Điểm vượt số còn phải thu | *không lỗi* | 200 | Tự kẹp, trả về số thực dùng (AC-06) |
| Trả hàng của HĐ bán chịu | *không lỗi* | 200 | Hoàn theo giá ròng; thu ngân chọn OFFSET nếu muốn trừ công nợ (AC-04). Không kẹp theo `totalPaid` — **A-02** đã bác |
| Hoá đơn gốc không có dữ liệu phân bổ | *không lỗi* | 200 | Thoái về tỷ lệ trên `amountDue` (AC-05) |

Không thêm mã lỗi mới. Mọi thay đổi hoặc dùng lại mã sẵn có, hoặc chuyển một tình huống **đang
nổ 500** thành xử lý êm.

## Idempotency

Không có endpoint mutation mới. `IdempotencyInterceptor` toàn cục vẫn phủ; consumer vẫn dedupe qua
`processed_events`. Một điểm cần giữ: `loyalty-points-reverse.consumer.ts` dedupe theo
`(invoiceId, type=ADJUST, delta <= 0)` — cố ý theo dấu, nên dòng hoàn điểm **dương** của UOW-03
không đụng khoá của dòng thu hồi điểm tích. Đây là lý do UOW-03 gọi thẳng `refundRedeemedPoints`
trong transaction thay vì phát thêm một event.

---

## ADRs

### ADR-01 — Phân bổ khuyến mại thành cột riêng trên `invoice_items`, không nhét vào `line_total`
**Status:** accepted
**Context:** Engine KM đã tính phân bổ theo dòng và lưu trong jsonb, nhưng không consumer nào theo
dòng đọc được. Đây là gốc rễ lỗi #1 và một phần #10.
**Decision:** Thêm `invoice_items.promotion_discount`, ghi lúc checkout, backfill từ jsonb. Giữ
nguyên `line_total` và bất biến `subtotal = Σ line_total`.
**Consequences:** Cần một migration cộng thêm; các báo cáo hiện có không đổi giá trị. Consumer nào
muốn số ròng theo dòng thì tự trừ — rõ ràng hơn là đổi ngầm ngữ nghĩa `line_total`. Đổi lại,
`invoice_items` giờ có hai cột chiết khấu (`line_discount` thủ công, `promotion_discount` do engine)
và người đọc phải biết phân biệt; comment trên entity phải nói rõ.

### ADR-02 — Kẹp điểm ở tầng saga, không ở tầng áp điểm trên draft
**Status:** accepted
**Context:** Trần điểm chốt trên draft, trước khi engine KM chạy; `Math.max(0, …)` nuốt phần chênh.
**Decision:** Thêm bước `clamp-points` sau `evaluate-promotion`. `points-redemption.service.ts`
giữ nguyên vai trò ghi nhận ý định.
**Consequences:** `pointsRedeemed` trả về có thể nhỏ hơn số client gửi — client phải đọc giá trị
trả về. Đây là **đổi hợp đồng quan sát được**, phải nêu trong ghi chú bàn giao. Bù lại, không còn
đường nào trừ điểm nhiều hơn giá trị thực nhận, kể cả khi gọi API trực tiếp.

### ADR-03 — Lọc điều kiện CTKM ở tầng engine, không ở SQL
**Status:** accepted
**Context:** `findActive` lọc `status` / ngày / branch trong SQL, nên ba nhánh lý do trong
`eligibility.ts` và nhãn tiếng Việt tương ứng là code chết. Thu ngân không có lý do để trả lời khách.
**Decision:** Bỏ ba bộ lọc khỏi SQL, giữ biên rộng (tổ chức + chưa xoá mềm + ±1 năm) để không kéo
cả lịch sử.
**Consequences:** Nạp nhiều bản ghi hơn mỗi lần evaluate — chấp nhận được ở quy mô hàng chục CTKM
(**A-05**), phải theo dõi nếu một tổ chức tích luỹ hàng nghìn. Đổi lại có **một** nguồn sự thật duy
nhất về "vì sao CTKM không áp", và `BRANCH_SCOPE` được sửa kèm dù QA chưa báo.

### ADR-04 — Điểm là khoản giảm giá, không phải tiền vào quỹ
**Status:** accepted
**Context:** `revenue.points` (= `pointsDiscountAmount`) đang được cộng vào `revenue.total` rồi vào
`netCashFlow`, dù không đồng nào vào quỹ và nó đã bị trừ trong `amountDue`.
**Decision:** Giữ dòng "Điểm" như một hình thức tất toán để đối chiếu với MISA, nhưng loại khỏi
TỔNG và `netCashFlow`.
**Consequences:** TỔNG hiển thị không còn bằng tổng số học của các dòng trong mục Thu — UI phải
làm rõ dòng Điểm là thông tin, nếu không người đọc sẽ tưởng báo cáo cộng sai. Đây là cái giá của
việc giữ dòng đó; Akenzy đã cân nhắc và chọn giữ.

### ADR-05 — Sửa lỗi ở cả hai luồng checkout, không chỉ luồng đang bật
**Status:** accepted
**Context:** Lỗi #4 (`pointsEarned` không chặn theo `customerId`) tồn tại giống hệt ở v1
`checkout-invoice.service.ts` và v2 saga. Cờ `VITE_CHECKOUT_V2` quyết định luồng nào chạy.
**Decision:** Vá cả hai.
**Consequences:** Thêm việc và thêm test cho một luồng có thể sắp bỏ. Nhưng một cờ môi trường bị
đảo là đủ để lỗi quay lại nguyên vẹn — và chính cờ này từng gây một đợt debug sai hướng
(xem memory `pos-promotion-apply`). Không đáng để lại một quả mìn hẹn giờ.
