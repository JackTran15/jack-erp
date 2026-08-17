---
feature: return-points-net-basis
slug: return-points-net-basis
owner: Akenzy
created: 2026-08-14
status: draft
---

# Intent — Điểm trả hàng tính trên đúng số tiền khách đã trả

## Problem

Trên cùng một phiếu trả hàng, **tiền và điểm đứng trên hai cơ sở khác nhau**.

`promotion-qa-defects/UOW-01` đã đưa số tiền hoàn về giá ròng: hoàn đúng phần khách thực
trả cho món hàng, sau khuyến mại. Nhưng điểm thì không đi theo. `checkout-return.service.ts`
giữ nguyên `returnSubtotal` **gộp** làm cơ sở prorate điểm, và ghi hẳn lý do vào docblock
tại dòng 507-513:

> `returnSubtotal` stays GROSS on purpose — computeReverseBase and
> computeRedeemedCreditBack prorate loyalty points against the original's gross subtotal,
> and changing that base would silently change how many points a return gives back.

Đó là một quyết định đúng vào lúc viết, và trở thành sai đúng vào lúc tiền đổi cơ sở.
Hai hàm còn đứng trên cơ sở gộp:

- `computeReverseBase` (:632) — điểm **bị trừ** khi khách trả hàng
- `computeRedeemedCreditBack` (:651) — điểm **hoàn lại** cho khách từ phần đã tiêu trên đơn gốc

Lỗi **không** biểu hiện ở mọi hoá đơn có khuyến mại, và đây là chỗ dễ kết luận nhầm. Khi
khuyến mại giảm **đều tay** trên mọi dòng thì tỷ lệ gộp bằng tỷ lệ ròng, kết quả trùng nhau.
Khi trả **toàn bộ** hoá đơn thì tỷ lệ bằng 1, cũng trùng. Lỗi chỉ hiện ra khi **trả một phần
của hoá đơn có khuyến mại không đều tay giữa các dòng** — đúng tình huống quầy gặp nhất:
một món đang có chương trình, những món khác thì không.

Hệ quả: mỗi lần khách trả một món có khuyến mại, thẻ của họ bị trừ nhiều điểm hơn số điểm
món đó từng mang lại. Không ai giải thích được con số, và nó tích luỹ qua từng lần trả.

## Affected personas

| Persona | Hành vi hiện tại | Hành vi mong muốn |
|---|---|---|
| Khách hàng | Trả một món có khuyến mại thì mất nhiều điểm hơn số điểm món đó đã tích. Số dư thẻ trôi dần theo mỗi lần trả | Trả hàng chỉ mất đúng số điểm đã tích trên phần tiền thực trả cho món đó |
| Thu ngân | Không giải thích được vì sao "Điểm trừ" trên phiếu trả lệch so với hoá đơn gốc | Con số trên phiếu trả cộng lại khớp với hoá đơn gốc, giải thích được cho khách |
| Kế toán / CSKH | Khiếu nại điểm phải tra tay `point_history` để đối chiếu | Bất biến kiểm được bằng máy: trả hết bằng nhiều lần trả từng phần thì tổng điểm trừ đúng bằng điểm đã tích |

## Success signal

Bất biến sau đây đúng và được test khoá lại:

> Trả hết một hoá đơn bằng **nhiều phiếu trả từng phần** thì **tổng** điểm bị trừ đúng bằng
> `points_earned` của hoá đơn gốc — không dư, không thiếu.

Trên hoá đơn tái hiện (dựng ở `Out of scope` bên dưới không có, xem `02-requirements.md`):
hai dòng, một dòng khuyến mại một dòng không, `points_earned = 997`. Trả riêng từng dòng
hiện cho `48 + 948 = 996`; sau khi sửa phải cho `46 + 951 = 997`.

## Out of scope

- **#4 Đặt cọc không tới được server** — chủ sở hữu hoãn ngày 2026-08-14 ("tạm thời không
  làm chức năng này"). Đã khảo sát: `invoices.deposit_amount` tồn tại và mọi công thức đều
  trừ nó, nhưng `invoice.service.ts:167` đóng cứng `0` và không DTO nào của POS khai báo
  trường này. Ghi lại ở `docs/` chứ không lập kế hoạch ở đây.
- **#6 Voucher POS không gửi lên checkout** — chủ sở hữu hoãn cùng ngày. Vốn đã có kế hoạch
  riêng chưa làm: `pos-promotion-apply/UOW-03-voucher-redeems`, ticket T-03-01..06 còn
  `todo`. Không lập lại kế hoạch.
- **Sửa lại điểm đã trừ sai của các phiếu trả cũ** — dữ liệu đã post là bất biến, cùng tiền
  lệ `A-04` của `promotion-qa-defects`. Chỉ đúng từ nay về sau (A-02).
- **Đổi tỷ giá tích điểm** (`POINT_EARN_VND_PER_POINT`, `POINT_REDEMPTION_VALUE_VND`) — chỉ
  đổi *cơ sở tiền*, không đụng tỷ giá.
- **Cơ sở tích điểm lúc bán** (`floor(amountDue / 10.000)`) — đang đúng, không đụng. Feature
  này chỉ kéo đường *trả* về khớp với đường *bán*.
- **`returnSubtotal` cho mục đích tiền** — đã đúng từ `promotion-qa-defects/UOW-01`, giữ nguyên.

## Constraints

| Kind | Detail |
|---|---|
| Bất biến | Giao dịch đã post là bất biến — không sửa lại phiếu trả cũ |
| Tương thích | Hoá đơn v1 (mọi `promotion_discount = 0`) phải giữ **nguyên** hành vi hiện tại — cơ sở ròng thoái về đúng cơ sở gộp khi không có khuyến mại |
| Tương thích | Trả nhanh (QUICK, không có hoá đơn gốc) không có gì để prorate — phải giữ nhánh thoái lui hiện có, không được chia cho 0 |
| Nhất quán | `invoices.points_reversed` (ảnh chụp để in phiếu) và sự kiện đảo điểm gửi đi phải dùng **chung một** cơ sở — hiện đã dùng chung `computeReverseBase`, không được tách ra |
| Idempotency | Consumer đảo điểm dedupe qua `processed_events`, `eventId` tất định — không đụng |
| Ngôn ngữ | Source backend tiếng Anh (docblock, log, lỗi); chỉ chuỗi UI mới tiếng Việt |

## Existing surface touched

**Sửa — một file duy nhất ở tầng logic:**
- `apps/api/src/modules/pos/services/checkout-return.service.ts`
  - `computeReverseBase` (:632) — cơ sở điểm bị trừ
  - `computeRedeemedCreditBack` (:651) — cơ sở điểm hoàn lại
  - docblock :507-513 — nhận định "stays GROSS on purpose" nay đã sai, phải viết lại

**Đọc, không sửa:**
- `computeTotals` / `computeReturnedNet` (:536, :572) — đã tính `returnedNet` đúng, feature
  này chỉ *dùng* nó thay vì `returnSubtotal`
- `customer/loyalty.constants.ts` — tỷ giá, giữ nguyên
- `LoyaltyPointsReversePublisher`, `MembershipCardService.refundRedeemedPoints` — chỉ nhận số

**Test:**
- `apps/api/src/modules/pos/services/checkout-return.service.spec.ts` — bộ test hiện có khoá
  hành vi cũ ở một số case (ví dụ :1247 khẳng định proration trên `returnSubtotal`); phải
  đọc và cập nhật đúng chỗ, không sửa bừa cho xanh

**Feature kề bên:**
- `promotion-qa-defects` — UOW-01 đổi cơ sở tiền và sinh ra chính lệch này; UOW-02 (kẹp điểm)
  chạm cùng vùng khái niệm nhưng ở đường bán, không đụng nhau
- `cancel-invoice-refund` — `cancel-invoice.service.ts:96` đặt `pointsReversed = pointsEarned`
  khi huỷ đơn (đường khác, không prorate), giữ nguyên
