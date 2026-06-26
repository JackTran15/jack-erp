# TC-10 — Journey: Đổi trả hàng hóa

## Phạm vi

Kiểm tra luồng trả hàng và đổi hàng tại POS: trả hàng từ hóa đơn đã bán, hoàn tiền mặt, đổi hàng cùng giá trị và kiểm tra tồn kho tăng sau khi trả.

**Người thực hiện mặc định:** Nhân viên (`staff-hcm@test.com`)  
**Môi trường:** POS Web — Chi nhánh HCM  
**Điều kiện chung:** Có ít nhất 1 hóa đơn PAID từ TC-03 (đã bán TSNAM-A-38, 2 đôi, giá 800,000/đôi); biết mã hóa đơn gốc

---

### TC-10-001: Trả hàng từ hóa đơn đã bán — hoàn tiền mặt

> **Mục tiêu:** Xác nhận khách hàng có thể trả hàng, tồn kho được hoàn lại và tiền hoàn về tay khách

**Điều kiện:** Hóa đơn gốc status = PAID; đã bán 2 đôi TSNAM-A-38 tại vị trí A-01, đơn giá 800,000; biết tồn kho hiện tại  
**Người thực hiện:** Nhân viên

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Ghi nhận tồn kho TSNAM-A-38 tại A-01 trước khi trả | Ví dụ: 18 đôi |
| 2 | Vào POS → **Đổi trả hàng** | Màn hình đổi trả hiển thị |
| 3 | Tìm kiếm hóa đơn gốc bằng mã hoặc tên khách | Hóa đơn gốc hiển thị với các dòng hàng |
| 4 | Chọn mặt hàng `Giày thể thao Nam A (38)`, số lượng trả = 1 | Dòng trả xuất hiện; maxReturnable = 2 (chưa trả lần nào) |
| 5 | Chọn phương thức hoàn tiền: **Tiền mặt** | Số tiền hoàn = đơn giá × 1 = 800,000 |
| 6 | Xác nhận trả hàng | Hóa đơn trả POSTED; trạng thái = PAID |
| 7 | Kiểm tra tồn kho TSNAM-A-38 tại A-01 | = 18 + 1 = 19 (tồn tăng) |

**Kiểm tra thêm:**
- [ ] Hóa đơn trả có type = RETURN
- [ ] Stock ledger entry: RETURN_IN hoặc GOODS_ISSUE (direction=IN), quantity = +1
- [ ] `returnedQuantity` trên dòng hóa đơn gốc = 1 (đã trả 1 trong 2)

---

### TC-10-002: Đổi hàng (Exchange) — đổi cùng giá trị, không cần thanh toán thêm

> **Mục tiêu:** Xác nhận luồng đổi hàng: trả lại hàng cũ, lấy hàng mới cùng giá, không phát sinh thêm tiền

**Điều kiện:** Hóa đơn gốc PAID; còn lại 1 đôi TSNAM-A-38 chưa trả; TSNAM-A-39 có tồn kho  
**Người thực hiện:** Nhân viên

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào POS → Đổi trả → tìm hóa đơn gốc | |
| 2 | Chọn **Đổi hàng** (Exchange mode) | Giao diện đổi hàng hiển thị 2 phần: hàng trả và hàng lấy |
| 3 | Phần **Hàng trả**: chọn `Giày thể thao Nam A (38)`, SL=1 (giá = 800,000) | |
| 4 | Phần **Hàng lấy**: thêm `Giày thể thao Nam A (39)`, SL=1 (giá = 800,000) | Net amount = 800,000 - 800,000 = 0 |
| 5 | Xác nhận đổi hàng | Hóa đơn exchange POSTED; không cần thanh toán thêm |
| 6 | Kiểm tra tồn kho TSNAM-A-38 | Tăng 1 (trả về) |
| 7 | Kiểm tra tồn kho TSNAM-A-39 | Giảm 1 (lấy ra) |

**Kiểm tra thêm:**
- [ ] Hóa đơn có type = EXCHANGE
- [ ] Có cả dòng RETURN_IN (TSNAM-A-38 vào kho) và SALE_ISSUE (TSNAM-A-39 ra kho)

---

### TC-10-003: Kiểm tra tồn kho tăng sau trả hàng

> **Mục tiêu:** Xác nhận báo cáo tồn kho và ledger phản ánh đúng sau đổi trả

**Điều kiện:** Đã thực hiện TC-10-001 và TC-10-002  
**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào Backoffice → **Tồn kho** → tìm TSNAM-A-38 | Tồn = (tồn ban đầu - đã bán + đã trả) |
| 2 | Vào lịch sử ledger TSNAM-A-38 | Thấy entry RETURN_IN với quantity dương |
| 3 | Vào **Báo cáo → Bảng kê hóa đơn** → lọc type RETURN | Hóa đơn trả hàng xuất hiện |
| 4 | Xem chi tiết hóa đơn trả | Tham chiếu đến hóa đơn gốc; thông tin hoàn tiền |

---

## Trường hợp biên & trường hợp lỗi

### TC-10-EF-001: Trả hàng vượt quá số lượng đã mua

> **Mục tiêu:** Xác nhận không thể trả nhiều hơn số lượng đã mua (maxReturnable)

**Điều kiện:** Hóa đơn gốc đã bán 2 đôi TSNAM-A-38; chưa trả lần nào (maxReturnable = 2)

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào Đổi trả → tìm hóa đơn gốc → chọn TSNAM-A-38 | maxReturnable hiển thị = 2 |
| 2 | Nhập số lượng trả = 3 | Hệ thống báo lỗi: số lượng trả (3) vượt quá tối đa có thể trả (2) |

---

### TC-10-EF-002: Trả hàng từ hóa đơn DRAFT hoặc CANCELLED

> **Mục tiêu:** Xác nhận chỉ hóa đơn PAID/DEBT/PARTIAL_DEBT mới có thể trả hàng

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Tìm kiếm hóa đơn DRAFT hoặc CANCELLED để trả hàng | Hóa đơn không xuất hiện trong danh sách cho phép trả |
| 2 | Gọi API `GET /invoices/:id/eligible-returns` với invoiceId của DRAFT | Server trả về 400 hoặc [] (không có dòng nào trả được) |

---

### TC-10-EF-003: Trả hàng từ hóa đơn đã trả hết (đã trả đủ số lượng)

> **Mục tiêu:** Xác nhận không thể trả thêm khi đã trả hết số lượng của một dòng hàng

**Điều kiện:** Hóa đơn gốc bán 2 đôi; đã trả đủ 2 đôi (sau TC-10-001)

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Tìm hóa đơn gốc → xem dòng TSNAM-A-38 | maxReturnable = 0 (đã trả hết) |
| 2 | Cố trả thêm 1 đôi TSNAM-A-38 | Hệ thống không cho chọn dòng hàng này; hoặc báo lỗi SL trả = 0 |
