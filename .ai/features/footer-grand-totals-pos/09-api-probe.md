---
feature: footer-grand-totals-pos
kind: api-evidence
---

# Bằng chứng tầng API — bất biến trang & bất biến `limit`

Màn hình đã được kiểm bằng trình duyệt (ảnh chụp trong `evidence/local-pos/desktop/`), nhưng **không
dựng được cảnh lật trang trên UI**: chi nhánh HCM chỉ có ít dòng đủ điều kiện, còn cỡ trang nhỏ nhất
mà UI cho chọn là 50 ⇒ lưới luôn vừa một trang. API không bị ràng buộc đó, nên phần "footer không đổi
khi lật trang" được xác nhận bằng cách gọi thẳng endpoint với `limit = 2` rồi duyệt **hết** các trang.

Nếu footer bị tính theo trang — đúng lỗi đang sửa — `totals` sẽ đổi giữa các trang.

## Cách chạy lại

```bash
python3 .ai/features/footer-grand-totals-pos/probe-totals.py
```

Script tự đăng nhập, tự `switch-branch` sang HCM, thoát `1` nếu bất kỳ ô nào lệch. Không nhận số cứng
— nó so các lần gọi với nhau, nên dữ liệu `erp_dev` trôi cũng không làm hỏng bằng chứng.

## Kết quả — 14/08/2026, commit `3c7209c4`

| Bảng | Tập | Bất biến `limit` (1 / 5 / 100) | Bất biến trang (`limit=2`, mọi trang) |
| --- | ---: | --- | --- |
| Danh sách hóa đơn | 15 dòng / 26.122.000 | ✅ cùng totals | ✅ 8 trang, cùng totals, dòng không trùng |
| Đổi trả hàng | 5 dòng / 24.888.000 | ✅ cùng totals | ✅ 3 trang, cùng totals, dòng không trùng |
| Lịch sử mua hàng | 9 dòng / 13.178.000 | ✅ cùng totals | ✅ 5 trang, cùng totals, dòng không trùng |

Cột cuối kiểm ba thứ cùng lúc: `totals` giống trang 1, `total` giống trang 1, và các trang trả **dòng
khác nhau** (hợp lại đúng `total` id phân biệt) — nếu không, "bất biến" chỉ là do mọi trang trả cùng
một tập.

## Phủ AC

| AC | Trạng thái |
| --- | --- |
| AC-07 — bất biến `limit` | ✅ probe (cột 3) + unit test ba handler |
| AC-10 — không còn cắt cụt im lặng | ✅ màn hình (S3, S6: pager đọc `total` thật) + probe (duyệt hết trang, dòng không trùng) |
| AC-12 — footer không đổi khi lật trang | ✅ probe (cột 4) + ảnh UI trong `footer-grand-totals-pos-pagesize1` S2/S3/S6 (bản vá tạm cỡ trang = 1) |
| AC-11 — đổi bộ lọc thì về trang 1 | ✅ ảnh UI trong `footer-grand-totals-pos-pagesize1` S4/S7: đang ở trang cuối, gõ bộ lọc → về trang 1, không có trang trống. Probe API không nói được gì về AC này (state phía client) |

## Màn hình đã kiểm (ảnh trong `evidence/`)

| Màn hình | Bước |
| --- | --- |
| Danh sách hóa đơn | S1 |
| Đổi trả hàng | S2, S3, S4 |
| Lịch sử mua hàng (dialog khách → tab) | S5, S6, S7 |
