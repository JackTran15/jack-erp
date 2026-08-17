---
id: UOW-03
slug: cancel-refund-points
title: Huỷ hoá đơn trả lại điểm khách đã dùng
demoable: true
duration: 1d
depends_on: []
requirements: [US-03]
verifies: [AC-09, AC-10]
risk: medium
status: todo
rollback: revert code; các dòng `point_history` đã hoàn là bút toán điểm hợp lệ, không cần dọn
---

# UOW-03 — Huỷ đơn hoàn lại điểm đã đổi

Huỷ hoá đơn thu hồi điểm **tích** nhưng không trả lại điểm **đã dùng**. Khách đổi 100 điểm, tích
138: huỷ đơn thì mất 138 (đúng) và cũng mất luôn 100 (sai) — mất trắng 100 điểm.

Luồng trả hàng làm đúng việc này rồi. `checkout-return.service.ts:436-450` gọi
`membershipCardService.refundRedeemedPoints(...)`. `cancel-invoice.service.ts` thì thậm chí không
inject `MembershipCardService` vào constructor. Đây là ca kinh điển "một luồng có, luồng song song
thì thiếu" — bản vá là chép đúng cách làm đã được kiểm chứng, không phát minh gì mới.

Huỷ đơn là trả toàn bộ nên tỷ lệ bằng 1: số điểm hoàn lại chính là `invoice.pointsRedeemed`, không
cần công thức phân bổ.

## Demo script

1. Bán một hoá đơn cho khách có thẻ: đổi 100 điểm, tích 138 điểm. Ghi lại số dư thẻ **trước** khi bán.
2. Huỷ hoá đơn đó.
3. 138 điểm tích bị thu hồi **và** 100 điểm đã đổi được hoàn lại → số dư thẻ trở về **đúng** giá trị
   trước khi bán (AC-09).
4. `point_history` có cả dòng thu hồi điểm tích lẫn dòng hoàn điểm đã đổi, không dòng nào đè dòng nào.
5. `invoices.points_balance_after` phản ánh số dư thẻ thật sau khi huỷ, không giữ số cũ từ lúc bán
   (AC-10).
6. Ca đối chứng: huỷ hoá đơn **không** đổi điểm → chỉ thu hồi điểm tích, không sinh dòng hoàn thừa.
7. Ca đối chứng: huỷ hoá đơn khách vãng lai → không đụng thẻ nào, không lỗi.

## In scope

- Inject `MembershipCardService` và gọi `refundRedeemedPoints` trong transaction huỷ.
- Tính lại `pointsBalanceAfter` khi huỷ.

## Not in scope

- Đổi cơ chế thu hồi điểm tích (`loyaltyPointsReversePublisher`) — đang đúng, giữ nguyên.
- Hoàn tiền khi huỷ đơn — đã có, không thuộc lỗi này.
- Huỷ một phần: không tồn tại; huỷ luôn là toàn bộ.

## Definition of done

- [ ] AC-09, AC-10 pass
- [ ] Số dư thẻ sau khi huỷ bằng đúng số dư trước khi bán, kiểm bằng số trên thẻ thật
- [ ] Hoá đơn không đổi điểm và hoá đơn khách vãng lai không hồi quy
- [ ] Hoàn điểm nằm cùng transaction với việc đặt trạng thái CANCELLED — không có đường nào huỷ được đơn mà quên trả điểm
- [ ] Demoed và accepted at gate G4
