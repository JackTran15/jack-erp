# TC-03 — Journey: Bán hàng tại POS

## Phạm vi

Kiểm tra luồng bán hàng đầy đủ tại quầy: tạo hóa đơn nháp, chọn hàng, áp dụng giảm giá/điểm thành viên, checkout và kiểm tra tồn kho.

**Người thực hiện mặc định:** Nhân viên (`staff-hcm@test.com`)  
**Môi trường:** POS Web (`http://localhost:3001`) — Chi nhánh HCM  
**Điều kiện chung:** Đã hoàn thành TC-02. Tồn kho thực tế sau TC-02:

| SKU        | Tồn | Kho / Vị trí           |
| ---------- | --- | ---------------------- |
| TSNAM-A-38 | 25  | Kho lưu trữ HCM / A-01 |
| TSNAM-A-39 | 10  | Kho lưu trữ HCM / A-01 |
| TSNAM-A-40 | 5   | Kho lưu trữ HCM / A-01 |
| TAT-F      | 20  | Kho lưu trữ HCM / A-02 |

> **"Đơn giá" trong POS = Giá bán** (lấy từ `sellingPrice` mặc định của hàng hoá). Ghi vào `InvoiceItem.unitPrice`. Giá vốn (`costPrice`) được server tự điền từ giá mua mặc định của item — không nhập thủ công.

---

### TC-03-001: Bán hàng cơ bản — khách vãng lai, thanh toán tiền mặt đủ

> **Mục tiêu:** Xác nhận luồng bán hàng cơ bản hoàn chỉnh: tạo hóa đơn → checkout → trạng thái PAID

**Điều kiện:** TSNAM-A-38 (SKU TSNAM-A-38) tồn kho ≥ 2 tại vị trí A-01 (hoặc SH-01)  
**Người thực hiện:** Nhân viên

| Bước | Thao tác                                                                      | Kết quả mong đợi                                          |
| ---- | ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1    | Đăng nhập POS → chọn Chi nhánh HCM                                            | Màn hình POS bán hàng hiển thị                            |
| 2    | Tìm kiếm hàng `Giày thể thao Nam A (38)` (SKU: TSNAM-A-38), nhấn thêm vào giỏ | Sản phẩm xuất hiện trong giỏ hàng, SL=1                   |
| 3    | Tăng số lượng lên 2                                                           | SL=2, thành tiền = 1,600,000 (2 × 800,000)                |
| 4    | Nhấn **Thanh toán**                                                           | Màn hình thanh toán mở ra                                 |
| 5    | Chọn phương thức: Tiền mặt, nhập số tiền = 1,600,000                          | Số tiền khớp, tiền thừa = 0                               |
| 6    | Nhấn **Xác nhận thanh toán**                                                  | Hóa đơn được tạo, trạng thái = PAID                       |
| 7    | Xem hóa đơn vừa tạo                                                           | Mã hóa đơn được tạo (dạng INV-...), hiển thị đủ thông tin |

**Kiểm tra thêm:**

- [x] Hóa đơn status = PAID
- [x] `isDraft = false`
- [x] Tồn kho TSNAM-A-38 giảm đúng số lượng đã bán (= 25 - 2 = 23)

---

### TC-03-002: Bán hàng cho khách có tài khoản → kiểm tra tích điểm

> **Mục tiêu:** Xác nhận điểm thành viên được cộng vào tài khoản khách hàng sau khi checkout

**Điều kiện:** KH-001 tồn tại với membership card ACTIVE, điểm hiện có = 0; tỷ lệ tích: 1 điểm / 10,000 VNĐ mua; tỷ lệ đổi: 1 điểm = 500 VNĐ. **Role Nhân viên cần có quyền `customer.write`** (để tạo/tìm khách hàng từ POS)  
**Người thực hiện:** Nhân viên

| Bước | Thao tác                                               | Kết quả mong đợi                                         |
| ---- | ------------------------------------------------------ | -------------------------------------------------------- |
| 1    | Tạo hóa đơn mới trong POS                              |                                                          |
| 2    | Tìm kiếm và thêm khách hàng `KH-001 - Nguyễn Văn A`    | Khách hàng được gán vào hóa đơn, hiển thị thẻ thành viên |
| 3    | Thêm `Giày thể thao Nam A (38)`, SL=1, đơn giá 800,000 | Tổng = 800,000                                           |
| 4    | Thanh toán tiền mặt đủ 800,000 → Xác nhận              | Hóa đơn PAID                                             |
| 5    | Kiểm tra tài khoản KH-001 → xem điểm thành viên        | Điểm = 0 + 80 = 80 điểm (800,000 ÷ 10,000 = 80 điểm)     |

**Kiểm tra thêm:**

- [x] Điểm tích được = floor(amountPaid / pointsValueVnd)
- [x] Lịch sử điểm của KH-001 có giao dịch mới

---

### TC-03-003: Bán hàng dùng điểm thành viên để giảm giá

> **Mục tiêu:** Xác nhận khách hàng có thể dùng điểm tích lũy để giảm giá trước khi thanh toán

**Điều kiện:** KH-001 có 80 điểm (sau TC-03-002)  
**Người thực hiện:** Nhân viên

| Bước | Thao tác                                               | Kết quả mong đợi                                                                         |
| ---- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1    | Tạo hóa đơn mới, thêm KH-001                           |                                                                                          |
| 2    | Thêm `Giày thể thao Nam A (39)`, SL=1, đơn giá 800,000 | Tổng = 800,000                                                                           |
| 3    | Nhấn **Dùng điểm**, nhập số điểm muốn dùng: 50         | Giảm giá điểm = 25,000 (50 × 500 VNĐ); Còn phải trả = 775,000                            |
| 4    | Thanh toán tiền mặt 775,000 → Xác nhận                 | Hóa đơn PAID                                                                             |
| 5    | Kiểm tra số điểm KH-001                                | KQHT: 30 điểm (80 - 50, không tích thêm). KQMM: 107 điểm (30 + floor(775,000÷10,000)=77) |

**Kiểm tra thêm:**

- [x] `pointsDiscountAmount` trong hóa đơn = 25,000
- [ ] ⚠️ BUG: Hóa đơn dùng điểm không tích điểm mới — chỉ còn 30 điểm thay vì 107

---

### TC-03-004: Bán chịu — thanh toán một phần, tạo công nợ

> **Mục tiêu:** Xác nhận hóa đơn bán chịu tạo bản ghi công nợ với số tiền còn lại

**Điều kiện:** KH-001 tồn tại (bắt buộc phải có khách hàng khi bán chịu)  
**Người thực hiện:** Nhân viên

| Bước | Thao tác                                               | Kết quả mong đợi                                                                    |
| ---- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 1    | Tạo hóa đơn, thêm KH-001                               |                                                                                     |
| 2    | Thêm `Giày thể thao Nam A (38)`, SL=2, đơn giá 800,000 | Tổng = 1,600,000                                                                    |
| 3    | Thanh toán: Tiền mặt 600,000 (một phần)                | Còn thiếu = 1,000,000                                                               |
| 4    | Xác nhận thanh toán                                    | Hóa đơn trạng thái PARTIAL_DEBT                                                     |
| 5    | Vào danh sách hóa đơn → xem chi tiết hóa đơn vừa tạo   | Hiển thị trạng thái PARTIAL_DEBT, số tiền còn nợ = 1,000,000                        |
| 6    | Vào hồ sơ KH-001 → xem công nợ                         | Công nợ mới: originalAmount = 1,500,000, remainingAmount = 1,000,000, status = OPEN |

**Kiểm tra thêm:**

- [x] Hóa đơn status = PARTIAL_DEBT (không phải PAID)
- [x] InvoiceDebtEntity được tạo với đúng số liệu

---

### TC-03-005: Kiểm tra tồn kho giảm đúng sau khi checkout

> **Mục tiêu:** Xác nhận stock ledger được ghi và tồn kho giảm đúng sau khi bán hàng

**Điều kiện:** Biết chính xác tồn kho trước khi bán (ví dụ: TAT-F = 20 tại A-02)  
**Người thực hiện:** Nhân viên / Quản lý chi nhánh

| Bước | Thao tác                                                         | Kết quả mong đợi                                                   |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1    | Ghi nhận tồn kho hiện tại: TAT-F tại vị trí A-02                 | Ví dụ: 20 đôi                                                      |
| 2    | Tạo hóa đơn POS, bán 5 đôi TAT-F tại vị trí A-02, đơn giá 50,000 |                                                                    |
| 3    | Checkout thành công                                              | Hóa đơn PAID                                                       |
| 4    | Vào **Kho hàng → Tồn kho** → kiểm tra TAT-F tại A-02             | Tồn kho = 20 - 5 = 15                                              |
| 5    | Vào lịch sử ledger TAT-F                                         | Có entry SALE_ISSUE, quantity = -5, reference = invoice ID vừa tạo |

---

### TC-03-006: Xem danh sách hóa đơn và lọc theo trạng thái

> **Mục tiêu:** Xác nhận màn hình danh sách hóa đơn POS hiển thị và filter hoạt động đúng

**Điều kiện:** Đã có ít nhất 2-3 hóa đơn với các trạng thái PAID, PARTIAL_DEBT  
**Người thực hiện:** Nhân viên

| Bước | Thao tác                                          | Kết quả mong đợi                                                   |
| ---- | ------------------------------------------------- | ------------------------------------------------------------------ |
| 1    | Vào menu POS → **Danh sách hóa đơn**              | Danh sách hiển thị các hóa đơn theo thứ tự mới nhất trước          |
| 2    | Lọc theo trạng thái: **Đã thanh toán (PAID)**     | Chỉ hiển thị hóa đơn PAID                                          |
| 3    | Lọc theo trạng thái: **Nợ (DEBT / PARTIAL_DEBT)** | Chỉ hiển thị hóa đơn có công nợ                                    |
| 4    | Tìm kiếm theo mã hóa đơn                          | Tìm thấy đúng hóa đơn                                              |
| 5    | Tìm kiếm theo tên hoặc SĐT khách hàng             | Tìm thấy hóa đơn của KH-001                                        |
| 6    | Nhấn vào hóa đơn để xem chi tiết                  | Chi tiết hóa đơn hiển thị đầy đủ: hàng hóa, thanh toán, khách hàng |

---

## Trường hợp biên & trường hợp lỗi

~~### TC-03-EF-001: Checkout khi hàng trong giỏ chưa có vị trí (locationId)~~

> **Bỏ TC này** — POS tự lấy vị trí từ kho Showroom, không có trạng thái "chưa có vị trí".

---

### TC-03-EF-002: Bán chịu mà không có khách hàng

> **Mục tiêu:** Xác nhận không thể tạo nợ (DEBT) cho hóa đơn không có khách hàng

| Bước | Thao tác                                    | Kết quả mong đợi                                                             |
| ---- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| 1    | Tạo hóa đơn không gán khách hàng, thêm hàng |                                                                              |
| 2    | Thanh toán một phần (ít hơn tổng tiền)      | Checkbox **"Tính vào công nợ"** bị disabled (không tick được khi chưa có KH) |
| 3    | Xác nhận                                    | Hệ thống không cho phép ghi nợ; chỉ chấp nhận PAID đủ tiền                   |

---

### TC-03-EF-003: Dùng điểm thành viên vượt quá số điểm hiện có

> **Mục tiêu:** Xác nhận không thể đổi nhiều điểm hơn số điểm trong tài khoản

**Điều kiện:** KH-001 có N điểm; thử dùng M điểm với M > N

| Bước | Thao tác                                      | KQHT                                                    | KQMM                                             |
| ---- | --------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| 1    | Tạo hóa đơn, gán KH-001                       |                                                         |                                                  |
| 2    | Nhấn **Dùng điểm**, nhập số điểm > số hiện có | `HTTP 400: Insufficient points: balance=N, requested=M` | `Số điểm tối đa có thể dùng = {số điểm hiện có}` |

---

### TC-03-EF-004: Nhập số tiền thanh toán vượt quá tổng hóa đơn

> **Mục tiêu:** Xác nhận tổng tiền thanh toán không vượt quá amountDue

| Bước | Thao tác                                               | KQHT                                                                | KQMM                                                                    |
| ---- | ------------------------------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1    | Tạo hóa đơn 800,000                                    |                                                                     |                                                                         |
| 2    | Nhập tiền thanh toán = 1,000,000 (nhiều hơn tổng tiền) | `HTTP 400: Total payments (1000000) exceed the amount due (800000)` | `Tổng tiền thanh toán phải không vượt quá số tiền còn lại của hóa đơn.` |
