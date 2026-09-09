---
id: UOW-03
slug: auto-open-single-match
title: Khớp đúng một card thì mở dialog chọn biến thể
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-04]
verifies: [AC-10, AC-11, AC-12, AC-13]
risk: medium
status: todo
rollback: một commit revert; hook mới, gỡ ra là hết
---

# UOW-03 — Đúng một card thì mở dialog

## Demo script

1. Mở POS, gõ `ABA2777` (một mã sản phẩm gom nhiều biến thể) rồi dừng tay.
2. Lưới còn đúng một card **và** dialog chọn biến thể tự mở, không cần Enter hay click (AC-10).
3. Đóng dialog, không sửa ô tìm → dialog **không** bật lại (AC-12).
4. Gõ thêm một ký tự cho khớp 0 card → không dialog nào mở, lưới hiện trạng thái trống (AC-13).
5. Xoá về `AK59` (khớp 6 card) → không dialog nào mở (AC-13).
6. Tìm một từ khoá khớp >20 card, sang trang 2 nếu trang 2 chỉ còn 1 card → dialog
   **không** mở, vì `total` vẫn lớn hơn 1 (AC-11).
7. Quét mã vạch trúng SKU → vào thẳng giỏ, không dialog (AC-08 giữ nguyên qua UOW-02).

## In scope

- `lib/page-libs/checkout/catalog-auto-open.ts` — hàm thuần quyết định có mở hay không.
- `hooks/page-hooks/checkout/use-checkout-catalog-auto-open.ts` — hook mỏng gọi hàm đó.
- Mount hook ở `ProductCatalogGrid` (nơi đã có cả kết quả lưới lẫn `useCheckoutVariantSelection`).

## Not in scope

- Đóng dialog thay người dùng khi họ gõ tiếp.
- `openForItem` / `openForQuery` — hai đường mở dialog sẵn có, không đụng.

## Risks

| Risk | Mitigation |
|---|---|
| Dialog bật lại ngay sau khi đóng | ADR-03: guard theo từ khoá trong `useRef`, không xoá khi đóng. Bước 3 Demo script |
| Dialog nhảy ra giữa lúc đang gõ | Chỉ chạy trên giá trị đã debounce 150 ms, và chỉ khi `total === 1` |
| Quét mã vạch vừa thêm hàng vừa mở dialog | A-05: nhánh `added` xoá ô tìm ⇒ không còn `search` ⇒ `total` là toàn catalog. Bước 7 kiểm |

## Definition of done

- [x] **Bước 1–3 chạy thật trên trình duyệt**: gõ `ABA2777` → lưới còn 1 card và dialog
      chọn biến thể **tự mở**, đúng dialog trong ảnh 3 (size 38–44, màu D/N, bảng SKU
      kèm mã vạch). Không Enter, không click (AC-10)
- [x] Đóng dialog, không sửa ô tìm → **không** bật lại, dù ô vẫn giữ `ABA2777` và lưới
      vẫn đúng 1 card (AC-12)
- [x] Network panel xác nhận chuỗi đúng: một GET `search=ABA2777` rồi một GET
      `catalog/products/9799c349-…?kind=PRODUCT` — tức dialog mở từ đúng card
- [x] Luật quyết định nằm trong hàm thuần `shouldAutoOpenVariant`, không lẫn trong effect
- [x] `pnpm --filter @erp/pos-web exec tsc --noEmit` sạch; `build` xanh
- [x] Ticket ghi rõ file `.test.ts` chưa chạy được trong repo này

## Còn lại (cần bạn chạy)

**Bước 4–6**: khớp 0 card và khớp 6 card (AC-13) — quan sát được gián tiếp (gõ `AK59` ra
6 card và không dialog nào mở), nhưng chưa thử riêng ca 0 card. **Bước 6** (`total > 1`
mà trang chỉ còn 1 card, AC-11) cần một từ khoá khớp >20 card rồi sang trang 2 — lưới
hiện chỉ tải 1 trang nên chưa dựng được ca này trên UI.

**Bước 7** (quét mã vạch không mở dialog): cùng lý do như UOW-02 — sẽ ghi vào hoá đơn
nháp của bạn.
