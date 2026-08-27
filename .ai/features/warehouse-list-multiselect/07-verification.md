---
feature: warehouse-list-multiselect
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Chọn nhiều phiếu trên bốn tab kho

Bốn tab kho dùng chung một cột checkbox, nên bốn nhóm bước dưới đây là cùng một kịch
bản chạy trên bốn route khác nhau. Điều cần chứng minh là **ô tick và con trỏ dòng
đang xem đã tách rời**: tick nhiều dòng cùng lúc được, và tick không kéo panel chi
tiết đi theo.

Assertion khoá vào hai con số đọc được từ DOM:

- `count input[aria-label="Chọn dòng"]:checked = n` — số dòng đang tick. Trước thay
  đổi này con số đó không bao giờ vượt quá 1, nên chính nó là ranh giới giữa bản cũ
  và bản mới.
- `count input[aria-label="Chọn tất cả dòng đang hiển thị"] = 1` — ô Chọn tất cả trên
  header, thứ trước đây không tồn tại (`<span class="sr-only">Chọn</span>`).

Điều DSL assertion **không** phát biểu được là "không có request nào bay đi". `text=`
và `count` chỉ đọc DOM, không đọc Network. Bằng chứng cho phần đó nằm ở chỗ khác:
ảnh S2 cho thấy panel "Chi tiết" vẫn đứng nguyên ở phiếu đầu sau khi tick ba dòng
khác — panel chỉ đổi khi query `["goods-receipt", selectedId]` đổi khoá, nên panel
đứng yên đồng nghĩa `selectedId` không đổi, đồng nghĩa không có lượt fetch nào.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Nhập kho vừa tải: chưa ô nào được tick, ô Chọn tất cả có mặt trên header | `/inventory/purchase-orders` | `wait input[aria-label="Chọn dòng"]` | AC-04, AC-08 | `count input[aria-label="Chọn tất cả dòng đang hiển thị"] = 1; count input[aria-label="Chọn dòng"]:checked = 0` |
| S2 | Tick ba dòng liên tiếp — cả ba cùng tick, ô header thành gạch ngang, panel Chi tiết không đổi phiếu | `/inventory/purchase-orders` | `wait input[aria-label="Chọn dòng"]; click tbody tr:nth-child(1) input[aria-label="Chọn dòng"]; click tbody tr:nth-child(2) input[aria-label="Chọn dòng"]; click tbody tr:nth-child(3) input[aria-label="Chọn dòng"]` | AC-01, AC-03, AC-07 | `count input[aria-label="Chọn dòng"]:checked = 3; count input[aria-label="Chọn tất cả dòng đang hiển thị"]:indeterminate = 1; text=ABA2777-D-38` |
| S3 | Ô Chọn tất cả tick hết dòng đang hiển thị | `/inventory/purchase-orders` | `wait input[aria-label="Chọn dòng"]; click input[aria-label="Chọn tất cả dòng đang hiển thị"]` | AC-05 | `count input[aria-label="Chọn dòng"]:not(:checked) = 0` |
| S4 | Bấm lần nữa thì sạch tick | `/inventory/purchase-orders` | `wait input[aria-label="Chọn dòng"]; click input[aria-label="Chọn tất cả dòng đang hiển thị"]; click input[aria-label="Chọn tất cả dòng đang hiển thị"]` | AC-06 | `count input[aria-label="Chọn dòng"]:checked = 0` |
| S5 | Tick hai phiếu rồi In tem mã — trang In tem mã nhận hàng của cả hai | `/inventory/purchase-orders` | `wait input[aria-label="Chọn dòng"]; click tbody tr:nth-child(1) input[aria-label="Chọn dòng"]; click tbody tr:nth-child(2) input[aria-label="Chọn dòng"]; click text=In tem mã; wait text=Tổng số lượng tem` | AC-12, AC-14 | `text=Tổng số lượng tem` |
| S6 | Xuất kho: tick nhiều dòng, ô Chọn tất cả có mặt | `/inventory/goods-issues` | `wait input[aria-label="Chọn dòng"]; click tbody tr:nth-child(1) input[aria-label="Chọn dòng"]; click tbody tr:nth-child(2) input[aria-label="Chọn dòng"]` | AC-01, AC-03, AC-05 | `count input[aria-label="Chọn tất cả dòng đang hiển thị"] = 1; count input[aria-label="Chọn dòng"]:checked = 2` |
| S7 | Chuyển kho: tick nhiều dòng, ô Chọn tất cả có mặt, không mọc thêm nút In tem mã | `/inventory/stock-transfers` | `wait input[aria-label="Chọn dòng"]; click tbody tr:nth-child(1) input[aria-label="Chọn dòng"]; click tbody tr:nth-child(2) input[aria-label="Chọn dòng"]` | AC-03, AC-05 | `count input[aria-label="Chọn tất cả dòng đang hiển thị"] = 1; count input[aria-label="Chọn dòng"]:checked = 2; no-text=In tem mã` |
| S8 | Lệnh điều chuyển: tick nhiều dòng, ô Chọn tất cả có mặt, không mọc thêm nút In tem mã | `/inventory/transfer-orders` | `wait input[aria-label="Chọn dòng"]; click tbody tr:nth-child(1) input[aria-label="Chọn dòng"]; click tbody tr:nth-child(2) input[aria-label="Chọn dòng"]` | AC-01, AC-03, AC-05 | `count input[aria-label="Chọn tất cả dòng đang hiển thị"] = 1; count input[aria-label="Chọn dòng"]:checked = 2; no-text=In tem mã` |
| S9 | Tick dòng 1 và 3, rồi bấm ô Đối tượng của dòng 2 — panel Chi tiết đổi sang phiếu dòng 2, tick giữ nguyên | `/inventory/purchase-orders` | `wait input[aria-label="Chọn dòng"]; click tbody tr:nth-child(1) input[aria-label="Chọn dòng"]; click tbody tr:nth-child(3) input[aria-label="Chọn dòng"]; click tbody tr:nth-child(2) td:nth-child(4)` | AC-02 | `count input[aria-label="Chọn dòng"]:checked = 2; no-text=ABA2777-D-39` |
| S10 | Tick 2 phiếu rồi đổi số dòng mỗi trang 20 → 50 — tick còn nguyên | `/inventory/purchase-orders` | `wait input[aria-label="Chọn dòng"]; click tbody tr:nth-child(1) input[aria-label="Chọn dòng"]; click tbody tr:nth-child(2) input[aria-label="Chọn dòng"]; select label > select = 50` | AC-09 | `count input[aria-label="Chọn dòng"]:checked = 2` |
| S11 | Tick 2 phiếu rồi bấm Nạp — sạch tick | `/inventory/purchase-orders` | `wait input[aria-label="Chọn dòng"]; click tbody tr:nth-child(1) input[aria-label="Chọn dòng"]; click tbody tr:nth-child(2) input[aria-label="Chọn dòng"]; click text=Nạp` | AC-11 | `count input[aria-label="Chọn dòng"]:checked = 0` |
| S12 | Tick 2 phiếu rồi đổi Từ ngày — sạch tick | `/inventory/purchase-orders` | `wait input[aria-label="Chọn dòng"]; click tbody tr:nth-child(1) input[aria-label="Chọn dòng"]; click tbody tr:nth-child(2) input[aria-label="Chọn dòng"]; fill input[type="date"] = 2026-08-20` | AC-10 | `count input[aria-label="Chọn dòng"]:checked = 0` |
| S13 | Nhập kho, không tick ô nào, bấm In tem mã — in theo dòng đang xem như trước | `/inventory/purchase-orders` | `wait input[aria-label="Chọn dòng"]; click text=In tem mã; wait text=Tổng số lượng tem` | AC-13 | `text=Tổng số lượng tem; text=ABA2777-N-44` |
| S14 | Xuất kho, tick 2 phiếu rồi In tem mã — nhận hàng của cả hai | `/inventory/goods-issues` | `wait input[aria-label="Chọn dòng"]; click tbody tr:nth-child(1) input[aria-label="Chọn dòng"]; click tbody tr:nth-child(2) input[aria-label="Chọn dòng"]; click text=In tem mã; wait text=Tổng số lượng tem` | AC-12 | `text=Tổng số lượng tem` |
| S15 | Xuất kho, không tick ô nào, bấm In tem mã — in theo dòng đang xem như trước | `/inventory/goods-issues` | `wait input[aria-label="Chọn dòng"]; click text=In tem mã; wait text=Tổng số lượng tem` | AC-13 | `text=Tổng số lượng tem` |
| S16 | Chọn tất cả rồi In tem mã — giá bán về sẵn theo phiếu, không phải tra lại từng SKU | `/inventory/purchase-orders` | `wait input[aria-label="Chọn dòng"]; click input[aria-label="Chọn tất cả dòng đang hiển thị"]; click text=In tem mã; wait text=Tổng số lượng tem` | AC-12, AC-17 | `text=Tổng số lượng tem; text=750.000 VND` |
| S17 | Kiểm kê kho dựng được ô Chọn tất cả dùng chung, danh sách rỗng thì ô header vô hiệu | `/inventory/stock-takes` | `wait text=Chưa có phiếu kiểm kê` | AC-08 | `count input[aria-label="Chọn tất cả phiếu có thể gộp"] = 1; count input[aria-label="Chọn tất cả phiếu có thể gộp"]:disabled = 1; text=Gộp phiếu` |

## Not verified here

- **AC-09 phần lật trang** không dựng được trên dữ liệu dev: `TABLE_PAGE_SIZE_OPTIONS`
  nhỏ nhất là 20 và cả bốn tab kho đều dưới 20 dòng (`goods_receipts` có 17 bản ghi
  toàn hệ thống), nên không tồn tại trang 2 để bấm sang. S10 kiểm cùng một cơ chế bằng
  đường khác: đổi số dòng mỗi trang cũng là một thay đổi của `pagination`, và effect xóa
  tick cố ý không phụ thuộc `pagination` — nếu ai đó thêm `pagination` vào dependency
  array thì S10 đỏ ngay. Bước lật trang thật kiểm bằng tay khi có dữ liệu quá 20 dòng.
- **AC-15** (nút disabled trong lúc gom) và **AC-16** (một phiếu lỗi thì không điều
  hướng) cần giả lập mạng chậm và giả lập một phiếu bị xóa giữa chừng. DSL của runner
  chỉ có click/fill/select/wait/scroll, không chạm được vào lớp mạng, nên hai AC này
  không nằm trong `verifies:` của UOW-02 — chúng thuộc phần kiểm tay của Demo script
  UOW-02 bước 6–7. Traceability vẫn giữ: `T-02-02` khai cả hai trong `verifies:`, nên
  `uow_graph.py` vẫn tính đủ 16/16 AC.

## Notes

Chạy trên `local-backoffice` với chi nhánh có dữ liệu (`LOCAL_BACKOFFICE_BRANCH_NAME`
trong `credentials.env`). Chi nhánh kiểm thử không có phiếu nào nên mọi bước sẽ chụp
được bảng rỗng và vẫn xanh — đúng cái bẫy mà `post_login` trong `aidlc.yaml` dựng ra
để tránh.

`no-text=In tem mã` ở S7 và S8 là bằng chứng cho A-01: người dùng chốt hai trang này
chỉ nhận multi-select, không nhận nút in tem.

S15 cố ý **không** ghim SKU. Bản đầu assert `text=ABA2777-N-38` và đỏ ở lần chạy sau:
DB dev có thêm phiếu xuất mới, XK000013 rời khỏi dòng đầu nên dòng đang xem đổi sang
phiếu khác. Assertion đúng, dữ liệu đổi — nhưng một bước đỏ vì lý do đó không nói lên
điều gì về tính năng. Bằng chứng phân biệt cho AC-13 nằm ở S13 (Nhập kho), nơi phiếu
đầu ổn định.

S9 khoá vào dữ liệu seed: phiếu ở dòng 1 (NK000021) có 14 dòng hàng `ABA2777-D-38…44`
và `ABA2777-N-38…44`, còn phiếu ở dòng 2 (NK000020) chỉ có một dòng `ABA2777-D-38`.
Vì thế `no-text=ABA2777-D-39` là assertion nói được điều mà `text=` không nói được:
panel Chi tiết đã **rời khỏi** phiếu dòng 1, chứ không phải chỉ "vẫn có chữ trên màn".
Nếu dữ liệu seed đổi, bước này đỏ và phải sửa lại chuỗi SKU — đỏ đúng chỗ.

Chính bộ dữ liệu đó cũng là bằng chứng cho AC-14 ở S5: 14 dòng của NK000021 cộng
1 dòng `ABA2777-D-38` của NK000020 là 15 dòng thô, nhưng bảng in tem hiện **14 dòng**
với "Tổng số lượng tem 15" — đúng một dòng đã được gộp và cộng dồn số lượng.

S16 là bằng chứng cho AC-17. Ảnh chụp ngay sau khi trang In tem mã mount, trước khi bất
kỳ lượt tra giá bất đồng bộ nào kịp trả về — nên nhãn "Xem trước" hiện `750.000 VND`
đồng nghĩa giá đã đi kèm dữ liệu đổ sẵn từ phiếu, không phải do trang đích tự đi tra.
Nếu ai đó đưa `sellingPrice: 0` trở lại vào `toPrefillItems`, nhãn về "0 VND" và bước
này đỏ ngay.

Assertion ở đây là `text=750.000 VND` chứ không phải `no-text=0 VND`, và đó là bài học
từ một lần chạy đỏ oan: `"750.000 VND"` **chứa** chuỗi `"0 VND"`, nên phủ định trên chuỗi
con luôn sai kể cả khi màn hình đúng.

S10 dùng `label > select` để trỏ đúng ô số dòng mỗi trang: trang này còn một `<select>`
nữa là bộ lọc cột "Loại chứng từ", nhưng nó nằm trong `<th>` chứ không nằm trong `<label>`.
