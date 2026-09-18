---
id: UOW-01
slug: reopen-item-discount
title: Tạo được chương trình "Giảm giá hàng hóa" trở lại
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09]
risk: low
status: todo
rollback: khôi phục `.filter(...)` trong `ADD_NEW_TYPE_OPTIONS` — mục menu biến mất, không dữ liệu nào phải dọn
---

# UOW-01 — Tạo được chương trình "Giảm giá hàng hóa" trở lại

## Demo script
1. Đăng nhập backoffice, vào **Khuyến mại → Chương trình khuyến mại**
2. Bấm **Thêm mới** → menu con hiện 2 mục; chọn **Giảm giá hàng hóa**
3. Điền tên, thời gian hiệu lực; ở lưới hàng hóa chọn `SKU-685`, đặt giảm **10%**
4. Bấm **Lưu** → danh sách hiện chương trình mới với mã `KM…`, cột Hình thức là *Giảm giá hàng hóa*
5. Mở lại chính bản ghi đó → mọi trường đúng như lúc lưu, lưới hàng không nhân đôi dòng
6. Sang POS, thêm `SKU-685` vào giỏ → giá giảm còn **616.500**, phần giảm **68.500**

## In scope
- Mở lối vào hình thức `PRODUCT_DISCOUNT` trên menu **Thêm mới**
- Chứng minh toàn bộ vòng đời sau 5 tuần tắt đèn: tạo → lưu xuống DB → đọc lại → áp dụng ở POS
- Ba kiểu giảm của hình thức này: `PERCENT`, `AMOUNT`, `FIXED_PRICE` (đồng giá)
- Chọn theo nhóm hàng cha, chạm tới hàng ở nhóm con

## Not in scope
- Phạm vi áp dụng của **giảm giá hóa đơn** — đó là UOW-02
- Ba hình thức còn lại vẫn ẩn (A-04)

## Risks
| Risk | Mitigation |
| --- | --- |
| Đường ghi `ITEM_DISCOUNT` đã tắt 5 tuần, có thể đã mục trong lúc đó mà không ai biết | T-01-02/03 đi thẳng qua API và đọc lại DB, không tin vào việc "code vẫn còn đó" |
| `GoodsDiscountGrid` có thể phụ thuộc trạng thái form mà nhánh invoice-discount không còn set | T-01-03 kiểm round-trip đầy đủ, là chỗ lộ ra sớm nhất |
| Không có test runner phía web (A-17/A-18) nên AC-01/AC-02 không có unit test | Chứng minh bằng ảnh chụp trình duyệt ở T-03-02 |

## Definition of done
- [x] AC-01..AC-09 có test phủ và xanh — AC-01/02 bằng ảnh chụp, AC-03..09 bằng `promotion-item-discount.e2e-spec.ts` (7/7)
- [x] **(trước khi merge, từ T-01-01)** Menu **Thêm mới** hiện đúng 2 mục trên màn hình thật — AC-01 ✅ 2026-09-18
- [x] **(trước khi merge, từ T-01-01)** Chọn *Giảm giá hàng hóa* mở form `?type=PRODUCT_DISCOUNT` và render lưới hàng hóa — AC-02 ✅ 2026-09-18
- [x] Menu **Thêm mới** hiện đúng 2 mục, không nhiều hơn (A-04) ✅
- [x] Không file nào ngoài `touches:` của các ticket bị đụng
- [x] Demo chạy được từ đầu tới cuối trên máy local — bước 1–5 xong (xem `07-verification.md`); bước 6 (POS hiện 616.500) ✅ 2026-09-18 — `evidence/POS-01-sku685-616500.png`
