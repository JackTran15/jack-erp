---
feature: ctkm-item-discount-invoice-scope
stories: 3
acceptance_criteria: 23
---

# Requirements — CTKM: Giảm giá hàng hóa + phạm vi giảm giá hóa đơn

Đây là **toàn bộ kịch bản kiểm thử** bạn yêu cầu viết ra trước khi chạy test. Mọi
con số dưới đây bám theo bộ fixture có sẵn `apps/api/test/e2e/setup/promotion-seed.ts`
(`SKU-685` = 685.000, `SKU-100` = 100.000, `SKU-200` = 200.000, `SKU-300` = 300.000,
cây nhóm hàng hai cấp cha → con), nên không cần dựng dữ liệu mới cho phần lớn case.

Ký hiệu: **[DB]** = case phải đọc lại từ bảng bằng `SELECT` chứ không chỉ tin
response HTTP.

---

## US-01 — Tạo được chương trình "Giảm giá hàng hóa"

Là nhân viên vận hành, tôi muốn tạo CTKM giảm giá theo mặt hàng ngay trên màn hình
CTKM, để không phải nhờ ai sửa thẳng vào cơ sở dữ liệu.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Menu *Thêm mới* mở lại đúng một hình thức
```gherkin
Given tôi đang ở màn hình /promotions/programs
When tôi bấm nút "Thêm mới"
Then menu con hiện đúng 2 mục: "Giảm giá hóa đơn" và "Giảm giá hàng hóa"
And không hiện "Giảm giá theo mức", "Tặng hàng hóa", "Mua m tặng n"
```

**AC-02** — Chọn hình thức mở đúng variant form
```gherkin
Given menu "Thêm mới" đang mở
When tôi chọn "Giảm giá hàng hóa"
Then form mở với tham số ?type=PRODUCT_DISCOUNT
And hiện section "Hàng hóa được giảm giá" kèm lưới chọn hàng
And không hiện section "Phạm vi áp dụng" (chỉ thuộc về giảm giá hóa đơn)
```

**AC-03** — Lưu CTKM giảm theo phần trăm **[DB]**
```gherkin
Given tôi điền tên, thời gian hiệu lực và chọn SKU-685 giảm 10%
When tôi bấm Lưu
Then API trả 201 kèm một mã "KM…" sinh tự động
And promotion_programs có đúng 1 dòng với type = 'ITEM_DISCOUNT'
And promotion_lines có 1 dòng role = 'REWARD', target_id = SKU-685,
    discount_mode = 'PERCENT', discount_value = 10
```

**AC-04** — Lưu CTKM giảm theo số tiền **[DB]**
```gherkin
Given tôi chọn SKU-685 và giảm 50.000đ
When tôi bấm Lưu
Then promotion_lines.discount_mode = 'AMOUNT' và discount_value = 50000
```

**AC-05** — Lưu CTKM đồng giá **[DB]**
```gherkin
Given tôi chọn SKU-685 và đặt đồng giá 500.000đ
When tôi bấm Lưu
Then promotion_lines.discount_mode = 'FIXED_PRICE' và discount_value = 500000
And khi đánh giá giỏ, SKU-685 còn đúng 500.000đ (giảm 185.000đ)
```

**AC-06** — Chọn nhóm hàng cha chạm tới hàng ở nhóm con
```gherkin
Given CTKM giảm giá hàng hóa đặt trên nhóm hàng CHA
And SKU-685 nằm ở nhóm CON của nhóm đó
When tôi đánh giá giỏ chứa SKU-685
Then CTKM được áp cho SKU-685
And một mặt hàng ở nhóm khác (SKU-OTHER) không được áp
```

**AC-07** — Round-trip: mở lại đúng như lúc lưu
```gherkin
Given tôi vừa lưu một CTKM giảm giá hàng hóa
When tôi mở lại bản ghi đó để sửa
Then mọi trường hiện đúng giá trị đã lưu: tên, thời gian, lưới hàng hóa,
     hình thức giảm và giá trị giảm
And danh sách hàng hóa không bị nhân đôi dòng
```

**AC-08** — Không đổi được hình thức khi sửa
```gherkin
Given một CTKM đã lưu với type = 'ITEM_DISCOUNT'
When tôi gửi yêu cầu cập nhật kèm type = 'INVOICE_DISCOUNT'
Then API từ chối với lỗi 400
And type trong DB không đổi
```

---

## US-02 — Giảm giá hóa đơn không cộng dồn lên hàng đã được giảm

Là kế toán, tôi muốn phần giảm trên tổng hóa đơn chỉ tính trên những mặt hàng chưa
được giảm, để hóa đơn khớp chính sách và không giảm hai lần trên cùng một mặt hàng.

**Priority:** must
**Depends on:** US-01 (không có CTKM hàng hóa thì không có dòng nào bị chiếm để mà kiểm chứng)

### Acceptance criteria

**AC-09** — CTKM hàng hóa tạo từ UI thực sự chạy ở POS
```gherkin
Given một CTKM giảm giá hàng hóa vừa được tạo qua API như AC-03
When POS đánh giá giỏ chứa SKU-685 số lượng 1
Then appliedPrograms chứa chương trình đó với discountAmount = 68.500
And lineDiscounts[0].unitPriceAfter = 616.500
```

**AC-10** — Cốt lõi BR-002: hóa đơn chỉ tính trên phần chưa giảm
```gherkin
Given CTKM-A giảm giá hàng hóa 10% trên SKU-685
And CTKM-B giảm giá hóa đơn 10%, tạo mới (nên invoice_scope = 'NON_PROMO_ONLY')
And giỏ gồm SKU-685 (685.000) và SKU-100 (100.000), tạm tính 785.000
When POS đánh giá giỏ
Then CTKM-A giảm 68.500 trên dòng SKU-685
And CTKM-B giảm 10.000 — chỉ 10% của 100.000, KHÔNG phải 78.500 của 785.000
And tổng giảm = 78.500 và còn phải trả = 706.500
```

**AC-11** — Mọi dòng đều đã bị chiếm thì hóa đơn không áp
```gherkin
Given CTKM-A giảm giá hàng hóa chạm TẤT CẢ các dòng trong giỏ
And CTKM-B giảm giá hóa đơn 10% tạo mới
When POS đánh giá giỏ
Then CTKM-B không nằm trong appliedPrograms
And CTKM-B nằm trong skippedPrograms với lý do 'CONDITION_NOT_MET'
And tổng giảm đúng bằng phần của CTKM-A
```

**AC-12** — Không có CTKM hàng hóa thì hóa đơn tính trên toàn bộ
```gherkin
Given chỉ có CTKM-B giảm giá hóa đơn 10%, tạo mới
And giỏ gồm SKU-685 và SKU-100, tạm tính 785.000
When POS đánh giá giỏ
Then CTKM-B giảm đúng 78.500
```

**AC-13** — Dòng giảm giá tay bị loại khỏi cơ sở tính (A-02)
```gherkin
Given không có CTKM giảm giá hàng hóa nào
And CTKM-B giảm giá hóa đơn 10%, tạo mới
And giỏ gồm SKU-685 được thu ngân giảm tay 85.000 và SKU-100 không giảm tay
When POS đánh giá giỏ
Then CTKM-B giảm 10.000 — chỉ trên SKU-100
And KHÔNG giảm 70.000 trên cơ sở 700.000 như hành vi hiện tại
```

**AC-14** — Dòng vừa bị chiếm vừa giảm tay chỉ loại một lần (A-05)
```gherkin
Given SKU-685 vừa bị CTKM hàng hóa chiếm vừa được giảm tay 85.000
And SKU-100 không bị chiếm và không giảm tay
And CTKM-B giảm giá hóa đơn 10%, tạo mới
When POS đánh giá giỏ
Then cơ sở tính của CTKM-B đúng bằng 100.000
And CTKM-B giảm 10.000
And SKU-100 không bị bỏ sót khỏi cơ sở tính
```

**AC-15** — Thêm mới không đụng radio thì ghi NON_PROMO_ONLY **[DB]**
```gherkin
Given tôi thêm mới một CTKM giảm giá hóa đơn và KHÔNG chạm vào radio "Phạm vi áp dụng"
When tôi bấm Lưu
Then promotion_programs.invoice_scope = 'NON_PROMO_ONLY'

Given tôi thêm mới một CTKM giảm giá hóa đơn và CHỌN "Tất cả hàng hóa trong hóa đơn"
When tôi bấm Lưu
Then promotion_programs.invoice_scope = 'ALL_ITEMS'
And lựa chọn của người dùng được tôn trọng, không bị đường ghi ghi đè
```

**AC-16** — CTKM cũ ALL_ITEMS giữ nguyên hành vi (A-03) **[DB]**
```gherkin
Given một CTKM giảm giá hóa đơn đã tồn tại với invoice_scope = 'ALL_ITEMS'
And CTKM-A giảm giá hàng hóa chiếm dòng SKU-685
And giỏ gồm SKU-685 và SKU-100
When POS đánh giá giỏ
Then CTKM cũ vẫn tính trên toàn bộ 785.000 như trước
```

**AC-17** — Sửa CTKM cũ không âm thầm đổi phạm vi (A-08, ADR-03) **[DB]**
```gherkin
Given một CTKM giảm giá hóa đơn đã lưu với invoice_scope = 'ALL_ITEMS'
When tôi mở ra, radio hiển thị đúng "Tất cả hàng hóa trong hóa đơn"
And tôi chỉ đổi tên chương trình rồi bấm Lưu
Then promotion_programs.invoice_scope vẫn là 'ALL_ITEMS'
And mặc định của form thêm-mới KHÔNG đè lên giá trị đang lưu

Given cũng CTKM đó
When tôi chủ động chọn "Chỉ hàng hóa chưa áp dụng khuyến mại" rồi Lưu
Then promotion_programs.invoice_scope đổi thành 'NON_PROMO_ONLY'
```

**AC-18** — Hóa đơn thật sau checkout mang đúng số tiền **[DB]**
```gherkin
Given CTKM-A giảm giá hàng hóa 10% trên SKU-685 và CTKM-B giảm giá hóa đơn 10% tạo mới
And một đơn nháp gồm SKU-685 và SKU-100
When tôi chạy checkout hoàn tất
Then bản ghi hóa đơn trong DB có tổng giảm = 78.500 và tổng phải trả = 706.500
And số tiền do máy chủ tính, bỏ qua con số client gửi lên
```

---

## US-03 — Không phá vỡ những gì đang chạy

Là người bảo trì, tôi muốn thay đổi này không làm lệch các nhánh khác của engine,
vì `EvaluateCart` phục vụ cả POS, checkout saga lẫn `modules/mobile`.

**Priority:** must
**Depends on:** US-02

### Acceptance criteria

**AC-19** — Giảm giá theo mức cũng chiếm dòng nên cũng bị loại
```gherkin
Given một CTKM giảm giá theo mức (TIERED_DISCOUNT) chiếm dòng SKU-685
And CTKM-B giảm giá hóa đơn 10%, tạo mới
And giỏ gồm SKU-685 và SKU-100
When POS đánh giá giỏ
Then CTKM-B chỉ tính trên 100.000
```

**AC-20** — Phân bổ theo dòng khớp tổng sau khi làm tròn
```gherkin
Given CTKM-B giảm giá hóa đơn số tiền 100.000đ, tạo mới
And cơ sở tính gồm 3 dòng chưa giảm: 100.000 + 200.000 + 300.000 = 600.000
When POS đánh giá giỏ
Then các phần phân bổ là 16.667 + 33.333 + 50.000
And tổng lineDiscounts đúng bằng discountAmount = 100.000, không lệch 1đ
And không dòng nào bị phân bổ vượt quá giá trị của chính nó
```

**AC-21** — Bộ test promotion hiện có không đỏ thêm
```gherkin
Given toàn bộ spec dưới modules/promotion và các e2e promotion/checkout-saga
When tôi chạy lại sau thay đổi
Then không case nào chuyển từ xanh sang đỏ
And nghĩa của calc_basis = 'NON_PROMO_ITEMS' trong condition-evaluator không đổi
```

**AC-22** — Radio "Phạm vi áp dụng" quay lại, mặc định đúng chiều
```gherkin
Given tôi mở form thêm mới một CTKM giảm giá hóa đơn
Then section "Phạm vi áp dụng" hiện một radio với đúng 2 lựa chọn
And "Chỉ hàng hóa chưa áp dụng khuyến mại" được chọn sẵn
And section này KHÔNG xuất hiện ở form Giảm giá hàng hóa
```

**AC-23** — Cảnh báo khi một CTKM đang ở phạm vi Tất cả hàng hóa (A-03, A-14)
```gherkin
Given tôi mở một CTKM giảm giá hóa đơn đang lưu với invoice_scope = 'ALL_ITEMS'
Then cạnh radio hiện dòng giải thích rằng phần giảm sẽ tính trên cả hàng
     đã được khuyến mại, tức là giảm chồng
And cảnh báo đó biến mất khi tôi chọn "Chỉ hàng hóa chưa áp dụng khuyến mại"
And cảnh báo không chặn việc lưu
```

---

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Tính thuần của domain | `modules/promotion/domain/**` không import `@nestjs/*` hay `typeorm`; engine tất định theo `cart.at` | T-02-01 |
| Tương thích ngược | `invoice_scope` `NULL`/`undefined` vẫn rơi vào nhánh toàn bộ hóa đơn — không đảo mặc định | T-02-01, T-02-05 |
| Kiểm chứng trên DB | Mỗi case đánh dấu **[DB]** phải `SELECT` lại từ bảng, không chỉ đọc response | T-01-04, T-02-05 |
| Đa kênh | `modules/mobile` dùng chung engine — không đổi chữ ký `EvaluateCartRequest` | T-02-05 |
| Bằng chứng trình duyệt | Ảnh chụp luồng tạo CTKM hàng hóa + đối chiếu số tiền ở POS | T-03-02 |
