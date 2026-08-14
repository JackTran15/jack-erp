---
feature: footer-grand-totals-pos-pagesize1
environments: [local-pos]
viewports: [desktop]
---

# Verification — lật trang thật ở hai bảng POS (bản vá tạm: 1 dòng/trang)

Dữ liệu thật ở HCM quá ít (5 đơn đủ điều kiện trả, 9 hoá đơn của "Khách quen") trong khi UI chỉ cho
chọn cỡ trang 50/100 ⇒ lưới luôn vừa một trang, không dựng được cảnh lật trang. Bằng chứng dưới đây
chụp với **một bản vá tạm, đã revert ngay sau khi chạy**:

```diff
-export const RETURN_GOODS_DEFAULT_PAGE_SIZE = 100;
+export const RETURN_GOODS_DEFAULT_PAGE_SIZE = 1;
-const PURCHASE_HISTORY_PAGE_SIZE = 100;
+const PURCHASE_HISTORY_PAGE_SIZE = 1;
```

Bản vá **chỉ đổi cỡ trang mặc định**, không đụng vào logic phân trang, tính `totalPages`, reset trang
hay cách đọc `totals`. Nghĩa là những gì các bước dưới chứng minh cũng đúng với code sẽ ship — chỉ là
với dữ liệu hiện tại thì không bấm tới được.

Bằng chứng của **code sẽ ship** nằm ở `.ai/features/footer-grand-totals-pos/` (7 bước) và
`09-api-probe.md` của thư mục đó.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Đổi trả hàng, "Toàn bộ", 1 dòng/trang: 5 trang, đang ở trang 1 | `/return-goods` | `click [aria-label="Lọc theo khoảng thời gian"]; click [role="option"]:has-text("Toàn bộ"); click button:has-text("Áp dụng")` | AC-10 | `text=1-1/5 kết quả` |
| S2 | Sang trang 2: lưới đổi dòng nhưng footer vẫn **24.888.000** — tổng toàn tập, không phải tổng trang | `/return-goods` | `click [aria-label="Lọc theo khoảng thời gian"]; click [role="option"]:has-text("Toàn bộ"); click button:has-text("Áp dụng"); click [aria-label="Trang sau"]` | AC-12 | `text=2-2/5 kết quả` |
| S3 | Vẫn ở trang 2, footer không đổi | `/return-goods` | `click [aria-label="Lọc theo khoảng thời gian"]; click [role="option"]:has-text("Toàn bộ"); click button:has-text("Áp dụng"); click [aria-label="Trang sau"]` | AC-12 | `text=24.888.000` |
| S4 | Đang ở trang cuối (5/5) rồi mới lọc cột "Tổng thanh toán" ≤ 1.500.000: lưới quay về trang 1, không hiện trang trống | `/return-goods` | `click [aria-label="Lọc theo khoảng thời gian"]; click [role="option"]:has-text("Toàn bộ"); click button:has-text("Áp dụng"); click [aria-label="Trang cuối"]; fill thead tr:nth-child(2) td:nth-child(5) input = 1500000` | AC-11 | `text=1-1/3 kết quả` |
| S5 | Lịch sử mua hàng, 1 dòng/trang: 9 trang | `/` | `fill input[placeholder="(F4) SDT, tên khách hàng"] = Khách quen; wait [role="option"]; click [role="option"]:has-text("Khách quen"); click [aria-label^="Xem chi tiết khách"]; click text=Lịch sử mua hàng` | AC-10 | `text=1-1/9 kết quả` |
| S6 | Sang trang 2: footer vẫn **13.178.000** | `/` | `click [aria-label^="Xem chi tiết khách"]; click text=Lịch sử mua hàng; click [aria-label="Trang sau"]` | AC-12 | `text=13.178.000` |
| S7 | Ở trang cuối (9/9) rồi lọc "Tổng thanh toán" ≤ 1.500.000: về trang 1 | `/` | `click [aria-label^="Xem chi tiết khách"]; click text=Lịch sử mua hàng; click [aria-label="Trang cuối"]; fill thead tr:nth-child(2) td:nth-child(5) input = 1500000` | AC-11 | `text=1-1/8 kết quả` |

## Notes

- S6/S7 phụ thuộc thứ tự: khách đã chọn ở S5 nằm trong store phiên nên ô tìm khách biến mất, thay
  bằng thẻ khách — các bước sau mở dialog thẳng từ thẻ đó.
- Ô "Số dòng/trang" hiện **trống** trên ảnh: `PosSelect` chỉ hiển thị giá trị nằm trong
  `pageSizeOptions` (`[50, 100]`), mà bản vá tạm đặt cỡ trang = 1. Hệ quả của bản vá, không phải lỗi.
- Chạy xong đã revert bản vá và chạy lại đủ 7 bước của `footer-grand-totals-pos` trên code sẽ ship —
  vẫn xanh.
- Gieo phiên POS gắn chi nhánh HCM trước mỗi lần chạy (xem Notes của `footer-grand-totals-pos`).
