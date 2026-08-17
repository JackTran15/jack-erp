---
feature: promotion-programs-engine
stories: 7
acceptance_criteria: 32
---

# Requirements — Khuyến mại

**AC-01…AC-11 giữ nguyên số của REQ-KM-001** (`docs/promotions/25-promotion-req.md` mục 10) để
truy vết ngược. **AC-12…AC-31** là phần epic đặt ra mà REQ không đánh số: quy tắc ưu tiên,
vòng đời CTKM, đa tổ chức, idempotency, hiệu năng truy vấn.

Ánh xạ FR/BR → thiết kế nằm ở `docs/26-promotion-design.md` §7; ở đây chỉ có tiêu chí nghiệm thu.

---

## US-01 — Tạo và lưu chương trình khuyến mại

Là **nhân viên marketing**, tôi muốn tạo được cả 5 hình thức khuyến mại và lưu lại nguyên vẹn,
để không phải nhờ IT sửa dữ liệu tay.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-15** — Round-trip đủ 5 hình thức
```gherkin
Given tôi đã đăng nhập với quyền promotion.write
When tôi POST /v2/promotions lần lượt cho INVOICE_DISCOUNT, ITEM_DISCOUNT, TIERED_DISCOUNT, GIFT_ITEM, BUY_M_GET_N
Then mỗi lần trả 201 kèm code dạng KM00001
And GET /v2/promotions/{id} trả về đúng cấu hình đã gửi, deep-equal tới từng group, line, tier và condition
```

**AC-16** — Hình thức không đổi được sau khi tạo
```gherkin
Given một CTKM đã tạo với type = ITEM_DISCOUNT
When tôi PUT /v2/promotions/{id} với type = GIFT_ITEM
Then hệ thống trả 400 với mã lỗi PROMOTION_TYPE_IMMUTABLE
And CTKM giữ nguyên type cũ
```

**AC-17** — Nhân bản giữ trọn cấu hình
```gherkin
Given một CTKM TIERED_DISCOUNT có 2 group, 4 line và 4 tier
When tôi POST /v2/promotions/{id}/duplicate
Then CTKM mới có code khác bản gốc và status = TRACKING
And số group, số line, số tier bằng đúng bản gốc
And id, createdAt, createdBy của bản gốc không bị sao chép
```

**AC-18** — Xóa là xóa mềm
```gherkin
Given một CTKM đang tồn tại
When tôi DELETE /v2/promotions/{id}
Then GET /v2/promotions/{id} trả 404
And CTKM không xuất hiện trong kết quả search
And dòng vẫn còn trong bảng promotion_programs với deleted_at khác null
```

**AC-19** — Không rò rỉ giữa các tổ chức
```gherkin
Given CTKM thuộc tổ chức A
When người dùng của tổ chức B gọi GET, PUT hoặc DELETE trên CTKM đó
Then hệ thống trả 404, không phải 403
```

**AC-20** — Gửi lại cùng khóa idempotency không tạo bản ghi thứ hai
```gherkin
Given tôi POST /v2/promotions với header X-Idempotency-Key = K và body B
When tôi gửi lại đúng K và đúng B
Then hệ thống trả lại response cũ kèm X-Idempotency-Status: REPLAYED
And bảng promotion_programs chỉ có một dòng
When tôi gửi K với body khác B
Then hệ thống trả 409
```

**AC-14** — Chương trình không tự động áp dụng chỉ chạy khi được chọn
```gherkin
Given một CTKM có autoApply = false đang trong hiệu lực
When tôi evaluate một giỏ hàng khớp điều kiện mà không truyền selectedProgramIds
Then CTKM không nằm trong appliedPrograms
And CTKM nằm trong availablePrograms kèm estimatedDiscount
And CTKM nằm trong skippedPrograms với reason = NOT_SELECTED
When tôi evaluate lại với id của CTKM trong selectedProgramIds
Then CTKM nằm trong appliedPrograms
```

---

## US-02 — Tính khuyến mại cho một giỏ hàng

Là **thu ngân**, tôi muốn biết giỏ hàng này được giảm bao nhiêu và vì sao chương trình khác
không chạy, để trả lời khách ngay tại quầy.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-01** — Giảm giá hàng hóa theo phần trăm
```gherkin
Given một CTKM ITEM_DISCOUNT giảm 30% trên SKU có giá 685.000
When tôi evaluate giỏ hàng chứa 1 đơn vị SKU đó
Then discountAmount của dòng là 205.500
And unitPriceAfter là 479.500
```

**AC-03** — Chương trình đã ngừng theo dõi không áp dụng
```gherkin
Given một CTKM có status = STOPPED khớp mọi điều kiện khác
When tôi evaluate giỏ hàng
Then CTKM không nằm trong appliedPrograms
And CTKM cũng không nằm trong skippedPrograms
```
> Sửa 2026-08-04 (A-33). Bản đầu đòi `skippedPrograms` chứa reason `STOPPED`; `findActive`
> lọc `status = TRACKING` ngay trong SQL nên CTKM đã tắt không bao giờ thành ứng viên.
> `skippedPrograms` là danh sách **suýt đạt** cho thu ngân, không phải nhật ký mọi CTKM
> của tổ chức — cùng lý do đó áp cho `DATE_WINDOW` và `BRANCH_SCOPE`.

**AC-04** — Sai thứ trong tuần thì không áp dụng
```gherkin
Given một CTKM có daysOfWeek = [1,2,3,4,5]
When tôi evaluate với at rơi vào Chủ nhật
Then CTKM nằm trong skippedPrograms với reason = DAY_OF_WEEK
```

**AC-05** — Khung giờ, kể cả ca qua đêm
```gherkin
Given một CTKM có khung giờ 18:00–21:00
When tôi evaluate với at = 15:00
Then CTKM nằm trong skippedPrograms với reason = TIME_OF_DAY
Given một CTKM khác có khung giờ 22:00–02:00
When tôi evaluate với at = 01:00
Then CTKM đó được áp dụng
```

**AC-06** — Bậc thang theo số lượng
```gherkin
Given một CTKM TIERED_DISCOUNT với tierBasis = QUANTITY, bậc [5,9] giảm 10% và bậc [10,null] giảm 20%
When tôi evaluate giỏ hàng mua 7 đơn vị
Then mức giảm áp dụng là 10%
```

**AC-07** — Cấp số nhân quà tặng
```gherkin
Given một CTKM GIFT_ITEM có điều kiện MIN_INVOICE_AMOUNT = 200.000 và multiplyGift = true
When tôi evaluate giỏ hàng trị giá 650.000
Then gifts trả về số lượng nhân 3 lần, bằng floor(650000 / 200000)
```

**AC-08** — Điều kiện nhiều nhóm hàng với chế độ ALL
```gherkin
Given một CTKM có condition.calcBasis = ITEM_CATEGORIES, groupMatchMode = ALL và 2 nhóm hàng
When tôi evaluate giỏ hàng chỉ chứa hàng thuộc nhóm thứ nhất
Then CTKM nằm trong skippedPrograms với reason = CONDITION_NOT_MET
```

**AC-09** — Mua m tặng n, tặng món rẻ nhất
```gherkin
Given một CTKM BUY_M_GET_N với buyGetPolicy = CHEAPEST, buyQuantity = 3, giftQuantity = 1
When tôi evaluate giỏ hàng gồm 3 sản phẩm giá 100.000, 200.000 và 300.000
Then tổng giảm là 100.000, đúng bằng sản phẩm rẻ nhất
```

**AC-12** — Ưu tiên first-match-wins theo tài nguyên
```gherkin
Given hai CTKM cùng nhắm một SKU, một cái priority 10 giảm 30% và một cái priority 20 giảm 50%
When tôi evaluate giỏ hàng chứa SKU đó
Then CTKM priority 10 được áp dụng
And CTKM priority 20 nằm trong skippedPrograms với reason = RESOURCE_TAKEN và takenBy là id của CTKM thắng
```

**AC-13** — Giảm cấp dòng chạy trước giảm cấp hóa đơn
```gherkin
Given một CTKM ITEM_DISCOUNT priority 10 và một CTKM INVOICE_DISCOUNT priority 20 có invoiceScope = NON_PROMO_ONLY
When tôi evaluate giỏ hàng có cả dòng khớp và dòng không khớp CTKM đầu
Then giảm giá hóa đơn chỉ tính trên các dòng chưa bị CTKM đầu chiếm
```

**AC-22** — Đọc thuần và số truy vấn hằng số
```gherkin
Given tôi đếm số dòng của mọi bảng promotion trước khi gọi
When tôi gọi POST /v2/promotions/evaluate mười lần
Then số dòng của mọi bảng không đổi
And số truy vấn DB mỗi lần gọi không tăng theo số dòng giỏ hàng hay số CTKM đang hiệu lực
```

**AC-25** — Khuyến mại đặt ở nhóm cha ăn cả nhóm con
```gherkin
Given cây nhóm hàng hóa hai cấp và một CTKM nhắm nhóm cha
When tôi evaluate giỏ hàng chứa item thuộc nhóm con
Then CTKM được áp dụng cho dòng đó
```

**AC-26** — Dữ liệu giỏ hàng sai là lỗi client
```gherkin
Given tôi gọi evaluate với một itemId không tồn tại trong tổ chức
Then hệ thống trả 400 với mã UNKNOWN_ITEM kèm danh sách itemId sai
When tôi gọi với customerId không tồn tại
Then hệ thống trả 400 với mã UNKNOWN_CUSTOMER
When tôi gọi với lines rỗng
Then hệ thống trả 400
```

**AC-29** — Các con số cộng khớp nhau
```gherkin
Given bất kỳ kết quả evaluate nào
Then tổng discountAmount của appliedPrograms bằng promotionDiscount
And subtotal trừ promotionDiscount bằng amountAfterPromotion
And với mỗi chương trình đã áp, tổng lineDiscounts bằng discountAmount của chương trình đó
```

---

## US-03 — Tra cứu danh sách chương trình khuyến mại

Là **nhân viên marketing**, tôi muốn lọc và phân trang danh sách CTKM ngay trên server,
để làm việc được khi số chương trình lớn.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-10** — Mặc định không lọc trạng thái, chip chỉ hiện khi người dùng tự lọc
```gherkin
Given tôi mở màn Chương trình khuyến mại (hoặc màn Thẻ voucher) lần đầu
Then danh sách hiển thị cả bản ghi Đang theo dõi lẫn Ngừng theo dõi, không lọc trạng thái
And không có chip bộ lọc trạng thái nào trên thanh công cụ
When tôi tự chọn lọc trạng thái Đang theo dõi (hoặc Ngừng theo dõi) từ cột Trạng thái
Then danh sách chỉ còn bản ghi đúng trạng thái đã chọn
And một chip hiển thị bộ lọc đang bật trên thanh công cụ
When tôi bấm dấu x trên chip
Then bộ lọc bị xóa, danh sách trở lại hiển thị mọi trạng thái
```
> Sửa 2026-08-10 (A-35). Bản đầu đòi mặc định lọc `Đang theo dõi` kèm chip xóa được — chốt ở
> FR-004/AC-10 gốc, hiện thực bởi T-03-04 (màn CTKM) và T-06-02 (màn voucher, "cùng chuẩn
> FR-004 với màn CTKM"), e2e-verified bởi T-07-04. QA/product (Akenzy, 2026-08-10) đảo ngược
> có chủ ý: mặc định nay là "Tất cả" (không lọc trạng thái) trên cả hai màn; chip chỉ xuất
> hiện khi người dùng tự lọc. Bằng chứng click-through của T-03-04/T-07-04 cho hành vi cũ
> không còn phản ánh hành vi mong đợi hiện tại.

**AC-21** — Phạm vi chi nhánh
```gherkin
Given một CTKM không có dòng nào trong promotion_branches
Then nó hiện ở mọi chi nhánh
Given một CTKM chỉ gắn chi nhánh A
When tôi search với header X-Branch-Id là chi nhánh B
Then CTKM đó không xuất hiện
```

**AC-23** — Sắp xếp, phân trang và lọc theo cột
```gherkin
Given ba CTKM có priority khác nhau
When tôi POST /v2/promotions/search không truyền bộ lọc
Then kết quả sắp theo priority tăng dần
And mặc định trả tối đa 50 dòng mỗi trang kèm envelope data, total, page, limit
And CTKM đã xóa mềm không xuất hiện
When tôi truyền bộ lọc text với từng toán tử CONTAINS, EQUALS, STARTS_WITH, ENDS_WITH, NOT_CONTAINS
Then mỗi toán tử lọc đúng tập kết quả tương ứng
```

---

## US-04 — Nhập chương trình khuyến mại trên giao diện

Là **nhân viên marketing**, tôi muốn form thật sự đổi theo hình thức tôi chọn và báo lỗi
đúng chỗ, để không phải đoán vì sao lưu không được.

**Priority:** must
**Depends on:** US-03

### Acceptance criteria

**AC-02** — Lỗi bắt buộc hiện tại trường
```gherkin
Given tôi đang tạo CTKM và bỏ trống Tên chương trình
When tôi bấm Lưu
Then hệ thống chặn lưu
And thông báo lỗi hiện ngay tại trường Tên chương trình, không phải toast chung
```

**AC-11** — Tự động áp dụng không bị tắt ngầm
```gherkin
Given tôi đã tick checkbox Tự động áp dụng
When tôi chuyển sang tab Điều kiện áp dụng và chọn một điều kiện
Then checkbox Tự động áp dụng giữ nguyên trạng thái đã tick
```

**AC-27** — Chọn hình thức lúc tạo, khóa lúc sửa
```gherkin
Given tôi bấm nút Thêm mới
Then dropdown liệt kê đủ 5 hình thức khuyến mại
When tôi chọn một hình thức
Then form render đúng biến thể của hình thức đó
When tôi mở một CTKM đã có ở chế độ Sửa
Then control chọn hình thức bị vô hiệu hóa kèm giải thích
And radio trạng thái Đang theo dõi / Ngừng theo dõi chỉ xuất hiện ở chế độ Sửa
```

**AC-30** — Bỏ trống ngày kết thúc thì cảnh báo, không chặn
```gherkin
Given tôi tạo CTKM và bỏ trống Ngày kết thúc
When tôi bấm Lưu
Then hệ thống hiện cảnh báo xác nhận
When tôi xác nhận
Then CTKM được lưu với endDate null
```

**AC-31** — Xoá nhanh giờ áp dụng đã nhập
```gherkin
Given tôi đã nhập giờ bắt đầu hoặc giờ kết thúc cho "Giờ áp dụng"
When tôi bấm nút xoá (×) cạnh ô đó
Then giá trị ô đó về rỗng
And Lưu chương trình vẫn thành công vì trường này không bắt buộc
```

---

## US-05 — Chọn hàng hóa cho các lưới của form

Là **nhân viên marketing**, tôi muốn chọn hàng hóa, mẫu mã hoặc nhóm hàng từ một dialog dùng
chung, để không phải gõ tay mã SKU.

**Priority:** must
**Depends on:** US-04

### Acceptance criteria

**AC-28** — Một dialog dùng chung cho mọi lưới
```gherkin
Given tôi đang ở form CTKM
When tôi bấm chọn hàng hóa từ bất kỳ lưới nào trong 6 lưới của 5 hình thức
Then dialog chọn hàng hóa dùng chung mở ra, không phải một dialog riêng của trang khuyến mại
And tôi chọn được nhiều dòng trong một lần mở, đóng dialog thì tất cả được thêm vào lưới mà không ghi đè dòng cũ
And chọn ở cấp hàng hóa, cấp mẫu mã và cấp nhóm hàng đều được, ánh xạ lần lượt sang targetType PRODUCT, ITEM và CATEGORY
And dòng đã có trong lưới hiện trạng thái đã chọn khi mở lại dialog
```

**AC-32** — Lưới "Giảm giá hàng hóa" nhập bằng ô tìm kiếm, không cần nút riêng
```gherkin
Given tôi đang ở lưới "Giảm giá hàng hóa" của form CTKM (cả hai chế độ Nhóm hàng hóa và Hàng hóa)
When tôi gõ vào ô mã ở dòng trống cuối lưới
Then danh sách gợi ý xuất hiện ngay dưới ô, cùng cơ chế tìm-gõ-chọn với ô "Tìm mã hoặc tên hàng hóa"
     ở phiếu nhập kho/xuất kho/chuyển kho
And chọn một gợi ý điền đủ mã + tên vào dòng đó, đồng thời tự thêm một dòng trống mới ở cuối lưới
And không còn nút "+ Thêm dòng" hay "Chọn nhóm hàng hóa"/"Chọn hàng hóa" đứng riêng dưới bảng
And bấm biểu tượng tìm kiếm trong ô vẫn mở được dialog chọn hàng loạt dùng chung của AC-28, để chọn
    nhiều dòng cùng lúc khi cần
```
> Thêm 2026-08-10 theo yêu cầu QA/product — làm lại `GoodsDiscountGrid` (cùng UOW-04, section
> `GoodsDiscountPromotionSection`) để khớp UX của `ApplicableGoodsGrid` — lưới song song trong
> chính UOW-04 (`ConditionPromotionSection`), đã dùng mẫu này từ đầu — và của phiếu nhập/xuất/
> chuyển kho. Xem A-36 cho đánh đổi mất "Nhân bản dòng".

---

## US-06 — Quản lý thẻ voucher

Là **nhân viên marketing**, tôi muốn phát hành và theo dõi voucher với dòng tổng cộng đúng,
để đối chiếu giá trị đã phát và đã dùng.

**Priority:** should
**Depends on:** —

### Acceptance criteria

**AC-24** — Danh sách voucher đủ cột và dòng tổng cộng
```gherkin
Given tôi mở màn Thẻ voucher
Then lưới hiển thị đủ 10 cột gồm Nhà phát hành, Voucher, Ngày bắt đầu, Ngày kết thúc, Mô tả, Mệnh giá, Tổng số lượng, Tổng giá trị voucher, Tổng giá trị áp dụng và Trạng thái
And dòng tổng cộng của ba cột số tính trên toàn tập kết quả lọc, không phải chỉ trang hiện tại
When tôi tạo voucher trùng mã đã có trong tổ chức
Then lỗi 409 hiện tại trường Voucher, không phải toast lỗi máy chủ
When tôi bỏ trống Từ ngày và Đến ngày
Then voucher được lưu và luôn hợp lệ về mặt thời gian
```

---

## US-07 — Bằng chứng đầu-cuối trước khi bàn giao

Là **developer**, tôi muốn một bộ e2e chạy trên DB thật, để biết engine, repository và tầng
HTTP thật sự khớp nhau chứ không chỉ khớp trong mock.

**Priority:** must
**Depends on:** US-01, US-02, US-03, US-04, US-05, US-06

### Acceptance criteria

Không thêm AC mới — US-07 chạy lại AC-01, AC-03…AC-09, AC-12…AC-26 qua HTTP thật trên
`erp_test`, cộng checklist QA thủ công cho AC-02, AC-10, AC-11, AC-27, AC-28, AC-30, AC-31 vì
`apps/backoffice-web` không có test runner (A-24).

---

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Hiệu năng | `evaluate` dùng số truy vấn hằng số theo hình dạng request: 1 danh sách CTKM + 6 hydrate song song + 2 catalog, cộng 0–3 khi có `customerId` | T-02-03, T-07-03 |
| Hiệu năng | `findActive` không N+1 theo số CTKM; `loadItems` dựng cây nhóm trong RAM, không recursive CTE, không truy vấn mỗi item | T-02-04 |
| Bền vững | `TypeormCatalogReader` chịu được cây nhóm có chu trình: dừng ở độ sâu 50, không treo | T-02-04 |
| Toàn vẹn | `save()` ghi trọn aggregate trong một transaction; lỗi giữa chừng không để lại trạng thái nửa vời | T-01-04 |
| Đa tổ chức | Mọi truy vấn lọc `actor.organizationId`; không có đường nào đọc chéo tổ chức | T-01-04, T-01-05, T-03-01 |
| Thuần khiết | `domain/` không import `@nestjs/*` hay `typeorm`; engine gọi hai lần cùng input cho kết quả `deepEqual`; không đọc `Date.now()` bên trong | T-01-03, T-02-02 |
| Khả dụng | Mọi CTKM bị loại có một `reason` thuộc union có kiểu, không phải chuỗi tự do | T-02-02 |
| Ngôn ngữ | Source backend không có tiếng Việt; chuỗi hiển thị FE tiếng Việt, số và ngày format `Intl` `vi-VN` | T-01-05, T-03-04 |
