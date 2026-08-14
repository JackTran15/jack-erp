# Release note — Footer tổng toàn tập (chuẩn hoá + POS)

## Thay đổi người dùng thấy được

### 1. Dòng tổng ở chân bảng là tổng của **toàn bộ** kết quả lọc

Trước đây các bảng cộng những dòng đang hiển thị trên trang hiện tại, nên con số đổi khi lật trang
hoặc đổi số dòng/trang. Nay server tính tổng trên đúng tập đang lọc; đổi trang không làm đổi tổng,
đổi bộ lọc thì cả lưới và tổng cùng đổi.

Áp dụng cho: 3 phiếu kho (Nhập/Xuất/Chuyển kho), Tổng hợp tồn kho, 8 báo cáo kho, và ba bảng POS
(Danh sách hóa đơn, Đổi trả hàng, Lịch sử mua hàng).

**Hệ quả cần biết:** con số ở footer thường **khác** tổng nhẩm của các dòng đang nhìn. Đó là đúng.

### 2. Đổi trả hàng và Lịch sử mua hàng lật được trang

Hai bảng này trước đây ghim cứng 100 dòng đầu và thanh phân trang chỉ để trang trí — phần dữ liệu
còn lại không xem được và không có dấu hiệu gì báo là đang bị cắt. Nay hai bảng đọc đúng tổng số
dòng của server, chuyển trang và đổi cỡ trang được. Đổi bộ lọc luôn đưa về trang 1.

### 3. ⚠️ Ô lọc "Tổng thanh toán" ở tab Lịch sử mua hàng đổi ý nghĩa

- **Trước:** lọc theo số tiền **đã thu** (`total_paid`). Hoá đơn ghi nợ có `total_paid = 0` nhưng cột
  vẫn hiển thị nguyên giá trị, nên lọc `≤ X` trả về mọi đơn chưa thu bất kể con số đang nhìn.
- **Sau:** lọc theo **đúng con số đang hiển thị ở cột đó** (giá trị hoá đơn, mang dấu âm với phiếu
  trả/đổi).

Thói quen cũ "lọc `≤ 0` để lọc ra đơn chưa thu" **không còn đúng** — nay nó trả về các phiếu hoàn
tiền. Muốn xem công nợ, dùng tab "Công nợ".

### 4. Lịch sử mua hàng: "Tổng hóa đơn: N" và tiền ở footer nay cùng một tập

Bộ lọc trạng thái (chỉ tính giao dịch thật: đã thanh toán / ghi nợ / ghi nợ một phần / đã huỷ) đã
chuyển xuống server. Trước đây frontend loại dòng **sau khi** tải, nên số đếm (của server) và số tiền
(của các dòng còn lại) nói về hai tập khác nhau.

## Thay đổi kỹ thuật cần biết khi tích hợp

- `POST /v2/invoices/purchase-history/search`: trường lọc `totalPaid` **đổi tên** thành `totalAmount`
  và đổi đại lượng (xem mục 3). Không giữ song song — tên cũ nói dối về thứ nó lọc.
- Ba endpoint POS (`/v2/invoices/search`, `/v2/invoices/returnable/search`,
  `/v2/invoices/purchase-history/search`) thêm `totals: { totalAmount }` vào response.
- `packages/api-client` đã sinh lại (`openapi.snapshot.json` + `src/generated/schema.ts`).
