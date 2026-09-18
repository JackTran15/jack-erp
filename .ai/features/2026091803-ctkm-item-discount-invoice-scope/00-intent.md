---
feature: ctkm-item-discount-invoice-scope
slug: 2026091803-ctkm-item-discount-invoice-scope
owner: Akenzy
created: 2026-09-18
status: draft
---

# Intent — CTKM: Giảm giá hàng hóa + phạm vi giảm giá hóa đơn

## Problem

Hai vấn đề tách rời về code nhưng chung một màn hình, và vấn đề thứ hai chỉ lộ ra
khi vấn đề thứ nhất được mở lại.

**1. Không tạo được chương trình "Giảm giá hàng hóa".**
Từ 2026-08-11, `ADD_NEW_TYPE_OPTIONS` (`programs.constants.ts`) lọc menu *Thêm mới*
xuống còn đúng một hình thức — *Giảm giá hóa đơn*. Bốn hình thức còn lại bị ẩn.
Đây là quyết định tạm thời, không phải thiếu tính năng: engine
(`ItemDiscountStrategy`), bảng DB, variant form (`PromotionProductDiscount`) và
registry đều đã có sẵn kèm test đơn vị. Người vận hành nhìn thấy cột "Giảm giá
hàng hóa" trong danh sách nhưng không có đường nào tạo mới.

**2. Giảm giá hóa đơn đang cộng dồn lên hàng đã được khuyến mại — và đó là điều đã
được chốt có chủ ý, nay đảo lại.**

`docs/26-promotion-design.md` **BR-002** chốt: *"Dòng trước, hóa đơn sau trên phần
còn lại (`NON_PROMO_ONLY`)"*. Engine thực hiện đúng — `PromotionResolver` chạy pha
chiếm dòng trước pha hóa đơn, `InvoiceDiscountStrategy` lấy cơ sở là
`state.unclaimedLines(cart)` khi `invoiceScope === NON_PROMO_ONLY`.

Nhưng ngày **2026-08-17**, feature `promotion-scope-points-toggle` (ADR-01, đã
accepted, owner Akenzy) khóa đường ghi lại:

> *"The business wants the choice removed — the form should no longer let an admin
> pick; it should always behave as `ALL_ITEMS` going forward."*

Việc khóa được thi hành ở ba chỗ, và đây **không phải bug** — nó là tính năng đã ship:

| Nơi | Hiện trạng |
| --- | --- |
| `ApplyScopePromotionSection.tsx` | Từng là `RadioGroup`; nay thân hàm là `(_props: Props)` — bỏ qua `form`/`onChange`, in một nhãn chết *"Tất cả hàng hóa trong hóa đơn"* |
| `promotion.mapper.ts:524` (`invoiceDiscountToDto`) | Hardcode `invoiceScope: ALL_ITEMS` |
| `promotion.mapper.spec.ts:98-104` | Test **khẳng định** hành vi đó: *"the save path must ignore it and always emit ALL_ITEMS"* |

Trước 2026-08-17, mặc định của form mới là `NON_PROMO_ONLY`. Dấu vết còn nguyên
trong dữ liệu — đếm trên hai DB dev ngày 2026-09-18:

| DB | `INVOICE_DISCOUNT` / `NON_PROMO_ONLY` | `INVOICE_DISCOUNT` / `ALL_ITEMS` |
| --- | ---: | ---: |
| `erp_dev` | 6 | 1 |
| `erp_dev_3008` | 1 | 1 |

Nói cách khác: **phần lớn CTKM đang chạy đã hành xử đúng ý muốn hôm nay**; chính
khóa tháng 8 mới là thứ tạo ra nhóm thiểu số cộng dồn sai. Hôm nay (2026-09-18)
Akenzy đảo lại quyết định đó — xem ADR-01 của feature này, nói rõ nó **supersede**
ADR-01 của `promotion-scope-points-toggle`.

Vấn đề 2 tới giờ vẫn ngủ yên vì vấn đề 1 khóa mất cách tạo CTKM hàng hóa: không có
CTKM hàng hóa thì không dòng nào bị chiếm, nên `ALL_ITEMS` và `NON_PROMO_ONLY` cho
cùng kết quả. Mở lại "Giảm giá hàng hóa" là đúng cái đánh thức nó.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Nhân viên tạo CTKM (backoffice) | Chỉ tạo được *Giảm giá hóa đơn*; muốn giảm theo mặt hàng phải nhờ sửa DB tay | Chọn *Giảm giá hàng hóa* ngay trên menu **Thêm mới**, lưu và mở lại đúng nguyên trạng |
| Nhân viên tạo CTKM (backoffice) | Không được chọn phạm vi; mọi CTKM mới âm thầm thành *Tất cả hàng hóa* | Chọn lại được trên radio 2 lựa chọn, **mặc định** *Chỉ hàng hóa chưa áp dụng khuyến mại*; nếu một CTKM đang ở *Tất cả hàng hóa* thì form nói rõ hệ quả |
| Thu ngân (POS) | Hàng đã giảm theo CTKM hàng hóa vẫn bị trừ tiếp trên tổng hóa đơn | Phần giảm trên tổng hóa đơn chỉ tính trên những dòng chưa được giảm |
| Kế toán | Doanh thu hụt so với chính sách, không dấu vết vì sao | Số tiền khớp BR-002, tái lập được bằng test |

## Success signal

Đo được, kiểm tra thẳng trên `erp_test`:

1. CTKM hóa đơn **tạo mới không đụng vào radio** ghi xuống `promotion_programs.invoice_scope = 'NON_PROMO_ONLY'` — mặc định đảo chiều so với hôm nay.
2. Giỏ có ít nhất một dòng đã giảm (do CTKM hàng hóa **hoặc** giảm giá tay) + một dòng chưa giảm → phần giảm của CTKM hóa đơn `NON_PROMO_ONLY` tính **đúng** trên riêng phần chưa giảm, sai số **0đ**, xác nhận bằng `SELECT` lại từ bảng hóa đơn chứ không chỉ từ response HTTP.
3. Toàn bộ **23 AC** ở `02-requirements.md` có test phủ và xanh; bộ test promotion hiện có không đỏ thêm case nào ngoài đúng một test được sửa có chủ ý (`promotion.mapper.spec.ts`, xem ADR-01).

## Out of scope

- **Ba hình thức còn lại** (*Giảm giá theo mức*, *Tặng hàng hóa*, *Mua m tặng n*) vẫn ẩn trong menu **Thêm mới** (A-04). `TIERED_DISCOUNT` vẫn được test ở AC-19 vì nó cũng chiếm dòng, nhưng không mở đường tạo mới.
- **Backfill CTKM cũ.** Không viết migration `UPDATE` (A-03). Dòng `ALL_ITEMS` còn lại giữ nguyên hành vi; thay vào đó form **cảnh báo** khi mở một CTKM đang ở phạm vi đó (A-14).
- **Đổi nghĩa `calc_basis = NON_PROMO_ITEMS`** của tab *Điều kiện áp dụng* (`condition-evaluator`) — xem ADR-02.
- **Phần B của `promotion-scope-points-toggle`** — checkbox *Tích điểm cho khách hàng* (`accruePoints`) không đổi; feature này chỉ đảo phần A của nó.
- **Trừ tồn kho hàng tặng** (BR-006), **sinh voucher hàng loạt**.

## Constraints

| Kind | Detail |
| --- | --- |
| Dữ liệu | Không cần migration: cột `invoice_scope` và enum `promotion_invoice_scope_enum` đã có từ `1787600000001-AddPromotionProgramTables.ts`, và A-03 không backfill |
| Tương thích ngược | CTKM đã lưu giữ nguyên giá trị **và** cách tính → **không** đảo mặc định của `undefined`/`NULL` trong `InvoiceDiscountStrategy` |
| Quyết định cũ | ADR-01 của `promotion-scope-points-toggle` phải được ghi nhận là bị supersede, kèm ngày và lý do — không sửa lặng lẽ |
| Domain thuần | `modules/promotion/domain/**` không import `@nestjs/*`/`typeorm`; engine tất định theo `cart.at` |
| Đa kênh | `EvaluateCart` phục vụ POS, checkout saga và `modules/mobile` — đổi engine là đổi cho cả ba |
| Ngôn ngữ | Chuỗi hiển thị tiếng Việt; giá trị enum giữ tiếng Anh |

## Existing surface touched

**Tái sử dụng, không viết mới:**
- `PromotionResolver` — thứ tự pha đã đúng BR-002, không đụng
- `CartState.unclaimedLines()` — giữ nguyên chữ ký và nghĩa cho `condition-evaluator`
- `APPLY_SCOPE_OPTIONS` — hai lựa chọn radio vẫn còn nguyên trong `program-form.constants.ts`, chỉ mất nơi dùng
- `PromotionProductDiscount` + `GoodsDiscountPromotionSection` + `GoodsDiscountGrid` — variant form đã dựng đủ, chỉ chưa có lối vào
- `apps/api/test/e2e/setup/promotion-seed.ts` — `PROMO_IDS`, `itemDiscountBody`, `seedPromotionFixtures`; giá 685.000/100.000/200.000/300.000 và cây nhóm hai cấp đã sẵn

**Tính năng liền kề:** `pos-promotion-apply` (`selectedProgramIds`/`excludedProgramIds`), `promotion-scope-points-toggle` (phần B, `accruePoints`), `checkout-saga` (`evaluate-promotion.step.ts` bơm `manualLineDiscount`).

**Lối vào:** không thêm route. Menu **Thêm mới** ở `/promotions/programs` có thêm một mục; form giảm giá hóa đơn có lại một radio.
