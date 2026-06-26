# TC-02 — Journey: Nhập hàng vào kho

## Phạm vi

Kiểm tra luồng nhập kho: tạo phiếu, xác nhận POSTED và kiểm tra tồn kho được cập nhật đúng.

> **Lưu ý thực tế:** Phiếu nhập kho **tự động POSTED ngay khi tạo** — không có trạng thái DRAFT trên UI.

**Người thực hiện mặc định:** Quản lý chi nhánh (`mgr-hcm@test.com`)  
**Môi trường:** Backoffice Web — Chi nhánh HCM  
**Điều kiện chung:** Đã hoàn thành TC-01 (kho, vị trí, hàng hóa đã tồn tại)

> **"Đơn giá" trong phiếu nhập kho = Giá mua (giá nhập kho thực tế)**, không phải giá bán. Ghi vào `GoodsReceiptLine.unitPrice`; hệ thống dùng làm giá vốn (`costPrice`) trong báo cáo lợi nhuận.

---

### TC-02-001: Nhập kho cơ bản → kiểm tra tồn kho tăng

> **Mục tiêu:** Xác nhận phiếu nhập kho khi tạo sẽ tự động POSTED và cập nhật tồn kho đúng tại vị trí nhận hàng

**Điều kiện:** Kho lưu trữ HCM có vị trí A-01; TSNAM-A-38 (SKU TSNAM-A-38) tồn kho = 0  
**Người thực hiện:** Quản lý chi nhánh


| Bước | Thao tác                                                                                        | Kết quả mong đợi                                                    |
| ---- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1    | Vào **Kho hàng → Nhập kho → Tạo phiếu nhập**                                                    | Form nhập kho hiển thị                                              |
| 2    | Thêm hàng: chọn `Giày thể thao Nam A (38)`, số lượng `20`, **giá mua** `500,000`, vị trí `A-01` | Dòng hàng xuất hiện, thành tiền = 10,000,000                        |
| 3    | Nhấn **Xác nhận**                                                                               | Phiếu tự động POSTED, mã phiếu tự sinh (`NK000001`, `NK000002`,...) |
| 4    | Vào **Báo cáo → Tồn kho** hoặc chi tiết hàng hóa TSNAM-A-38                                     | Tồn kho tại A-01 = 20                                               |


**Kiểm tra thêm:**

- [x] Mã phiếu nhập kho tự sinh dạng `NK######`
- [x] Trường `postedAt` được ghi nhận thời gian xác nhận
- [x] Stock ledger có entry type `PURCHASE_RECEIPT` với quantity = +20

---

### TC-02-002: Nhập kho nhiều mặt hàng, nhiều vị trí

> **Mục tiêu:** Xác nhận phiếu nhập kho có thể chứa nhiều dòng hàng ở các vị trí khác nhau, mỗi vị trí cập nhật tồn riêng

**Điều kiện:** Kho lưu trữ HCM có vị trí A-01 và A-02; tồn kho TSNAM-A-39 = 0, TAT-F = 0  
**Người thực hiện:** Quản lý chi nhánh


| Bước | Thao tác                                                                                           | Kết quả mong đợi                                         |
| ---- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1    | Tạo phiếu nhập kho mới                                                                             |                                                          |
| 2    | Thêm dòng 1: `Giày thể thao Nam A (39)` (SKU: TSNAM-A-39), SL=10, vị trí A-01, **giá mua 500,000** |                                                          |
| 3    | Thêm dòng 2: `TAT-F` (Tất thể thao), SL=20, vị trí A-02, **giá mua 25,000**                        | 2 dòng hàng, tổng tiền = 5,000,000 + 500,000 = 5,500,000 |
| 4    | Xác nhận nhập kho (POST)                                                                           | Phiếu POSTED                                             |
| 5    | Kiểm tra tồn kho TSNAM-A-39 tại A-01                                                               | = 10                                                     |
| 6    | Kiểm tra tồn kho TAT-F tại A-02                                                                    | = 20                                                     |


**Kiểm tra thêm:**

- [x] Hai stock ledger entries riêng biệt (1 per line, 1 per location)

---

### TC-02-003: Nhập kho với nhà cung cấp (counterparty)

> **Mục tiêu:** Xác nhận có thể gán nhà cung cấp vào phiếu nhập để tra cứu sau

**Điều kiện:** Provider `NCC Giày Việt` đã tồn tại  
**Người thực hiện:** Quản lý chi nhánh


| Bước | Thao tác                                                                      | Kết quả mong đợi                              |
| ---- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| 1    | Tạo phiếu nhập kho mới                                                        |                                               |
| 2    | Tại trường Đối tượng: chọn loại `Nhà cung cấp`, tìm và chọn `NCC Giày Việt`   | Nhà cung cấp được gán vào phiếu               |
| 3    | Thêm hàng: `Giày thể thao Nam A (40)`, SL=5, vị trí A-01, **giá mua 500,000** |                                               |
| 4    | Xác nhận nhập kho (POST)                                                      | Phiếu POSTED                                  |
| 5    | Xem chi tiết phiếu                                                            | Hiển thị `NCC Giày Việt` trong phần Đối tượng |


---

~~### TC-02-004: Hủy phiếu nhập kho ở trạng thái DRAFT~~

> **Bỏ TC này** — phiếu nhập kho tự động POSTED khi tạo, không có trạng thái DRAFT để hủy.

---

### TC-02-005: Kiểm tra không thể sửa phiếu sau khi POSTED

> **Mục tiêu:** Xác nhận tính bất biến của phiếu nhập kho đã xác nhận (immutable after posting)

**Điều kiện:** Có phiếu nhập kho đã POSTED  
**Người thực hiện:** Quản lý chi nhánh


| Bước | Thao tác                                     | Kết quả mong đợi                                 |
| ---- | -------------------------------------------- | ------------------------------------------------ |
| 1    | Mở phiếu nhập kho đã POSTED                  | Chi tiết phiếu hiển thị                          |
| 2    | Cố sửa số lượng hoặc vị trí bất kỳ dòng hàng | Nút chỉnh sửa bị ẩn/disabled; không thể thay đổi |
| 3    | Cố nhấn nút Hủy phiếu đã POST                | Nút Hủy bị ẩn/disabled                           |


**Kiểm tra thêm:**

- [x] Không có nút Edit/Xóa trên phiếu đã POST
- [ ] Nếu gọi API PATCH trực tiếp → server trả về lỗi 400/403

---

### TC-02-006: Nhập kho sử dụng kho nhập hàng mặc định (isDefaultReceiving)

> **Mục tiêu:** Xác nhận khi không chỉ định kho, hệ thống tự động điền kho nhập hàng mặc định của chi nhánh

**Điều kiện:** `Kho lưu trữ HCM` đã được đặt là `isDefaultReceiving = true` (TC-01-007)  
**Người thực hiện:** Quản lý chi nhánh


| Bước | Thao tác                                                                  | Kết quả mong đợi                                                                                          |
| ---- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1    | Tạo phiếu nhập kho mới                                                    | Form nhập kho mở                                                                                          |
| 2    | Kiểm tra trường **Kho nhận hàng**                                         | Tự động điền `Kho lưu trữ HCM` (không cần chọn thủ công)                                                  |
| 3    | Thêm hàng: `Giày thể thao Nam A (38)`, SL=5; không chỉ định vị trí cụ thể | Hệ thống gợi ý vị trí dựa trên lịch sử nhập trước (ví dụ: A-01 nếu đã nhập trước đó) hoặc vị trí mặc định |
| 4    | POST phiếu                                                                | POSTED thành công                                                                                         |
| 5    | Kiểm tra tồn kho TSNAM-A-38                                               | Tồn tăng tại vị trí mặc định của `Kho lưu trữ HCM`                                                        |


---

## Trường hợp biên & trường hợp lỗi

### TC-02-EF-001: Tạo phiếu nhập kho không có dòng hàng

> **Mục tiêu:** Xác nhận không thể POST phiếu nhập kho rỗng


| Bước | Thao tác                                                | Kết quả mong đợi                                    |
| ---- | ------------------------------------------------------- | --------------------------------------------------- |
| 1    | Tạo phiếu nhập kho mới, không thêm bất kỳ dòng hàng nào | Form trống                                          |
| 2    | Nhấn **Xác nhận nhập kho**                              | Hệ thống báo lỗi: `Cần ít nhất 1 dòng hàng hợp lệ.` |
| 3    | Kiểm tra phiếu không được tạo                           | Không có phiếu nào trong danh sách                  |


---

### TC-02-EF-002: Nhập kho với số lượng = 0

> **Mục tiêu:** Xác nhận số lượng phải > 0


| Bước | Thao tác                                                                                | KQHT                                           | KQMM                      |
| ---- | --------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------- |
| 1    | Tạo phiếu nhập kho, thêm dòng `Giày thể thao Nam A (38)`, giá mua 500,000, số lượng = 0 |                                                |                           |
| 2    | Nhấn **Xác nhận**                                                                       | `lines.0.quantity must not be less than 0.001` | `Số lượng phải lớn hơn 0` |


---

### TC-02-EF-003: Cố sửa phiếu nhập kho sau khi đã POST

> **Mục tiêu:** Xác nhận tính bất biến của phiếu đã xác nhận


| Bước | Thao tác                                                       | Kết quả mong đợi                                   |
| ---- | -------------------------------------------------------------- | -------------------------------------------------- |
| 1    | Mở phiếu đã POSTED                                             | Hiển thị read-only                                 |
| 2    | Gọi API `PATCH /goods-receipts/:id` với body thay đổi số lượng | Server trả về 400/422: không thể sửa phiếu đã POST |


