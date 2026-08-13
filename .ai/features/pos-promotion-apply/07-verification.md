---
feature: pos-promotion-apply
environments: [local-pos]
viewports: [desktop]
---

# Verification — Áp dụng khuyến mại tại POS

Slice under test: **Giảm giá hoá đơn** tại quầy — dòng "Khuyến mại" trên panel thanh toán,
dialog Chương trình khuyến mãi, và hoá đơn in.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S2 | Một CTKM `INVOICE_DISCOUNT` PERCENT: dòng hiện "Khuyến mại (10%) -85.000", còn phải thu 765.000 | `/` | `fill input[placeholder*="Tìm kiếm"] = DD850; wait text=DD850` | AC-01, AC-26 | `text=Khuyến mại (10%); text=-85.000; text=765.000` |
| S3 | Hai CTKM cùng áp: dòng hiện "Khuyến mại" **không kèm %**, -201.000, còn phải thu 1.229.000 | `/` | `fill input[placeholder*="Tìm kiếm"] = VI580; wait text=VI580` | AC-01, AC-27 | `text=-201.000; text=1.229.000; no-text=Khuyến mại (10%)` |
| S4 | Danh sách hoá đơn mở được, hiện hoá đơn đã chốt có khuyến mại | `/invoices` | — | — | `text=INV-202608` |

## Lỗi đã ghi nhận bằng ảnh

Các bước dưới đây **cố ý đỏ**. Assertion viết theo hành vi *đúng* mong đợi; sản phẩm đang sai
nên bước fail, và ảnh chụp kèm theo chính là bằng chứng lỗi. Khi lỗi được sửa, các bước này
chuyển xanh mà không phải sửa lại kịch bản.

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Giỏ rỗng thì KHÔNG được hiện dòng "Khuyến mại" (thực tế vẫn hiện kèm ô xám chờ tải) | `/` | — | AC-25 | `no-text=Khuyến mại` |
| S5 | Hoá đơn khách vãng lai KHÔNG được ghi điểm tích (thực tế `points_earned=122`) | `/invoices` | `click text=INV-202608-00006` | — | `no-text=Điểm được tích` |
| S6 | Hoá đơn trả RTN-202608-00002 phải hoàn đúng số khách đã trả là 0đ (thực tế hoàn 580.000) | `/invoices` | `click text=RTN-202608-00002` | — | `no-text=580.000` |

> **S1 là lỗi tôi từng báo nhầm là đạt.** Ở vòng 1 bước này xanh và được ghi là verify AC-25,
> nhưng lúc đó công cụ chưa so sánh gì — nó xanh chỉ vì trang mở được. Khi thêm assertion thật
> thì lộ ra dòng "Khuyến mại" vẫn render trên giỏ rỗng, đúng triệu chứng mà US-08 sinh ra để
> sửa. **AC-25 hiện KHÔNG đạt.**

## Not verified here

Xem `## Notes` — phần lớn AC của lát cắt này cần **một giỏ hàng dựng sẵn**, việc mà 4 động từ
của runner (`click` / `fill` / `wait` / `scroll`) không dựng nổi trong một bước.

- **AC-23, AC-24** — giảm giá tay **mức hoá đơn** (bắt buộc lý do, radio phạm vi). **Chưa được
  cài đặt**: không có cột `invoices.manual_discount_reason`, không có `ManualDiscountInput`
  trên `EvaluateCartDto`/`CheckoutV2Dto`, không có form mức hoá đơn. `UOW-06` vẫn
  `status: todo`. Thứ đang tồn tại là `LineDiscountDialog` — giảm giá tay **mức dòng**, mở từ
  menu ngữ cảnh của dòng hàng. Đây là khoảng trống thật, không phải bước hỏng.
- **AC-02, AC-03, AC-04** — gộp lời gọi khi quét nhanh, preview lỗi không chặn bán hàng, giỏ
  rỗng không gọi: là hành vi **mạng**, không phải hành vi màn hình. Ảnh chụp không phân biệt
  được "2 lời gọi" với "5 lời gọi"; cần một assertion trên network log mà runner không có.
- **AC-05, AC-06, AC-07** — `skippedPrograms` kèm lý do: cần dựng tình huống tranh chấp CTKM
  (hai chương trình cùng trỏ một SKU), ngoài lát cắt "Giảm giá hoá đơn".
- **AC-09…AC-17** — chọn CTKM tuỳ chọn, hoán đổi, quà tặng: ngoài lát cắt này.
- **AC-18…AC-22** — voucher: ngoài phạm vi theo quyết định của người yêu cầu.
- **AC-28, AC-33, AC-34, AC-35, AC-36, AC-37** — bỏ chọn / loại trừ CTKM. Nút `X` **đã hiện**
  cạnh dòng "Khuyến mại" trong ảnh S2 và S3, nhưng chứng minh hành vi cần một bước bấm rồi
  chụp lại; chưa dựng.
- **AC-29, AC-30, AC-31, AC-32** — breakdown trên hoá đơn **in**. Ảnh S4 chỉ chứng minh danh
  sách hoá đơn mở được, **không** chứng minh nội dung bản in. Hoá đơn in mở trong cửa sổ
  print riêng, runner không chụp được.

## Notes

- Chạy bằng `admin@erp.local`, chi nhánh **HCM** — chỉ chi nhánh này còn tồn `DD850` và
  `VI580`. Phiên POS lưu chi nhánh vào `localStorage`, nên `post_login` trong `.ai/aidlc.yaml`
  chọn radio chi nhánh **đầu tiên**; nếu radio đầu không phải HCM thì bước sẽ chụp nhầm chi
  nhánh. Ghim bằng `LOCAL_POS_BRANCH_ID` khi cần.
- **Phiên đăng nhập chỉ dùng được một lần.** Refresh token của cả hai app xoay vòng, nên
  `.ai/.auth/<env>.json` đã lưu sẽ bị từ chối ở lần chạy kế tiếp
  ("redirected to sign-in — the session was not accepted"). Xoá file đó trước mỗi lần chạy:
  `rm -f .ai/.auth/local-pos.json`.
- Số học của lát cắt **không** được chứng minh bằng ảnh mà bằng số thật, chạy qua đúng saga
  `POST /v2/pos/checkout` (`VITE_CHECKOUT_V2=true`) trên hoá đơn `INV-202608-00003`:

  | Đại lượng | Giá trị |
  | --- | ---: |
  | Tiền hàng | 1.430.000 |
  | KM theo mặt hàng (`ITEM_DISCOUNT` 20% trên VI580) | 116.000 |
  | KM theo hoá đơn (`INVOICE_DISCOUNT` 10%, chỉ hàng chưa KM) | 85.000 |
  | Còn phải thu | 1.229.000 |
  | Điểm tích (`floor(1.229.000 / 10.000)`) | **122** |

  Preview (`/v2/promotions/evaluate`) và kết quả saga lệch **0₫** — đúng success signal #2 của
  `00-intent.md`.
