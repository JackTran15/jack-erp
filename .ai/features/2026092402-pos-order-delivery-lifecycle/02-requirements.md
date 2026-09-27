---
feature: pos-order-delivery-lifecycle
stories: 6
acceptance_criteria: 25
---

# Requirements — Đơn hàng + Đơn hàng Online trên POS, có vòng đời giao hàng

Ký hiệu **[DB]** = đọc từ bảng; **[API]** = request thật; **[ẢNH]** = ảnh chụp
có assert DOM.

Fixture xuyên suốt: tổ chức có 2 chi nhánh `CN-A`, `CN-B`; kênh active `WEB` và
`SHOPEE`, kênh inactive `ZALO`; thu ngân `TN-A` thuộc `CN-A`, ca POS đang mở ở
`CN-A`; đơn `SO-1` (kênh WEB, SENT, đã phân `CN-A`, chưa duyệt, 1 dòng SKU-500 × 2,
phí GH thu khách 30.000, COD); đơn `SO-2` (kênh SHOPEE, SENT, `CN-A`); đơn `SO-9`
(kênh WEB, SENT, `CN-B`); đối tác giao hàng `GHN` active.

---

## US-01 — Xem đơn online theo kênh trên POS

Là thu ngân chi nhánh, tôi mở "Đơn hàng online" và thấy đơn của chi nhánh mình
theo từng kênh, để biết đơn nào đang chờ tôi.

**Priority:** must · **Depends on:** —

### Acceptance criteria

**AC-01** — Sidebar kênh động [API][ẢNH]
```gherkin
Given tổ chức có kênh WEB, SHOPEE active và ZALO inactive
When TN-A mở menu POS → "Đơn hàng online"
Then sidebar hiện "WEB" và "SHOPEE" theo tên trong sales_channels, không hiện "ZALO"
And kênh đầu tiên được chọn sẵn
```

**AC-02** — Lưới chỉ đơn của kênh đang chọn và chi nhánh đang chọn [API][ẢNH]
```gherkin
Given TN-A đang ở CN-A, chọn kênh WEB, trạng thái "Chưa xử lý", khoảng ngày chứa SO-1 và SO-9
When lưới tải
Then lưới có SO-1, không có SO-2 (khác kênh), không có SO-9 (khác chi nhánh)
And cột Mã đơn hàng (OCM), Ngày đơn hàng, Thông tin giao hàng, Tổng thanh toán, Trạng thái, ĐT giao vận, NV bán hàng, Số hoá đơn, Ghi chú, Nhãn có dữ liệu đúng nguồn A-11/A-12
```

**AC-03** — Lọc trạng thái và ngày [API]
```gherkin
Given bộ lọc trạng thái có Tất cả / Chưa xử lý / Đã xử lý / Từ chối / Đã huỷ (A-13)
When TN-A chọn "Hôm nay" hoặc một ngày cụ thể và một trạng thái
Then API chỉ trả đơn có created_at trong ngày đó theo giờ Asia/Ho_Chi_Minh và đúng trạng thái
And đơn DRAFT không bao giờ xuất hiện
```

**AC-04** — Lọc cột [API]
```gherkin
Given lưới có hàng lọc cột như DS hoá đơn POS
When TN-A gõ "*abc" ở cột Mã đơn hàng (OCM) hoặc "≤ 500000" ở Tổng thanh toán
Then API chỉ trả đơn thoả điều kiện; phân trang và tổng "x-y/z kết quả" đúng
```

**AC-05** — Đơn Nhãn "Thiếu hàng" (A-10) [ẢNH]
```gherkin
Given SO-1 có stock_short = true
When lưới tải
Then cột Nhãn của SO-1 hiện "Thiếu hàng"
```

---

## US-02 — Nhận xử lý đơn online

Là thu ngân, tôi nhận xử lý một hoặc nhiều đơn để chúng có hoá đơn và bắt đầu
giao.

**Priority:** must · **Depends on:** US-01

### Acceptance criteria

**AC-06** — Nhận xử lý = duyệt + tạo hoá đơn nháp (A-01) [API][DB]
```gherkin
Given SO-1 chưa được duyệt và CN-A đang mở ca
When TN-A tick SO-1 và bấm "Nhận xử lý"
Then [DB] SO-1 có confirmed_at, status = PROCESSED, invoice_id trỏ tới hoá đơn nháp mới
And [DB] hoá đơn có sales_order_id = SO-1, shipping_fee_amount = 30.000
And [DB] SO-1.delivery_status = 'AWAITING_PICKUP'
And sales_order_dispatch_events có dòng CONFIRM (nếu vừa duyệt) và dòng cho bước nhận xử lý
```

**AC-07** — Nhận xử lý nhiều đơn, từng đơn độc lập [API][ẢNH]
```gherkin
Given TN-A tick SO-1 và SO-2, trong đó SO-2 không nhận được (vd đã bị huỷ ở nơi khác)
When bấm "Nhận xử lý"
Then SO-1 được nhận xử lý, SO-2 giữ nguyên
And UI báo "1/2 đơn đã nhận xử lý" kèm lý do của SO-2
```

**AC-08** — Không có ca thì không nhận xử lý [API][ẢNH]
```gherkin
Given CN-A không có ca POS đang mở
When TN-A bấm "Nhận xử lý"
Then API trả lỗi NO_OPEN_SESSION và UI báo "Chưa mở ca" bằng tiếng Việt; không đơn nào đổi trạng thái
```
> Akenzy 2026-09-24: chấp nhận — đơn web chưa duyệt vẫn có thể được **duyệt** (`confirmed_at`, event CONFIRM) trước khi bước nhận xử lý báo NO_OPEN_SESSION; `status` vẫn SENT.

**AC-09** — Nút chỉ bật cho đơn "Chưa xử lý" [ẢNH]
```gherkin
Given TN-A chưa tick đơn nào, hoặc tick một đơn đã PROCESSED
Then nút "Nhận xử lý" bị disabled
```

---

## US-03 — Danh mục đối tác giao hàng

Là quản trị, tôi khai báo đối tác giao hàng để POS chọn khi giao.

**Priority:** must · **Depends on:** —

### Acceptance criteria

**AC-10** — CRUD qua generic platform (A-04) [API][ẢNH]
```gherkin
Given người dùng backoffice có quyền quản lý đối tác giao hàng
When mở /admin/delivery-partners và thêm "GHN" mã "GHN"
Then [DB] delivery_partners có dòng mới gắn organization_id
And mã trùng trong cùng tổ chức bị từ chối 409
```

**AC-11** — Chỉ đối tác active hiện ở POS [API]
```gherkin
Given GHN active, GHTK inactive
When POS tải danh sách đối tác cho dialog Giao hàng
Then chỉ có GHN
```

---

## US-04 — Lưới Đơn hàng theo trạng thái giao

Là thu ngân, tôi thấy mọi đơn đã nhận xử lý của chi nhánh, chia tab theo trạng
thái giao và thanh toán.

**Priority:** must · **Depends on:** US-02

### Acceptance criteria

**AC-12** — Tab trạng thái giao [API][ẢNH]
```gherkin
Given CN-A có đơn ở mỗi delivery_status
When TN-A mở menu POS → "Đơn hàng" và bấm lần lượt Chờ giao/lấy hàng, Đang giao hàng, Chờ thu COD, Hoàn thành, Thất bại, Đã chuyển hoàn, Đã huỷ
Then mỗi tab chỉ có đơn có delivery_status tương ứng (Đã huỷ = status CANCELLED)
And "Tất cả" có mọi đơn có delivery_status khác NULL hoặc đã huỷ sau khi nhận xử lý
```

**AC-13** — Tab thanh toán dẫn xuất từ hoá đơn (A-06) [API]
```gherkin
Given SO-1 có hoá đơn paid và SO-2 có hoá đơn nháp
Then SO-1 ở tab "Đã thanh toán", SO-2 ở tab "Chưa thanh toán/Lưu tạm"
And một đơn có thể đồng thời ở một tab giao và một tab thanh toán
```

**AC-14** — Bộ lọc loại ngày + khoảng ngày + nhãn (A-16, A-10) [API]
```gherkin
Given TN-A chọn loại ngày "Ngày GH" và "7 ngày gần đây"
Then chỉ đơn có delivered_at trong 7 ngày gần nhất (giờ Asia/Ho_Chi_Minh) hiện
And chọn nhãn "Thiếu hàng" chỉ giữ đơn stock_short = true
```

**AC-15** — Đủ cột, đúng nguồn [ẢNH]
```gherkin
Given một đơn đã giao với đối tác GHN, mã vận đơn "VD123", phí trả ĐT 20.000
When lưới tải
Then 24 cột trong ảnh tham chiếu hiện theo nguồn A-11/A-12, gồm ĐT giao hàng = "GHN", Mã vận đơn = "VD123", Phí GH trả ĐT = 20.000
And cột hàng lọc hỗ trợ toán tử như DS hoá đơn POS; phân trang mặc định 100
```

**AC-16** — Chi nhánh khác không thấy [API]
```gherkin
Given SO-9 thuộc CN-B đã nhận xử lý
When TN-A (CN-A) gọi list đơn giao với bất kỳ bộ lọc nào
Then SO-9 không bao giờ có trong kết quả
```

**AC-17** — Nút ngoài phạm vi disabled [ẢNH]
```gherkin
Then các nút Gửi đơn hàng, Thu COD, Gắn nhãn, Thống kê hàng hoá, In phiếu GH hiện dạng disabled kèm tooltip "Chưa hỗ trợ"
```

---

## US-05 — Giao hàng và cập nhật trạng thái

Là thu ngân, tôi bàn giao đơn cho đối tác và cập nhật kết quả giao.

**Priority:** must · **Depends on:** US-03, US-04

### Acceptance criteria

**AC-18** — Giao hàng (A-04, A-05) [API][DB]
```gherkin
Given SO-1 ở AWAITING_PICKUP và hoá đơn đã hoàn tất (không còn nháp)
When TN-A tick SO-1, bấm "Giao hàng", chọn GHN, nhập mã vận đơn, phí trả ĐT, thông tin gói hàng, bấm Lưu
Then [DB] SO-1.delivery_status = IN_TRANSIT, delivered_at = now, delivery_partner_id = GHN, delivery_partner_name = "GHN", tracking_code, partner_shipping_fee, package_info đúng giá trị nhập
And có dòng lịch sử cho bước giao
And nếu TN-A để trống đối tác và phí trả ĐT thì vẫn giao được; [DB] delivery_partner_id, delivery_partner_name, partner_shipping_fee là NULL (không phải 0)
```

**AC-19** — Không giao khi hoá đơn còn nháp (A-05) [API]
```gherkin
Given SO-2 ở AWAITING_PICKUP nhưng hoá đơn còn nháp
When bấm "Giao hàng"
Then API từ chối với mã INVOICE_NOT_FINALIZED; UI báo "Hoá đơn chưa hoàn tất"
```

**AC-20** — Cập nhật TT theo bảng chuyển hợp lệ (A-09) [API]
```gherkin
Given bảng chuyển: AWAITING_PICKUP→IN_TRANSIT; IN_TRANSIT→AWAITING_COD|FAILED|COMPLETED; FAILED→IN_TRANSIT|RETURNED; AWAITING_COD→COMPLETED
When TN-A chọn chuyển trạng thái nằm ngoài bảng (vd COMPLETED→IN_TRANSIT)
Then API trả 409 INVALID_DELIVERY_TRANSITION và không đổi gì
And chuyển hợp lệ ghi lịch sử với người và thời điểm
```

**AC-21** — Chuyển hoàn huỷ hoá đơn (A-03) [API][DB]
```gherkin
Given SO-1 ở FAILED, hoá đơn debt với COD chưa thu
When TN-A cập nhật sang "Đã chuyển hoàn"
Then CancelInvoiceService.cancel chạy: bút toán kho INVOICE_CANCEL đảo tồn, invoice_debts đóng, điểm đảo
And [DB] SO-1.status = CANCELLED, delivery_status = RETURNED
And nếu CancelInvoiceService từ chối (vd đã có trả hàng tất toán) thì không đổi gì và UI báo lý do
```

**AC-22** — Hoàn thành chỉ khi hết nợ (A-08) [API]
```gherkin
Given SO-1 ở IN_TRANSIT hoặc AWAITING_COD và invoice_debts.remaining_amount > 0
When bấm "Hoàn thành"
Then API trả 409 DEBT_OUTSTANDING
And với đơn remaining_amount = 0, "Hoàn thành" chuyển sang COMPLETED
```

---

## US-07 — Quyền và lịch sử

**Priority:** must · **Depends on:** US-02, US-05

### Acceptance criteria

**AC-26** — Permission riêng cho thao tác giao (A-15) [API]
```gherkin
Given user có pos.sales-order.read nhưng không có pos.sales-order.deliver
When gọi endpoint Giao hàng / Cập nhật TT / Hoàn thành
Then API trả 403; UI ẩn các nút tương ứng
```

**AC-27** — Lịch sử đủ dòng thời gian (A-14) [API]
```gherkin
Given SO-1 đã qua duyệt → nhận xử lý → giao → hoàn thành
When gọi GET /mobile/sales-orders/SO-1/history
Then có đủ các bước theo thứ tự thời gian, mỗi bước có người thực hiện và nhãn tiếng Việt
```

**AC-28** — Duyệt đơn lẻ chỉ trong chi nhánh người gọi [API]
```gherkin
Given SO-9 thuộc CN-B, đang SENT, CN-B đang mở ca
When TN-A (header X-Branch-Id = CN-A) gọi POST /mobile/sales-orders/SO-9/approve
Then API từ chối (ORDER_NOT_HELD_BY_BRANCH hoặc 404) và SO-9 không đổi
And gọi đúng chi nhánh thì hành vi như cũ
```
