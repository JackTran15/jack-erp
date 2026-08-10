---
feature: pos-promotion-apply
stories: 9
acceptance_criteria: 32
---

# Requirements — Áp dụng khuyến mại & voucher tại POS

Mốc số trong các AC lấy từ 4 hóa đơn bán thật trên hệ tham chiếu MISA eShop ngày 06/08/2026
(`2608050001`–`2608050004`) để có thể đối chiếu tay, không phải số bịa.

---

## US-01 — Thu ngân thấy trước tiền giảm khi giỏ hàng đổi

Là thu ngân, tôi muốn thấy CTKM nào đang áp và giảm bao nhiêu **ngay khi thêm hàng vào giỏ**,
để báo giá cho khách trước khi bấm Thu tiền.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Preview chạy khi giỏ hàng đổi
```gherkin
Given tôi đang ở màn Bán hàng với giỏ hàng rỗng
When tôi thêm SKU AKSK27096-BO-39 giá 1.495.000 đang có CTKM "GIÀY NAM ONSALE 30%"
Then trong vòng 500ms panel phải hiện tiền giảm 448.500
And tổng còn phải thu hiện 1.046.500
```

**AC-02** — Gộp lời gọi khi gõ nhanh
```gherkin
Given tôi quét liên tiếp 5 mã hàng trong 1 giây
When các lần quét kết thúc
Then chỉ có tối đa 2 lời gọi POST /v2/promotions/evaluate được phát đi
And kết quả hiển thị ứng với trạng thái giỏ hàng cuối cùng, không phải lần quét giữa chừng
```

**AC-03** — Preview lỗi không chặn bán hàng
```gherkin
Given lời gọi evaluate trả 500 hoặc timeout
When tôi xem panel thanh toán
Then tôi thấy chỉ báo "chưa tính được khuyến mại" thay cho số tiền giảm
And nút Thu tiền vẫn bấm được, vì server sẽ tự tính lại lúc checkout
```

**AC-04** — Giỏ rỗng không gọi
```gherkin
Given giỏ hàng không có dòng nào
When màn Bán hàng render
Then không có lời gọi evaluate nào được phát đi
```

---

## US-02 — Thu ngân biết vì sao một CTKM không chạy

Là thu ngân, khi khách nhắc "shop đang có chương trình giảm 50% mà", tôi muốn đọc được lý do
chương trình đó không áp, để trả lời khách ngay tại quầy.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-05** — Hiện danh sách CTKM bị bỏ qua kèm lý do
```gherkin
Given evaluate trả skippedPrograms chứa {name: "GIÀY NAM ONSALE 50%", reason: "CONDITION_NOT_MET"}
When tôi mở dialog Chương trình khuyến mãi
Then tôi thấy dòng "GIÀY NAM ONSALE 50%" với trạng thái tiếng Việt "Chưa đủ điều kiện"
```

**AC-06** — Lý do tranh chấp chỉ rõ chương trình nào thắng
```gherkin
Given skippedPrograms chứa {reason: "RESOURCE_TAKEN", takenBy: <id của "GIÀY NAM ONSALE 30%">}
When tôi mở dialog Chương trình khuyến mãi
Then dòng đó hiển thị "Đã bị chương trình GIÀY NAM ONSALE 30% giành mất"
```

**AC-07** — Mọi reason đều có nhãn tiếng Việt
```gherkin
Given một reason bất kỳ trong union SkippedProgramReason
When nhãn được tra cứu
Then luôn có chuỗi tiếng Việt tương ứng, không bao giờ lộ mã enum tiếng Anh ra UI
```

---

## US-03 — Thu ngân chọn CTKM tùy chọn

Là thu ngân, khi có nhiều CTKM `auto_apply=false` cùng đủ điều kiện, tôi muốn chọn chương
trình áp cho hóa đơn này.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-08** — Dialog hiện CTKM thật, không còn mảng rỗng
```gherkin
Given evaluate trả availablePrograms có 2 chương trình auto_apply=false
When tôi mở dialog Chương trình khuyến mãi
Then tôi thấy đúng 2 dòng đó kèm số tiền giảm ước tính
And không còn trạng thái rỗng cứng như trước
```

**AC-09** — Chọn CTKM làm tổng tiền đổi ngay
```gherkin
Given dialog đang hiện 2 CTKM tùy chọn
When tôi tick một chương trình và bấm Đồng ý
Then preview chạy lại với selectedProgramIds chứa id đó
And tổng còn phải thu cập nhật theo kết quả server trả về
```

**AC-10** — Lựa chọn đi tới server lúc checkout
```gherkin
Given tôi đã chọn CTKM có id P1
When tôi bấm Thu tiền
Then request POST /v2/pos/checkout chứa selectedProgramIds: ["P1"]
```

---

## US-04 — Thu ngân đổi CTKM thắng khi hai chương trình tranh một dòng

Là thu ngân, khi hai CTKM cùng trỏ một mặt hàng và hệ thống tự chọn theo `priority`, tôi muốn
đổi sang chương trình còn lại nếu khách có lý do chính đáng.

**Priority:** should
**Depends on:** US-02

### Acceptance criteria

**AC-11** — Chọn chương trình đang thua sẽ hoán đổi
```gherkin
Given CTKM A (priority 10, giảm 30%) đang thắng CTKM B (priority 20, giảm 50%) trên cùng một dòng
When tôi tick CTKM B trong dialog và xác nhận
Then CTKM B trở thành chương trình áp cho dòng đó
And CTKM A chuyển sang skippedPrograms với reason RESOURCE_TAKEN, takenBy = id của B
```

**AC-12** — Có xác nhận trước khi hoán đổi
```gherkin
Given tôi tick một CTKM đang tranh chấp với chương trình đã áp
When tôi bấm Đồng ý
Then tôi thấy hộp xác nhận nêu tên cả hai chương trình
And chỉ khi tôi xác nhận thì việc hoán đổi mới xảy ra
```

**AC-13** — Server tôn trọng lựa chọn đè priority
```gherkin
Given selectedProgramIds chứa id của một chương trình thua về priority
When PromotionResolver chạy
Then chương trình được chọn thắng tài nguyên đó, bất kể priority
```

---

## US-05 — Thu ngân chọn quà tặng

Là thu ngân, với CTKM tặng quà kiểu ONE_OF, tôi muốn cho khách chọn món quà thay vì để hệ
thống lấy bừa món đầu danh sách.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-14** — Mở dialog chọn quà
```gherkin
Given evaluate trả một appliedProgram có gifts với mode ONE_OF và 3 ứng viên
When tôi mở dialog Chương trình khuyến mãi và xác nhận chương trình đó
Then tôi thấy dialog chọn quà liệt kê đúng 3 ứng viên kèm số lượng thiết lập
```

**AC-15** — Quà đã chọn đi tới server
```gherkin
Given tôi chọn quà có itemId G2
When tôi bấm Thu tiền
Then request checkout chứa lựa chọn quà G2 cho chương trình tương ứng
```

**AC-16** — Hóa đơn ghi đúng quà đã chọn
```gherkin
Given tôi đã chọn quà G2 chứ không phải ứng viên đầu G1
When hóa đơn được chốt
Then dòng quà trên hóa đơn là G2 với thành tiền 0
```

**AC-17** — Không chọn quà thì chặn checkout
```gherkin
Given có CTKM ONE_OF đang áp mà tôi chưa chọn quà
When tôi bấm Thu tiền
Then tôi bị chặn kèm thông báo yêu cầu chọn quà, request không được gửi
```

---

## US-06 — Thu ngân áp voucher thật

Là thu ngân, tôi muốn nhập mã voucher và thấy tiền trừ ngay, thay vì chip trang trí không tác dụng.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-18** — Tra mã hiện mệnh giá
```gherkin
Given voucher "VC001" thuộc chương trình mệnh giá 100.000 còn hiệu lực
When tôi gõ mã vào VoucherDialog và bấm tìm
Then tôi thấy tên chương trình và mệnh giá 100.000
```

**AC-19** — Mã sai hoặc hết hạn báo ngay
```gherkin
Given mã không tồn tại, đã dùng, hoặc ngoài khoảng ngày hiệu lực
When tôi tra mã
Then tôi thấy thông báo tiếng Việt nêu đúng lý do
And không có gì được ghi vào draft
```

**AC-20** — Voucher trừ vào tổng phải thu
```gherkin
Given giỏ hàng còn phải thu 1.046.500 và tôi áp voucher mệnh giá 100.000
When panel thanh toán cập nhật
Then còn phải thu hiện 946.500
```

**AC-21** — Mã voucher đi tới server lúc checkout
```gherkin
Given tôi đã áp voucher "VC001"
When tôi bấm Thu tiền
Then request POST /v2/pos/checkout chứa voucherCode: "VC001"
And voucher được đánh dấu đã tiêu với redeemed_invoice_id trỏ về hóa đơn này
```

**AC-22** — Thu ngân gọi được lookup bằng quyền của chính mình
```gherkin
Given tôi đăng nhập bằng tài khoản role STAFF
When POS gọi GET /v2/vouchers/lookup và POST /v2/promotions/evaluate
Then cả hai trả 200, không phải 403
```

---

## US-07 — Quản lý kiểm soát được giảm giá tay

Là quản lý cửa hàng, tôi muốn mọi khoản giảm giá ngoài CTKM đều phải có lý do ghi lại,
để không ai giảm giá ẩn danh.

**Priority:** should
**Depends on:** US-01

### Acceptance criteria

**AC-23** — Giảm giá tay bắt buộc lý do
```gherkin
Given tôi mở form giảm giá tay mức hóa đơn và nhập 10%
When tôi bấm Đồng ý mà bỏ trống ô lý do
Then tôi bị chặn tại chỗ và server không nhận được request nào
```

**AC-24** — Phạm vi "chỉ hàng chưa có KM" tính đúng cơ sở
```gherkin
Given hóa đơn có dòng A 1.850.000 chưa có KM và dòng B 540.000 đã giảm còn 432.000
When tôi áp giảm giá tay 10% với phạm vi "Chỉ hàng hóa chưa áp dụng khuyến mãi"
Then số tiền giảm là 185.000, bằng 10% của 1.850.000
And không phải 228.200, tức 10% của tổng 2.282.000
```

---

## US-08 — Thu ngân thấy rõ và điều chỉnh dòng khuyến mại trên tổng tiền

> Thêm 10/08/2026 sau phiên review bug QA trên `feat/promotions` — dòng "Khuyến mại" ở panel
> thanh toán render bất kể số tiền, không có %, không xoá được.

Là thu ngân, tôi muốn dòng "Khuyến mại" trên panel thanh toán chỉ hiện khi có giảm giá thật,
hiện đúng % nếu CTKM tính theo phần trăm, và cho tôi bỏ chọn khi cần.

**Priority:** should
**Depends on:** US-01, US-03

### Acceptance criteria

**AC-25** — Ẩn dòng khi không có giảm giá
```gherkin
Given preview trả promotionDiscount = 0
When tôi xem panel thanh toán
Then dòng "Khuyến mại" không hiển thị
```

**AC-26** — Hiện % khi CTKM tính theo phần trăm
```gherkin
Given đúng 1 chương trình INVOICE_DISCOUNT đang áp với discountMode=PERCENT, discountValue=30
When tôi xem panel thanh toán
Then dòng hiện "Khuyến mại (30%)"
```

**AC-27** — Không hiện % khi nhiều CTKM cùng áp
```gherkin
Given 2 chương trình đang áp cùng lúc (1 INVOICE_DISCOUNT PERCENT + 1 ITEM_DISCOUNT)
When tôi xem panel thanh toán
Then dòng hiện "Khuyến mại" không kèm %, vì một con số % lẻ không mô tả đúng tổng đã cộng dồn
```

**AC-28** — Bỏ chọn CTKM tùy chọn từ dòng tổng tiền
```gherkin
Given tôi đã tick 1 CTKM tùy chọn ở dialog, dòng Khuyến mại đang hiện kèm nút X
When tôi bấm nút X
Then selectedProgramIds về rỗng, preview chạy lại, tổng tiền quay về giá trị trước khi chọn
```

---

## US-09 — Hóa đơn in hiện chi tiết khuyến mại theo hóa đơn và theo mặt hàng

> Thêm 10/08/2026, cùng phiên review với US-08.

Là thu ngân/khách hàng, tôi muốn hóa đơn in ra cho thấy khuyến mại được tính thế nào, tách theo
hóa đơn hay theo mặt hàng, để đối chiếu — cả lúc vừa thanh toán lẫn khi in lại.

**Priority:** should
**Depends on:** US-01, US-02

### Acceptance criteria

**AC-29** — Hóa đơn vừa thanh toán hiện đúng breakdown
```gherkin
Given khi thanh toán có 1 CTKM INVOICE_DISCOUNT giảm 100.000 và 1 CTKM ITEM_DISCOUNT giảm 50.000
When hóa đơn được in ngay sau khi Thu tiền
Then thấy dòng "Khuyến mãi -150.000", "KM theo hoá đơn -100.000", "KM theo mặt hàng -50.000"
```

**AC-30** — Giảm giá tay không gộp vào KM theo mặt hàng
```gherkin
Given thu ngân đã giảm giá tay 1 dòng hàng, đồng thời có 1 CTKM ITEM_DISCOUNT khác dòng
When hóa đơn in ra
Then giảm giá tay hiện ở dòng "Giảm giá" riêng, không cộng vào số "KM theo mặt hàng"
```

**AC-31** — In lại hóa đơn cũ hiện breakdown giống hệt lúc thanh toán
```gherkin
Given hóa đơn đã chốt với breakdown như AC-29
When tôi in lại từ Danh sách hóa đơn hoặc Lịch sử mua hàng
Then breakdown hiện giống hệt số đã in lúc thanh toán
```

**AC-32** — Không có khuyến mại thì không hiện khối KM
```gherkin
Given hóa đơn không có CTKM nào áp
When hóa đơn được in (mới hoặc in lại)
Then không có dòng "Khuyến mãi" / "KM theo hoá đơn" / "KM theo mặt hàng" nào xuất hiện
```

---

## Non-functional

| Kind        | Requirement                                                                                                 | Verified by |
| ----------- | ----------------------------------------------------------------------------------------------------------- | ----------- |
| Performance | Preview trả kết quả < 500ms p95 trên giỏ 20 dòng; debounce ≥ 300ms để gộp lời gọi                            | T-01-04     |
| Chịu lỗi    | Preview chết không bao giờ chặn được nút Thu tiền — server vẫn là nơi chốt số                                | T-01-05     |
| Tương thích | Mọi trường mới trên `CheckoutV2Dto`/`EvaluateCartDto` là optional; client cũ gửi body cũ vẫn chạy đúng      | T-02-04     |
| Chính xác   | Số hiển thị lúc preview bằng đúng số saga ghi khi commit, lệch 0₫                                            | T-06-05     |
| Bảo mật     | `lookup` chỉ trả voucher thuộc `actor.organizationId`; không lộ voucher tổ chức khác kể cả khi đoán đúng mã | T-03-03     |
| Ngôn ngữ    | Không mã enum tiếng Anh nào lọt ra UI POS                                                                    | T-02-01     |
