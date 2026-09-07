---
feature: 2026083002-warehouse-voucher-detail-line-pagination
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Phân trang dòng hàng trong dialog xem chi tiết phiếu nhập / phiếu xuất

Chạy trên `local-backoffice` (:3000 → API :4000), sau khi **đã khởi động lại API `:4000`
bằng bản build mới** (Akenzy đồng ý 31/8/2026).

Bước khởi động lại đó là bắt buộc, không phải thủ tục: tiến trình `:4000` trước đó chạy một
bản `dist/` biên dịch lúc 10:20 sáng, tức là trước thay đổi này — `/docs-json` của nó không có
`includeLines`, nên FE mới gửi tham số đó sẽ ăn 400 từ `forbidNonWhitelisted`. Verify vào server
cũ cho ra **đỏ giả**: lỗi nằm ở bản build, không ở tính năng. Đã xác nhận sau khi khởi động lại:
`includeLines` có mặt trên cả hai route `/inventory/goods-issues/{id}` và `/goods-receipts/{id}`.

Chỉ `desktop`. Backoffice không có bố cục mobile: không `matchMedia`, không `useMediaQuery`,
và `BackofficeLayout` là vỏ desktop `ml-60` cố định.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Danh sách phiếu xuất mở được, có phiếu 120 dòng để mở | `/goods-issue` | `wait text=XK-VERIFY-120` | AC-05 | `text=XK-VERIFY-120` |
| S2 | Dialog xem chi tiết mở ra chỉ với một trang dòng, chân lưới hiện tổng CẢ phiếu | `/goods-issue` | `click text=XK-VERIFY-120; wait text=Số dòng` | AC-05, AC-06 | `text=Số dòng = 120` |
| S3 | Thanh phân trang hiện đúng dải trang đầu trên tổng 120 | `/goods-issue` | `click text=XK-VERIFY-120; wait text=Số dòng` | AC-06 | `text=120` |
| S4 | Dialog chi tiết phiếu nhập cũng chỉ tải một trang, chân lưới hiện tổng CẢ phiếu | `/purchase-orders` | `click text=PN-VERIFY-120; wait text=Số dòng` | AC-08 | `text=Số dòng = 120` |
| S5 | Lọc mã SKU của một dòng ở trang cuối, từ trang 1, tìm ra dòng đó | `/goods-issue` | `click text=XK-VERIFY-120; wait text=Số dòng; type <ô lọc cột Mã SKU> ${LAST_PAGE_SKU}; wait text=Số dòng = 1` | AC-11 | `text=Số dòng = 1` |
| S6 | Chân lưới theo tập đã lọc, không phải tổng phiếu | `/goods-issue` | *(tiếp S5)* | AC-14 | `text=Số dòng = 1` **và** không còn `text=Số dòng = 120` |
| S7 | Xoá bộ lọc thì quay lại toàn phiếu | `/goods-issue` | *(tiếp S6)* `clear <ô lọc>; wait text=Số dòng = 120` | AC-11 | `text=Số dòng = 120` |
| S8 | Lọc trên dialog phiếu nhập cũng chạy | `/purchase-orders` | `click text=PN-VERIFY-120; wait text=Số dòng; type <ô lọc cột Mã SKU> ${LAST_PAGE_SKU_PN}` | AC-11 | `text=Số dòng = 1` |

## Not verified here

- **AC-01, AC-02, AC-03, AC-04** — thứ tự dòng và backfill `line_no`: kiểm ở tầng dữ liệu,
  không phải bằng ảnh chụp. Migration đã chạy thật trên `erp_dev` (0 NULL, 0 trùng, mọi phiếu
  1..n liền mạch, revert rồi chạy lại vẫn sạch) và có 4 test trong
  `goods-issue.service.spec.ts`. Một ảnh chụp lưới không phân biệt được "đúng thứ tự nhập" với
  "đúng thứ tự ngẫu nhiên ổn định", nên chụp ở đây sẽ là bằng chứng giả.
- **AC-09** — hồi quy chế độ tạo/sửa: thuộc T-03-02, cần thao tác thêm/sửa/xoá dòng rồi lưu.
  Không gói được vào bốn động từ của bộ chạy.
- **AC-10** — in và xuất Excel đủ dòng: đã khoá bằng 4 test ở T-03-03. Kết quả là tệp tải về,
  không phải trạng thái màn hình.

## Bổ sung 2026-09-03 — lọc phía server

S5–S8 là bằng chứng của UOW-06 và **chỉ có nghĩa trên phiếu ≥ 200 dòng hoặc ít nhất trải
nhiều hơn một trang**. Mã SKU dùng để lọc phải là mã của một dòng nằm ở **trang cuối**:
lọc bằng mã của một dòng đang hiện trên trang 1 thì lưới không kiểm soát cũ cũng cho ra
kết quả y hệt, và ảnh chụp sẽ là bằng chứng giả — nó không phân biệt được bản đã sửa với
bản chưa sửa. Ghi lại mã đã dùng và vị trí dòng đó vào `08-evidence.md`.

**AC-15** (ba cột không có ô lọc) chụp được: header lưới ở chế độ xem, so với chế độ sửa.
**AC-16** (chế độ tạo/sửa vẫn lọc tại chỗ) **không** verify ở đây — nó cần thao tác
lọc-rồi-xoá-dòng-rồi-lưu, không gói được vào bốn động từ của bộ chạy; thuộc T-06-05.

**AC-12** (điều kiện lọc đi xuống server) cũng không verify ở đây: nó là một khẳng định về
tab Network, không phải về trạng thái màn hình. Đã khoá bằng test handler ở T-05-03.

Bẫy lặp lại: `:4000` phải chạy **bản build của nhánh này**. Endpoint `POST .../lines/search`
là route mới — server cũ trả 404 và triệu chứng trông y hệt "chưa cài đặt". Xác nhận bằng
`curl` vào `/docs-json` trước khi kết luận đỏ (`.ai/verify-stack.sh`).

## Notes

Hai phiếu `XK-VERIFY-120` và `PN-VERIFY-120` là **dữ liệu seed tạm** do bước verify tạo ra: mỗi phiếu 120 dòng, trạng
thái `DRAFT` nên **không** sinh bút toán kho (đã kiểm: 0 dòng trong `stock_ledger_entries`
cho cả hai). Trước
khi seed, phiếu lớn nhất trong `erp_dev` chỉ có 5 dòng (phiếu xuất) và 14 dòng (phiếu nhập) —
không phiếu nào vượt cỡ trang 50, nên không thể chụp được cảnh phân trang thật. Xoá cả hai
sau khi chụp xong.

Tài khoản `admin@erp.local`, chi nhánh "Hồ Chí Minh" (`post_login` tự chuyển).
