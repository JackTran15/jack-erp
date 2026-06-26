# TC-09 — Journey: Kiểm kê kho

## Phạm vi

Kiểm tra luồng kiểm kê kho: tạo phiếu kiểm kê, nhập số lượng đếm thực tế, xử lý phiếu và xác nhận hệ thống tự động tạo phiếu nhập/xuất điều chỉnh tồn.

**Người thực hiện mặc định:** Quản lý chi nhánh (`mgr-hcm@test.com`)  
**Môi trường:** Backoffice Web — Chi nhánh HCM  
**Điều kiện chung:** Biết chính xác tồn kho hiện tại của ít nhất 2 mặt hàng

---

### TC-09-001: Kiểm kê kho — đếm dư hàng → hệ thống tạo Phiếu Nhập điều chỉnh

> **Mục tiêu:** Xác nhận khi số đếm thực tế lớn hơn tồn hệ thống, hệ thống tạo GoodsReceipt để bù vào

**Điều kiện:** TSNAM-A-38 tồn kho hệ thống tại A-01 = X đôi  
**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Ghi nhận tồn kho hệ thống TSNAM-A-38 tại A-01 | Ví dụ: X = 18 đôi |
| 2 | Vào **Kho hàng → Kiểm kê kho → Tạo phiếu kiểm kê** | Form tạo kiểm kê hiển thị |
| 3 | Chọn kho: `Kho lưu trữ HCM`; nhập ngày kế hoạch | |
| 4 | Thêm mặt hàng: TSNAM-A-38, vị trí A-01 | Dòng kiểm kê xuất hiện; cột "Số lượng kỳ vọng" = X = 18 |
| 5 | Nhập "Số lượng đếm thực tế": `X + 2 = 20` | Chênh lệch = +2 hiển thị |
| 6 | Nhấn **Xử lý phiếu kiểm kê** | Xác nhận xử lý |
| 7 | Xác nhận | Phiếu kiểm kê POSTED; Phiếu nhập kho điều chỉnh tự động tạo và POSTED |
| 8 | Kiểm tra tồn kho TSNAM-A-38 tại A-01 | = 20 (tăng từ 18 lên) |
| 9 | Xem phiếu nhập kho vừa được tạo | Mục đích = STOCK_TAKE; số lượng = 2 |

**Kiểm tra thêm:**
- [ ] `generatedReceiptId` trong phiếu kiểm kê trỏ về GoodsReceipt
- [ ] GoodsReceipt purpose = STOCK_TAKE
- [ ] Stock ledger entry type = ADJUSTMENT_INCREASE, quantity = +2

---

### TC-09-002: Kiểm kê kho — đếm thiếu hàng → hệ thống tạo Phiếu Xuất điều chỉnh

> **Mục tiêu:** Xác nhận khi số đếm thực tế nhỏ hơn tồn hệ thống, hệ thống tạo GoodsIssue để trừ đi

**Điều kiện:** TAT-F (Tất thể thao) tồn kho hệ thống tại A-02 = Y  
**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Ghi nhận tồn kho hệ thống TAT-F tại A-02 | Ví dụ: Y = 12 đôi |
| 2 | Tạo phiếu kiểm kê mới cho `Kho lưu trữ HCM` | |
| 3 | Thêm mặt hàng: `TAT-F`, vị trí A-02 | Số lượng kỳ vọng = Y = 12 |
| 4 | Nhập số đếm thực tế: `Y - 2 = 10` | Chênh lệch = -2 |
| 5 | Xử lý phiếu kiểm kê | Phiếu POSTED; Phiếu xuất kho điều chỉnh tự động tạo và POSTED |
| 6 | Kiểm tra tồn kho TAT-F tại A-02 | = 10 (giảm từ 12) |
| 7 | Xem phiếu xuất kho vừa được tạo | Mục đích = STOCK_TAKE; số lượng = 2 |

**Kiểm tra thêm:**
- [ ] `generatedIssueId` trong phiếu kiểm kê trỏ về GoodsIssue
- [ ] Stock ledger entry type = ADJUSTMENT_DECREASE, quantity = -2

---

### TC-09-003: Xem phiếu nhập/xuất điều chỉnh tự động

> **Mục tiêu:** Xác nhận các phiếu điều chỉnh từ kiểm kê có thể tìm thấy trong danh sách nhập kho / xuất kho

**Điều kiện:** Đã thực hiện TC-09-001 và TC-09-002  
**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào **Kho hàng → Nhập kho** → lọc theo mục đích `Kiểm kê` | Phiếu từ TC-09-001 hiển thị |
| 2 | Xem chi tiết phiếu | Có tham chiếu đến phiếu kiểm kê (referenceType=STOCK_TAKE) |
| 3 | Vào **Kho hàng → Xuất kho** → lọc theo mục đích `Kiểm kê` | Phiếu từ TC-09-002 hiển thị |
| 4 | Xem chi tiết phiếu | Có tham chiếu đến phiếu kiểm kê |

---

## Trường hợp biên & trường hợp lỗi

### TC-09-EF-001: Xử lý phiếu kiểm kê không có dòng hàng

> **Mục tiêu:** Xác nhận không thể xử lý phiếu kiểm kê rỗng

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Tạo phiếu kiểm kê mới, không thêm dòng hàng nào | Phiếu DRAFT rỗng |
| 2 | Nhấn **Xử lý phiếu kiểm kê** | Hệ thống báo lỗi: phiếu phải có ít nhất 1 dòng hàng |

---

### TC-09-EF-002: Xử lý phiếu kiểm kê đã POSTED (xử lý lại)

> **Mục tiêu:** Xác nhận phiếu đã POSTED không thể xử lý lại

**Điều kiện:** Phiếu kiểm kê đã POSTED từ TC-09-001

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Mở phiếu đã POSTED | Hiển thị read-only |
| 2 | Cố nhấn **Xử lý** hoặc gọi API `POST /stock-takes/:id/process` | Hệ thống báo lỗi: phiếu đã được xử lý rồi |

---

### TC-09-EF-003: Số đếm thực tế bằng số kỳ vọng — không tạo phiếu điều chỉnh

> **Mục tiêu:** Xác nhận khi countedQty = expectedQty, hệ thống POSTED phiếu kiểm kê nhưng không tạo phiếu nhập/xuất

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Tạo phiếu kiểm kê, thêm `TAT-F`, nhập số đếm = đúng số kỳ vọng | Chênh lệch = 0 |
| 2 | Xử lý phiếu | Phiếu POSTED; không có `generatedReceiptId` và không có `generatedIssueId` |
| 3 | Kiểm tra tồn kho TAT-F | Không thay đổi |

---

### TC-09-004: Kiểm tra tồn kho sau khi kiểm kê

> **Mục tiêu:** Xác nhận báo cáo tồn kho phản ánh đúng sau điều chỉnh kiểm kê

**Điều kiện:** Đã thực hiện TC-09-001 và TC-09-002  
**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào **Báo cáo → Tổng hợp nhập xuất tồn kho** | Báo cáo hiển thị |
| 2 | Lọc theo ngày hôm nay, kho HCM | Thấy dòng điều chỉnh kiểm kê trong cột Nhập (+2) và Xuất (-2) |
| 3 | Vào **Tồn kho** → tìm TSNAM-A-38 và TAT-F | Số lượng tồn khớp với sau điều chỉnh |
