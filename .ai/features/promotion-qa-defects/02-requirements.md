# Requirements — promotion-qa-defects

Mỗi user story ứng với một lỗi QA. `AC-xx` là id ổn định, ticket tham chiếu tới id này và
`06-traceability.md` được sinh ra từ đó.

---

## US-01 — Trả hàng hoàn đúng số khách thực trả *(lỗi QA #1)*

> Là **thu ngân**, khi khách trả hàng của một hoá đơn có khuyến mại hoặc có dùng điểm, tôi cần hệ
> thống chi ra đúng số tiền khách đã thực trả cho phần hàng đó, để quỹ không bị hụt.

**AC-01** — Trả một dòng của hoá đơn có khuyến mại thì hoàn theo giá dòng trừ khuyến mại
```gherkin
Given hoá đơn có một dòng giá 500.000 được CTKM giảm 100.000
When khách trả đúng dòng đó
Then số tiền hoàn là 400.000
And Phiếu chi cùng bản ghi cash_movements WITHDRAWAL đều bằng 400.000
```

**AC-02** — Trả toàn bộ hoá đơn thì hoàn đúng bằng `amountDue`
```gherkin
Given hoá đơn subtotal 1.430.000, khuyến mại 201.000, khách trả 1.229.000
When khách trả toàn bộ hoá đơn
Then số tiền hoàn là 1.229.000, không phải 1.430.000
```

**AC-03** — Hoá đơn thanh toán bằng điểm thì không chi tiền mặt phần điểm đã trả
```gherkin
Given hoá đơn 580.000 được thanh toán hoàn toàn bằng 1000 điểm, khách trả 0đ tiền mặt
When khách trả toàn bộ hoá đơn
Then số tiền mặt chi ra bằng đúng amountDue của hoá đơn gốc (không phải 580.000)
And số điểm đã dùng được hoàn lại vào thẻ qua refundRedeemedPoints
```

**AC-04** — Hoá đơn bán chịu vẫn hoàn theo giá ròng, và thu ngân giữ quyền chọn trừ công nợ
*(sửa lại sau khi **A-02** bị bác — xem `01-assumptions.md`)*

> Bản đầu của AC này yêu cầu kẹp `refund ≤ share × totalPaid`. Khi implement T-01-03 mới phát hiện
> `invoice-debt.service.ts` không ghi lại `invoices.total_paid`: khách trả nợ về sau chỉ được ghi ở
> `debt_payments`, nên HĐ bán chịu **đã trả hết nợ** vẫn đọc `totalPaid = 0` và bị kẹp về 0đ.
> Kẹp như vậy tệ hơn lỗi nó định chặn, nên đã gỡ.

```gherkin
Given hoá đơn bán chịu có khuyến mại
When khách trả hàng và thu ngân chọn hoàn tiền mặt
Then số tiền hoàn vẫn theo đúng công thức giá ròng (D2), không bị kẹp theo totalPaid
When thu ngân chọn "Tính vào công nợ" (OFFSET)
Then khoản đó được trừ vào công nợ của hoá đơn gốc thay vì chi tiền mặt
```

**AC-05** — Hoá đơn không có dữ liệu phân bổ (v1 / trả nhanh không có hoá đơn gốc) không hồi quy
```gherkin
Given hoá đơn không có bản ghi phân bổ khuyến mại theo dòng
When khách trả hàng
Then hệ thống thoái về phân bổ theo tỷ lệ trên amountDue
And không ném lỗi, không hoàn 0đ
```

---

## US-02 — Điểm không bốc hơi khi có khuyến mại *(lỗi QA #2)*

> Là **khách hàng**, tôi chỉ muốn bị trừ đúng số điểm thực sự đổi được thành tiền giảm.

**AC-06** — Số điểm bị kẹp xuống mức vừa đủ sau khi engine KM chạy
```gherkin
Given giỏ 580.000 và CTKM giảm 116.000, còn phải thu 464.000
When khách bấm đổi 1000 điểm (trị giá 500.000)
Then chỉ 928 điểm bị trừ (464.000đ)
And 72 điểm còn lại vẫn nằm trên thẻ
And amountDue bằng 0
```

**AC-07** — `pointsRedeemed` và `pointsDiscountAmount` lưu theo số đã kẹp
```gherkin
Given một checkout bị kẹp điểm như AC-06
When hoá đơn được lưu
Then invoices.points_redeemed = 928 và points_discount_amount = 464.000
And point_history chỉ có một dòng REDEEM delta = -928
```

**AC-08** — POS không hiện "còn phải thu" âm
```gherkin
Given giỏ hàng mà giá trị điểm vượt số còn phải thu
When màn hình thanh toán tính lại
Then "Còn phải thu" hiển thị 0, không phải số âm
And số điểm thực dùng hiển thị đúng bằng số sẽ bị trừ
```

---

## US-03 — Huỷ hoá đơn trả lại điểm đã dùng *(lỗi QA #3)*

> Là **khách hàng**, khi hoá đơn của tôi bị huỷ, tôi phải nhận lại số điểm đã dùng cho nó.

**AC-09** — Huỷ hoàn lại toàn bộ điểm đã đổi
```gherkin
Given hoá đơn đã đổi 100 điểm và tích 138 điểm
When hoá đơn bị huỷ
Then 138 điểm tích bị thu hồi
And 100 điểm đã đổi được hoàn lại vào thẻ
And số dư thẻ trở về đúng giá trị trước khi bán
```

**AC-10** — `points_balance_after` được tính lại khi huỷ
```gherkin
Given hoá đơn bị huỷ có points_balance_after = 4303 từ lúc bán
When hoá đơn bị huỷ
Then points_balance_after phản ánh số dư thẻ thật sau khi huỷ, không giữ số cũ
```

---

## US-04 — Không ghi/in điểm cho khách vãng lai *(lỗi QA #4)*

> Là **thu ngân**, tôi không muốn đưa cho khách vãng lai một biên lai ghi điểm mà không thẻ nào có.

**AC-11** — Hoá đơn không có khách thì không tích điểm
```gherkin
Given một hoá đơn được bán mà không chọn khách hàng
When hoá đơn được lưu
Then invoices.points_earned = 0
And không có dòng point_history nào được tạo
```

**AC-12** — Biên lai khách vãng lai không có dòng điểm
```gherkin
Given hoá đơn không có khách hàng
When in biên lai
Then không hiển thị dòng "Điểm được tích"
```

**AC-13** — Áp dụng cho cả hai luồng checkout
```gherkin
Given cờ VITE_CHECKOUT_V2 bật hoặc tắt
When bán một hoá đơn không có khách hàng
Then cả hai luồng đều cho points_earned = 0
```

---

## US-05 — Dòng "Khuyến mại" chỉ hiện khi có giảm giá thật *(lỗi QA #5)*

**AC-14** — Giỏ rỗng không hiện dòng khuyến mại
```gherkin
Given giỏ hàng rỗng, tổng tiền 0
When màn hình thanh toán hiển thị
Then không có dòng "Khuyến mại", kể cả ô xám đang tải
```

---

## US-06 — CTKM không áp phải nói rõ lý do *(lỗi QA #6)*

> Là **thu ngân**, khi khách hỏi "sao chương trình này không chạy", tôi cần đọc được lý do trên
> màn hình.

**AC-15** — CTKM ngừng theo dõi vẫn hiện kèm lý do
```gherkin
Given một CTKM ở trạng thái Ngừng theo dõi
When mở dialog "Chương trình khuyến mãi"
Then CTKM đó vẫn xuất hiện trong danh sách
And hiển thị lý do "Đã ngừng theo dõi"
```

**AC-16** — CTKM ngoài khoảng ngày vẫn hiện kèm lý do
```gherkin
Given một CTKM có khoảng ngày không chứa hôm nay
When mở dialog "Chương trình khuyến mãi"
Then CTKM đó vẫn xuất hiện với lý do "Ngoài thời gian áp dụng"
```

**AC-17** — CTKM ngoài phạm vi chi nhánh vẫn hiện kèm lý do
```gherkin
Given một CTKM không áp dụng cho chi nhánh đang bán
When mở dialog "Chương trình khuyến mãi"
Then CTKM đó vẫn xuất hiện với lý do phạm vi chi nhánh
```

**AC-18** — Bốn lý do đang chạy đúng không được hồi quy
```gherkin
Given các CTKM bị loại vì sai thứ, sai giờ, không đủ điều kiện, hoặc không được chọn
When mở dialog "Chương trình khuyến mãi"
Then các lý do đó vẫn hiển thị đúng như trước
```

---

## US-07 — Giờ áp dụng hiểu đúng khi chỉ nhập một đầu *(lỗi QA #7)*

**AC-19** — Chỉ nhập giờ bắt đầu nghĩa là từ giờ đó đến hết ngày
```gherkin
Given CTKM đặt Giờ bắt đầu 18:00 và bỏ trống Giờ kết thúc
When bán lúc 09:00
Then CTKM không được áp dụng
When bán lúc 19:00
Then CTKM được áp dụng
```

**AC-20** — Chỉ nhập giờ kết thúc nghĩa là từ đầu ngày đến giờ đó
```gherkin
Given CTKM bỏ trống Giờ bắt đầu và đặt Giờ kết thúc 12:00
When bán lúc 09:00
Then CTKM được áp dụng
When bán lúc 14:00
Then CTKM không được áp dụng
```

**AC-21** — Ca qua đêm giữ nguyên hành vi đang đúng
```gherkin
Given CTKM đặt 22:00–02:00
When bán lúc 23:00 hoặc lúc 01:00
Then CTKM được áp dụng
When bán lúc 12:00
Then CTKM không được áp dụng
```

**AC-22** — Bỏ trống cả hai vẫn là cả ngày
```gherkin
Given CTKM không nhập giờ nào
When bán vào bất kỳ giờ nào
Then CTKM được áp dụng
```

---

## US-08 — CTKM thiếu dữ liệu bị chặn ngay lúc lưu *(lỗi QA #8, #9)*

> Là **quản lý**, tôi cần hệ thống chặn CTKM hỏng lúc lưu, thay vì để nó làm chết quầy sau đó.

**AC-23** — CTKM không có nhóm hàng hoá bị từ chối lúc lưu
```gherkin
Given một CTKM "Giảm giá hoá đơn" không có nhóm/dòng hàng hoá nào
When lưu CTKM
Then hệ thống trả lỗi validate chỉ đúng field thiếu
And CTKM không được lưu
```

**AC-24** — Dữ liệu hỏng đã tồn tại không làm chết việc tính tiền
```gherkin
Given một CTKM hỏng đã nằm sẵn trong cơ sở dữ liệu
When POS tính tiền cho bất kỳ giỏ hàng nào
Then không có lỗi 500
And CTKM đó đơn giản là không được áp dụng
```

**AC-25** — CTKM sinh nhật bắt buộc chọn kiểu khớp
```gherkin
Given một CTKM có "Áp dụng cho" = Khách hàng có sinh nhật
When lưu mà chưa chọn kiểu khớp (đúng ngày / cùng tuần / cùng tháng / khoảng)
Then hệ thống báo lỗi ở đúng field kiểu khớp
And CTKM không được lưu
```

**AC-26** — Hai luật validate sẵn có không hồi quy
```gherkin
Given CTKM áp dụng cho Nhóm khách hàng hoặc Hạng thẻ
When lưu mà thiếu giá trị tương ứng
Then vẫn báo lỗi đúng như trước
```

---

## US-09 — Báo cáo cuối ngày khớp quỹ và thấy được tiền khuyến mại *(lỗi QA #10)*

> Là **chủ cửa hàng**, tôi cần Báo cáo theo ngày khớp với Sổ quỹ tiền mặt, và thấy được đã giảm
> giá bao nhiêu.

**AC-27** — Tiền khuyến mại hiện lên báo cáo
```gherkin
Given ngày bán có 719.000đ tiền khuyến mại từ luồng checkout v2
When xem Báo cáo theo ngày
Then tiền khuyến mại hiển thị 719.000, không phải 0
```

**AC-28** — Tiền hoàn chỉ bị trừ một lần
```gherkin
Given ngày 13/08 có thu tiền mặt 6.497.000 và chi 3.970.000 theo Sổ quỹ
When xem Báo cáo theo ngày
Then Thu tiền mặt hiển thị 6.497.000
And Chi tiền mặt hiển thị 3.970.000
And TỔNG hiển thị +2.527.000, không phải −943.000
```

**AC-29** — Điểm không được tính vào TỔNG
```gherkin
Given ngày bán có 500.000đ giá trị điểm khách đã dùng
When xem Báo cáo theo ngày
Then dòng "Điểm" vẫn hiển thị 500.000 như một hình thức tất toán
And giá trị đó không được cộng vào TỔNG hay netCashFlow
```

**AC-30** — Drill-down khớp với số tổng
```gherkin
Given báo cáo đã sửa
When mở chi tiết "Thu tiền mặt" và "Chi tiền mặt"
Then tổng các dòng chi tiết khớp với con số ở màn hình tổng hợp
And không có khoản hoàn nào xuất hiện ở cả hai phía
```

**AC-31** — Các số đang đúng không hồi quy
```gherkin
Given QA xác nhận Hàng bán, Hàng trả, số lượng hoá đơn và Sổ quỹ tiền mặt đang đúng
When báo cáo được tính lại sau khi sửa
Then các con số đó giữ nguyên
```
