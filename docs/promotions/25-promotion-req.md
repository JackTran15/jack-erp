# REQ — Module Khuyến mại

**Mã tài liệu:** REQ-KM-001
**Phiên bản:** 0.1 (draft để review)
**Ngày:** 21/07/2026
**Nguồn tham chiếu:** khảo sát read-only MISA eShop / MShopKeeper — `giaymt.mshopkeeper.vn/main#promotion`, chi nhánh 211 TP. Đà Nẵng, ngày 21/07/2026.
**Tài liệu khảo sát chi tiết:** [`docs/promotion-misa-eshop-survey.md`](./promotion-misa-eshop-survey.md)
**Module liên quan:** `apps/api/src/modules/promotion/`

> **Cách đọc tài liệu này**
> - `[Q]` = **cần bạn quyết định** — chưa chốt, tôi không tự suy diễn.
> - `[?]` = **chưa xác minh được** trên hệ thống tham chiếu (do chỉ khảo sát read-only, không ghi dữ liệu production).
> - Mọi mục **không** có ký hiệu trên đều là hành vi **đã quan sát trực tiếp** trên UI tham chiếu.
> - Mục 8 (mô hình dữ liệu) là **suy ra từ UI**, không phải schema thật của MISA.

---

## 1. Mục đích & phạm vi

### 1.1. Mục đích
Đặc tả yêu cầu chức năng cho module Khuyến mại: cho phép người dùng tạo, quản lý và áp dụng các chương trình khuyến mại (CTKM) tại điểm bán.

### 1.2. Trong phạm vi
- Quản lý danh mục CTKM (tạo / sửa / nhân bản / xóa / bật-tắt theo dõi)
- 5 hình thức khuyến mại (mục 4)
- Điều kiện áp dụng & phạm vi khách hàng
- Thẻ voucher theo mệnh giá
- Nhập/xuất khẩu Excel danh sách hàng hóa khuyến mại

### 1.3. Ngoài phạm vi (giai đoạn này)
- Engine tính toán & thứ tự ưu tiên khi áp dụng tại POS `[Q]` — xem FR-060, đây là hạng mục lớn cần tách tài liệu riêng
- Báo cáo hiệu quả khuyến mại
- Khuyến mại theo kênh online / đồng bộ sàn TMĐT
- Tích điểm / thẻ thành viên (chỉ *tham chiếu* hạng thẻ, không quản lý hạng thẻ)

### 1.4. Người dùng
| Vai trò                      | Nhu cầu                                               |
| ---------------------------- | ----------------------------------------------------- |
| Quản lý cửa hàng / Marketing | Thiết lập và theo dõi CTKM                            |
| Thu ngân (POS)               | CTKM tự động áp dụng hoặc chọn thủ công khi tính tiền |
| Kế toán                      | Đối soát giá trị giảm giá / quà tặng                  |

---

## 2. Thuật ngữ

| Thuật ngữ                | Định nghĩa                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| **CTKM**                 | Chương trình khuyến mại — một bản ghi cấu hình khuyến mại                                           |
| **Hình thức khuyến mại** | 1 trong 5 loại: Giảm giá hóa đơn, Giảm giá hàng hóa, Giảm giá theo mức, Tặng hàng hóa, Mua m tặng n |
| **Hàng hóa**             | Sản phẩm cha (VD: `ABA2777`)                                                                        |
| **Mẫu mã**               | Biến thể/SKU con của hàng hóa (VD: `ABA2777-D-38` — theo size)                                      |
| **Nhóm hàng hóa**        | Danh mục phân loại hàng hóa, cấu trúc cây ≥2 cấp                                                    |
| **Nhóm khuyến mại**      | Trong "Giảm giá theo mức": một cụm gồm *danh sách hàng hóa + bảng bậc thang* riêng                  |
| **Đang/Ngừng theo dõi**  | Trạng thái bật/tắt hiệu lực của CTKM                                                                |

---

## 3. Yêu cầu chức năng — Quản lý danh mục

### FR-001 — Danh sách CTKM `Must`
Hiển thị danh sách CTKM với các cột: Tên chương trình, Ngày bắt đầu, Ngày kết thúc, Áp dụng cho, Hình thức khuyến mại, Mô tả, Trạng thái.

### FR-002 — Lọc theo kỳ `Must`
Bộ chọn kỳ + `Từ ngày` / `Đến ngày` + nút áp dụng.
Các kỳ dựng sẵn: Hôm nay, Hôm qua, Tuần này, Tuần trước, Tháng này, Tháng trước, Quý này, Quý trước, 6 tháng trước, **Năm nay (mặc định)**, Năm trước, Khác (tự nhập).

### FR-003 — Lọc theo từng cột `Should`
Mỗi cột có ô lọc riêng dưới header:
- Cột text: 5 toán tử — `Chứa` / `Bằng` / `Bắt đầu bằng` / `Kết thúc bằng` / `Không chứa`
- Cột ngày: toán tử `=` + date picker
- Cột enum (Áp dụng cho / Hình thức / Trạng thái): dropdown chọn 1 giá trị, có mục `Tất cả`

### FR-004 — Trạng thái mặc định của bộ lọc `Must`
> ⚠️ **Khác biệt có chủ đích so với hệ tham chiếu.**
> Hệ tham chiếu mặc định lọc `Đang theo dõi`, khiến CTKM đã ngừng **biến mất** khỏi danh sách mà không có dấu hiệu nào — đây là lỗi UX gây nhầm lẫn "mất chương trình khuyến mại".
>
> **Yêu cầu:** mặc định lọc `Đang theo dõi`, **nhưng phải hiển thị chip/badge bộ lọc đang bật** ngay trên thanh công cụ để người dùng biết danh sách đang bị lọc và xóa lọc bằng 1 cú click.

### FR-005 — Phân trang `Must`
Điều hướng trang đầu/trước/sau/cuối, chọn số dòng/trang (mặc định 50), hiển thị `Hiển thị x - y trên z kết quả`.

### FR-006 — Tạo mới CTKM `Must`
Nút `Thêm mới` có dropdown chọn 1 trong 5 hình thức khuyến mại. **Hình thức khuyến mại được chọn tại thời điểm tạo và không đổi được sau đó** `[Q]` — xác nhận có cho phép đổi hình thức khi sửa không?

### FR-007 — Sửa CTKM `Must`
Mở CTKM ở chế độ chỉnh sửa. Phím tắt `Ctrl+E`.
`[Q]` Có cho sửa CTKM **đã phát sinh giao dịch** không? Nếu có thì sửa có hồi tố không? Khuyến nghị: khóa sửa, chỉ cho *Ngừng theo dõi* + *Nhân bản* thành phiên bản mới.

### FR-008 — Nhân bản CTKM `Must`
Copy toàn bộ cấu hình (kể cả danh sách hàng hóa) sang form **Thêm mới** đã điền sẵn. Không ghi dữ liệu cho đến khi người dùng bấm Lưu.

### FR-009 — Xóa CTKM `Must`
`[Q]` Xóa mềm hay xóa cứng? Có chặn xóa khi CTKM đã áp dụng vào hóa đơn không? Khuyến nghị: chặn xóa nếu đã phát sinh, chỉ cho ngừng theo dõi.

### FR-010 — Trạng thái theo dõi `Must`
Radio `Đang theo dõi` / `Ngừng theo dõi`, **chỉ hiển thị ở chế độ Sửa** (bản ghi mới luôn mặc định Đang theo dõi).
Chỉ CTKM `Đang theo dõi` **và** trong thời gian hiệu lực mới được áp dụng tại POS.

### FR-011 — Làm mới danh sách `Must`
Nút `Nạp` tải lại dữ liệu.

---

## 4. Yêu cầu chức năng — Cấu hình chung của CTKM

Áp dụng cho **cả 5 hình thức**.

### FR-020 — Thông tin chung `Must`
| Trường           | Kiểu          | Bắt buộc                         |
| ---------------- | ------------- | -------------------------------- |
| Tên chương trình | text          | ✅                                |
| Mô tả            | text          |                                  |
| Áp dụng cho      | enum (FR-021) | ✅ (mặc định `Tất cả khách hàng`) |

### FR-021 — Phạm vi khách hàng `Must`
Enum 4 giá trị, mỗi giá trị mở khóa trường phụ tương ứng:

| Giá trị                 | Trường phụ                                                                        |
| ----------------------- | --------------------------------------------------------------------------------- |
| Tất cả khách hàng       | —                                                                                 |
| Nhóm khách hàng         | Multi-select nhóm khách hàng                                                      |
| Khách hàng có sinh nhật | — `[Q]` sinh nhật trùng **ngày** hay trùng **tháng**? Hệ tham chiếu không nêu rõ. |
| Khách hàng có hạng thẻ  | Dropdown hạng thẻ (single-select)                                                 |

### FR-022 — Thời gian áp dụng `Must`
| Trường                     | Quy tắc                                                        |
| -------------------------- | -------------------------------------------------------------- |
| Ngày bắt đầu               | Bỏ trống = không giới hạn                                      |
| Ngày kết thúc              | Bỏ trống = không giới hạn                                      |
| Theo ngày trong tuần       | 7 checkbox Thứ 2 → Chủ nhật. Không tick nào = áp dụng mọi ngày |
| Giờ bắt đầu / Giờ kết thúc | Khung giờ vàng trong ngày. Bỏ trống = cả ngày                  |

`[Q]` Giờ kết thúc < giờ bắt đầu (ca qua đêm, VD 22:00–02:00) — hỗ trợ hay chặn?

### FR-023 — Tự động áp dụng `Must`
Checkbox **"Tự động áp dụng chương trình khuyến mại này khi tính tiền"**, mặc định **bật**.
- Bật → POS tự áp dụng khi thỏa điều kiện
- Tắt → thu ngân phải chọn thủ công

> ⚠️ **Khác biệt có chủ đích so với hệ tham chiếu.**
> Hệ tham chiếu **tự động bỏ tick** checkbox này khi người dùng chọn một điều kiện áp dụng — hành vi ngầm, không cảnh báo, dẫn đến CTKM lưu xong nhưng không chạy tại quầy.
>
> **Yêu cầu:** không tự đổi giá trị người dùng đã chọn. Nếu có lý do nghiệp vụ phải tắt, hiển thị cảnh báo tường minh để người dùng tự quyết.

### FR-024 — Dialog chọn hàng hóa `Must`
Dialog dùng chung mọi form, gồm:
- Lọc theo **Nhóm hàng hóa** (cây ≥2 cấp)
- Ô tìm kiếm theo **Mã SKU hoặc Tên hàng hóa**
- Lưới: checkbox · Mã SKU · Tên hàng hóa · Nhóm hàng hóa · Đơn vị tính · Số lượng
- **Mở rộng dòng cha để chọn từng mẫu mã** (biến thể). Cho phép chọn ở cấp hàng hóa **hoặc** cấp mẫu mã
- Bộ đếm realtime: `n mẫu mã (m hàng hóa) đã chọn`
- Phân trang (hệ tham chiếu: 50 dòng/trang, ~2.500 SKU)
- Chọn nhiều dòng trong 1 lần mở dialog

### FR-025 — Nhập khẩu Excel `Should`
Wizard 3 bước: `Chọn tệp nguồn` → `Kiểm tra dữ liệu` → `Hoàn thành`.
- Kéo-thả tệp hoặc chọn tệp
- Link tải **tệp mẫu**
- Bước 2 phải liệt kê lỗi theo từng dòng trước khi cho phép ghi
Áp dụng cho: Giảm giá hàng hóa, Giảm giá theo mức, Tặng hàng hóa, Mua m tặng n.

### FR-026 — Xuất khẩu Excel `Should`
Xuất danh sách hàng hóa đang cấu hình. Chỉ bật khi lưới có ít nhất 1 dòng.

---

## 5. Yêu cầu chức năng — 5 hình thức khuyến mại

### FR-030 — Giảm giá hóa đơn `Must`
Giảm trên tổng hóa đơn.
- **Phạm vi:** `Chỉ hàng hóa chưa áp dụng khuyến mại` (mặc định) | `Tất cả hàng hóa trong hóa đơn`
- **Mức giảm:** `theo %` | `theo số tiền` (chọn 1)
- Có tab Điều kiện áp dụng (FR-040)

### FR-031 — Giảm giá hàng hóa `Must`
Giảm trên từng mặt hàng / nhóm hàng.
- **Đối tượng:** `Nhóm hàng hóa` (mặc định) | `Hàng hóa`
- **Cách giảm:** `theo %` | `theo số tiền` | `Đồng giá`
- Ô nhập giá trị dùng để **áp hàng loạt** cho toàn bộ dòng trong lưới
- Cột lưới thay đổi theo lựa chọn:

  | Chế độ                 | Cột                                                                     |
  | ---------------------- | ----------------------------------------------------------------------- |
  | Nhóm hàng hóa          | Mã nhóm · Tên nhóm · % giảm giá                                         |
  | Hàng hóa + % / số tiền | Mã SKU · Tên hàng hóa · ĐVT · Giá bán · % giảm giá · **Giá khuyến mại** |
  | Hàng hóa + Đồng giá    | Mã SKU · Tên hàng hóa · ĐVT · Giá bán · **Giá khuyến mại**              |

- **Giá khuyến mại tính tự động** từ Giá bán và mức giảm (đã kiểm chứng: `685.000 × 30% → 479.500`)
- Có Nhập/Xuất khẩu Excel (chỉ ở chế độ `Hàng hóa`)
- Có tab Điều kiện áp dụng, nhưng phần "tính trên" chỉ 2 lựa chọn: `Tất cả hàng hóa` | `Hàng hóa chưa khuyến mại`

`[Q]` Làm tròn giá khuyến mại theo quy tắc nào (đồng / trăm đồng / nghìn đồng)?

### FR-032 — Giảm giá theo mức `Must`
Chiết khấu bậc thang. Không có tab Điều kiện áp dụng (bảng bậc thang chính là điều kiện).

- **Căn cứ tính bậc** (chọn 1): `Số lượng hàng mua` | `Giá trị hàng mua` | `Giá trị hóa đơn`
- **Cách giảm** (chọn 1): `theo %` | `theo số tiền` | `Đồng giá`
- **Tính trên:** `Từng hàng hóa trong nhóm khuyến mại` | `Tất cả hàng hóa trong nhóm khuyến mại`
- **Đối tượng:** `Hàng hóa` | `Mẫu mã` | `Nhóm hàng hóa`
- **Nhiều nhóm khuyến mại:** nút `+ Thêm nhóm` tạo các tab `Nhóm 1`, `Nhóm 2`… — **mỗi nhóm có danh sách hàng hóa riêng và bảng bậc thang riêng**
- **Bảng bậc thang:** `Từ` · `Đến` · `Mức giảm` — thêm/xóa dòng tùy ý. Tiêu đề bảng đổi theo căn cứ tính bậc

**Trường hợp `Giá trị hóa đơn`:** ẩn toàn bộ Tính trên / Đối tượng / các tab nhóm / lưới hàng hóa; chỉ còn bảng bậc thang; **hiện thêm trường `Giới hạn giá trị giảm`** (trần số tiền giảm tối đa).

`[Q]` Validate chồng lấn/hở giữa các bậc (`Từ`–`Đến`) — chặn khi lưu hay chỉ cảnh báo?

### FR-033 — Tặng hàng hóa `Must`
- **Cách tặng:** `Tặng một trong danh sách hàng hóa` (khách chọn 1) | `Tặng tất cả trong danh sách`
- Lưới: Mã SKU · Tên hàng hóa · ĐVT · Giá bán · **Số lượng**
- Có Nhập/Xuất khẩu Excel
- Có tab Điều kiện áp dụng, **kèm checkbox đặc thù** (FR-041)

`[Q]` Quà tặng có trừ tồn kho không? Ghi nhận giá vốn thế nào?

### FR-034 — Mua m tặng n `Must`
Layout 2 cột. Không có tab Điều kiện áp dụng.

**Chế độ A — `Tặng hàng hóa cụ thể`**
- *Cột trái — Điều kiện mua:* đối tượng `Hàng hóa` | `Mẫu mã` (mặc định) | `Nhóm hàng hóa`; lưới Mã SKU · Tên hàng hóa · ĐVT · **SL**. Dòng mô tả động: *"Mua **n** trong những hàng hóa sau"*
- *Cột phải — Hàng hóa được tặng:* `Tặng một trong danh sách` | `Tặng tất cả trong danh sách`; lưới Mã SKU · Tên hàng hóa · ĐVT · **SL tặng**

**Chế độ B — `Tặng hàng hóa rẻ nhất`**
- Gộp còn 1 cột. Công thức: **Mua `[m]` hàng hóa được tặng `[n]` hàng hóa rẻ nhất**
- Lưới: Mã SKU · Tên hàng hóa · ĐVT

`[Q]` Chế độ B: "rẻ nhất" tính theo giá niêm yết hay giá sau các khuyến mại khác?

---

## 6. Yêu cầu chức năng — Điều kiện áp dụng

Áp dụng cho: Giảm giá hóa đơn, Giảm giá hàng hóa, Tặng hàng hóa.

### FR-040 — Ba loại điều kiện `Must`
1. **Không yêu cầu điều kiện** *(mặc định)*
2. **Tổng tiền hàng trên hóa đơn ≥ `[giá trị]`, tính trên `[phạm vi]`**
   Phạm vi (chỉ Giảm giá hóa đơn có đủ 3):
   - `Tất cả hàng hóa`
   - `Hàng hóa chưa khuyến mại`
   - `Hàng hóa thuộc nhóm hàng hóa` → hiện khối chọn nhóm với 2 chế độ:
     - **Thuộc 1 trong các nhóm sau** — hóa đơn có hàng hóa thuộc **ít nhất 1** nhóm, và tổng giá trị các hàng hóa đó ≥ ngưỡng
     - **Thuộc tất cả các nhóm sau** — hóa đơn có hàng hóa thuộc **đủ tất cả** các nhóm, và tổng giá trị các hàng hóa đó ≥ ngưỡng
3. **Yêu cầu số lượng cụ thể** → lưới Mã SKU · Tên hàng hóa · ĐVT · **Lớn hơn hoặc bằng số lượng**

### FR-041 — Cấp số nhân quà tặng `Should`
*(chỉ Tặng hàng hóa, khi dùng điều kiện loại 2)*
Checkbox **"Tăng số lượng quà tặng theo cấp số nhân của tổng tiền hóa đơn"**.
Ví dụ chính thức từ hệ tham chiếu: *tặng 1 đôi tất khi hóa đơn ≥ 200.000đ → 2 đôi khi ≥ 400.000đ → 3 đôi khi ≥ 600.000đ…*

`[Q]` Có trần số lượng quà tặng tối đa không?

---

## 7. Yêu cầu chức năng — Thẻ voucher

### FR-050 — Danh sách voucher `Should`
Cột: Nhà phát hành · Voucher · Ngày bắt đầu · Ngày kết thúc · Mô tả · **Mệnh giá** · **Tổng số lượng** · **Tổng giá trị voucher** · **Tổng giá trị áp dụng** · Trạng thái.
Có dòng tổng cộng cho các cột số. Thao tác: Thêm mới / Nhân bản / Sửa / Xóa / Nạp (3 thao tác giữa bị disable khi chưa chọn dòng).

### FR-051 — Tạo voucher `Should`
| Trường        | Bắt buộc                    |
| ------------- | --------------------------- |
| Ngày bắt đầu  |                             |
| Ngày kết thúc | (bỏ trống = không giới hạn) |
| Nhà phát hành | ✅                           |
| Voucher (mã)  | ✅                           |
| Mệnh giá      | ✅                           |
| Mô tả         |                             |

`[?]` Các cột `Tổng số lượng` / `Tổng giá trị voucher` / `Tổng giá trị áp dụng` **không có trường nhập tương ứng** trong form tạo → nhiều khả năng là số liệu tổng hợp từ giao dịch sử dụng voucher. Chưa xác minh được do tenant tham chiếu không có dữ liệu voucher nào.
`[Q]` Voucher là mã dùng 1 lần hay dùng nhiều lần? Sinh mã hàng loạt hay nhập tay từng mã?

---

## 8. Mô hình dữ liệu (suy ra từ UI — cần review)

> Đây **không** phải schema của hệ tham chiếu, mà là mô hình tôi suy ra từ các trường quan sát được.

```
PromotionProgram
  id, name, description
  promotionType        enum: INVOICE_DISCOUNT | ITEM_DISCOUNT | TIERED_DISCOUNT
                             | GIFT_ITEM | BUY_M_GET_N
  status               enum: TRACKING | STOPPED
  appliesTo            enum: ALL_CUSTOMERS | CUSTOMER_GROUP | BIRTHDAY | CARD_TIER
  customerGroupIds[]   (khi appliesTo = CUSTOMER_GROUP)
  cardTierId           (khi appliesTo = CARD_TIER)
  startDate, endDate            nullable = không giới hạn
  daysOfWeek[]                  rỗng = mọi ngày
  startTime, endTime            nullable = cả ngày
  autoApply            boolean, default true
  maxDiscountAmount    nullable — chỉ TIERED_DISCOUNT + INVOICE_VALUE

PromotionCondition            (1-1, chỉ 3 loại có tab điều kiện)
  conditionType        enum: NONE | MIN_INVOICE_AMOUNT | SPECIFIC_QUANTITY
  minAmount
  calculatedOn         enum: ALL_ITEMS | NON_PROMO_ITEMS | ITEM_GROUPS
  groupMatchMode       enum: ANY_GROUP | ALL_GROUPS
  multiplyGift         boolean — chỉ GIFT_ITEM

PromotionGroup                (n, chỉ TIERED_DISCOUNT; các loại khác = 1 nhóm ngầm)
  ordinal, name

PromotionLine                 (n, thuộc PromotionGroup)
  targetType           enum: ITEM | VARIANT | ITEM_GROUP
  targetId
  role                 enum: CONDITION | REWARD   -- BUY_M_GET_N cần phân biệt 2 vế
  quantity
  discountPercent | discountAmount | fixedPrice

PromotionTier                 (n, chỉ TIERED_DISCOUNT — thuộc PromotionGroup)
  fromValue, toValue
  discountPercent | discountAmount | fixedPrice

Voucher
  id, issuer, code, faceValue
  description, startDate, endDate, status
```

---

## 9. Quy tắc nghiệp vụ cần chốt

### BR-001 — Thứ tự ưu tiên khi nhiều CTKM cùng khớp `[Q]` 🔴 **Ưu tiên cao nhất**
Trên hệ tham chiếu, `GIÀY NỮ ONSALE 30%` và `GIÀY NỮ ONSALE 50%` **cùng đang chạy**, cùng nhóm hàng, cùng vô thời hạn. UI không cho biết CTKM nào thắng, cũng không có trường thứ tự ưu tiên hay cảnh báo trùng lặp.

Cần chốt:
- Nhiều CTKM khớp cùng lúc → **cộng dồn** hay **chọn 1**?
- Nếu chọn 1: theo *có lợi nhất cho khách*, hay theo *thứ tự ưu tiên do người dùng đặt*, hay theo *ngày tạo*?
- Có cần trường `priority` trên CTKM không?
- Có cảnh báo khi tạo CTKM chồng lấn (cùng SKU + cùng khung thời gian) không?

### BR-002 — Giảm giá hóa đơn vs giảm giá hàng hóa `[Q]`
Thứ tự áp dụng: giảm trên dòng hàng trước rồi mới giảm hóa đơn, hay ngược lại? Ảnh hưởng trực tiếp tới số tiền cuối.

### BR-003 — Ngày kết thúc để trống `Should`
Hệ tham chiếu cho phép, và cả 4 CTKM production đều không có ngày kết thúc → chạy vô thời hạn.
**Khuyến nghị:** vẫn cho phép, nhưng hiển thị cảnh báo khi lưu CTKM không có ngày kết thúc.

### BR-004 — Validate tối thiểu khi lưu `[Q]`
Hệ tham chiếu **chỉ bắt buộc trường Tên chương trình** → về mặt UI có thể lưu một CTKM giảm 0% không có hàng hóa nào.
**Khuyến nghị bổ sung ràng buộc:** mức giảm > 0; danh sách hàng hóa/nhóm không rỗng (trừ Giảm giá hóa đơn và Giảm giá theo mức + Giá trị hóa đơn); ngày kết thúc ≥ ngày bắt đầu; các bậc thang không chồng lấn.

### BR-005 — Phạm vi chi nhánh `[Q]` `[?]`
Hệ tham chiếu chạy trong ngữ cảnh 1 chi nhánh (có bộ chọn chi nhánh ở header) nhưng **không có trường chọn chi nhánh áp dụng trong form CTKM** → chưa xác minh được CTKM là phạm vi chi nhánh hay toàn hệ thống.
Cần chốt: CTKM thuộc 1 chi nhánh, nhiều chi nhánh, hay toàn công ty?

### BR-006 — Tồn kho quà tặng `[Q]`
Quà tặng / hàng tặng trong "Mua m tặng n" có trừ tồn kho không? Hạch toán giá vốn ra sao? Nếu hết tồn thì CTKM có ngừng áp dụng?

---

## 10. Tiêu chí nghiệm thu (mẫu — cần bổ sung sau khi chốt mục 9)

| ID    | Kịch bản                                                                     | Kỳ vọng                                                                       |
| ----- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| AC-01 | Tạo CTKM Giảm giá hàng hóa 30% cho 1 SKU giá 685.000                         | Cột Giá khuyến mại tự hiện 479.500                                            |
| AC-02 | Lưu CTKM bỏ trống Tên chương trình                                           | Chặn lưu, báo lỗi tại trường                                                  |
| AC-03 | CTKM `Ngừng theo dõi`, bán hàng SKU thuộc CTKM đó                            | Không áp dụng giảm giá                                                        |
| AC-04 | CTKM giới hạn Thứ 2–Thứ 6, bán ngày Chủ nhật                                 | Không áp dụng                                                                 |
| AC-05 | CTKM khung giờ 18:00–21:00, bán lúc 15:00                                    | Không áp dụng                                                                 |
| AC-06 | Bậc thang: mua 5 sp giảm 10%, mua 10 sp giảm 20%; mua 7 sp                   | Giảm 10%                                                                      |
| AC-07 | Tặng hàng có bật cấp số nhân, ngưỡng 200.000đ, hóa đơn 650.000đ              | Tặng 3 phần quà                                                               |
| AC-08 | Điều kiện "thuộc tất cả các nhóm sau" với 2 nhóm, hóa đơn chỉ có hàng nhóm 1 | Không áp dụng                                                                 |
| AC-09 | Mua m tặng n chế độ "rẻ nhất": mua 3, tặng 1 rẻ nhất                         | Miễn phí đúng sp giá thấp nhất trong 3 sp                                     |
| AC-10 | Bật lọc mặc định `Đang theo dõi`                                             | Hiển thị chip bộ lọc, click 1 lần là xóa lọc (FR-004)                         |
| AC-11 | Chọn điều kiện áp dụng                                                       | Checkbox "Tự động áp dụng" **giữ nguyên** giá trị người dùng đã chọn (FR-023) |

---

## 11. Việc cần làm tiếp

| #   | Việc                                              | Chặn bởi                             |
| --- | ------------------------------------------------- | ------------------------------------ |
| 1   | Chốt toàn bộ mục `[Q]`, ưu tiên **BR-001**        | Bạn quyết định                       |
| 2   | Đặc tả engine áp dụng KM tại POS (tài liệu riêng) | BR-001, BR-002                       |
| 3   | Xác minh các mục `[?]` trên tenant demo/sandbox   | Cần môi trường không phải production |
| 4   | Bổ sung wireframe / mockup                        | Sau khi chốt mục 5                   |
| 5   | Hoàn thiện bộ tiêu chí nghiệm thu                 | Sau bước 1                           |

---

## Phụ lục A — Ma trận tính năng theo hình thức

|                         | Giảm giá hóa đơn | Giảm giá hàng hóa | Giảm giá theo mức | Tặng hàng hóa | Mua m tặng n |
| ----------------------- | :--------------: | :---------------: | :---------------: | :-----------: | :----------: |
| Tab Điều kiện áp dụng   |        ✅         |         ✅         |         ❌         |       ✅       |      ❌       |
| Giảm theo %             |        ✅         |         ✅         |         ✅         |       —       |      —       |
| Giảm theo số tiền       |        ✅         |         ✅         |         ✅         |       —       |      —       |
| Đồng giá                |        ❌         |         ✅         |         ✅         |       —       |      —       |
| Chọn theo Nhóm hàng hóa | chỉ ở điều kiện  |         ✅         |         ✅         |       ❌       |      ✅       |
| Chọn theo Mẫu mã        |        ❌         |         ❌         |         ✅         |       ❌       |      ✅       |
| Nhiều nhóm khuyến mại   |        ❌         |         ❌         |         ✅         |       ❌       |      ❌       |
| Nhập/Xuất khẩu Excel    |        ❌         |         ✅         |         ✅         |       ✅       |      ✅       |
| Bậc thang Từ–Đến        |        ❌         |         ❌         |         ✅         |       ❌       |      ❌       |
| Trần giá trị giảm       |        ❌         |         ❌         |        ✅¹         |       ❌       |      ❌       |

¹ chỉ khi căn cứ tính bậc = `Giá trị hóa đơn`

Tính năng dùng chung cả 5 hình thức: Tên/Mô tả · Áp dụng cho (4 kiểu khách hàng) · Ngày bắt đầu–kết thúc · Lọc thứ trong tuần · Khung giờ · Tự động áp dụng · Nhân bản · Trạng thái theo dõi.

---

## Phụ lục B — Hiện trạng tenant tham chiếu

| Mục           | Giá trị                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Số CTKM       | 4 (toàn bộ là *Giảm giá hàng hóa*)                                                                                                                            |
| Trạng thái    | Cả 4 đều *Đang theo dõi*                                                                                                                                      |
| Ngày bắt đầu  | 05/04/2026 — **không có ngày kết thúc**                                                                                                                       |
| Áp dụng cho   | Cả 4 đều *Tất cả khách hàng*                                                                                                                                  |
| Tên           | GIÀY NỮ ONSALE 30% · GIÀY NAM ONSALE 30% · GIÀY NỮ ONSALE 50% · GIÀY NAM ONSALE 50%                                                                           |
| Số voucher    | 0                                                                                                                                                             |
| Quy mô SKU    | ~2.500 (50 trang × 50 dòng)                                                                                                                                   |
| Nhóm hàng hóa | 2 cấp — `QUÀ TẶNG` › Phiếu quà tặng; `GIÀY DÉP` › Giày nhập, Giày nam, Giày nữ, Giày thể thao, Giày hở mũi, Dép nam, Dép nữ, Sandal nam, Sandal nữ, Sapo nam… |
| Hạng thẻ      | 1 (`Thẻ thành viên`)                                                                                                                                          |
