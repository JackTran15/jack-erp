# TC-06 — Journey: Quỹ tiền — Phiếu Thu / Phiếu Chi / Kiểm kê tiền mặt / Sổ chi tiết

## Phạm vi

Kiểm tra các nghiệp vụ quỹ tiền thủ công: tạo và đăng phiếu thu, phiếu chi, đảo phiếu, kiểm kê tiền mặt và xem sổ chi tiết.

> ⚠️ **Lưu ý thực tế:** Phiếu thu/chi thủ công (TC-06-001, TC-06-003) hiện tạo xong ở trạng thái **DRAFT** thay vì tự động POSTED. Đây là lỗi backend — thiết kế đúng là auto-POST khi tạo (giống phiếu nhập/xuất kho, không cần bước POST riêng trên UI). Phiếu DRAFT không ảnh hưởng số dư và không xuất hiện trong Sổ chi tiết.

**Người thực hiện mặc định:** Quản lý chi nhánh (`mgr-hcm@test.com`)  
**Môi trường:** Backoffice Web — Chi nhánh HCM  
**Điều kiện chung:** Cash Account `**Quỹ tiền mặt - Chi nhánh HCM`** (type REGISTER) đã tồn tại. Chưa có UI CRUD két tiền — test trên két mặc định duy nhất này. Ghi nhận số dư hiện tại trước mỗi TC.

> **TC-05 đã skip** (POS chưa có UI mở/đóng ca). TC-06-001 đến TC-06-006 test độc lập trên `Quỹ tiền mặt - Chi nhánh HCM`. TC-06-007 dùng transactions từ chính TC-06, không cần TC-05.

---

### TC-06-001: Tạo Phiếu Thu thủ công DRAFT → POST → kiểm tra số dư quỹ tăng

> **Mục tiêu:** Xác nhận phiếu thu khi POST sẽ tạo cash movement DEPOSIT và tăng số dư quỹ tiền

**Điều kiện:** Quỹ tiền mặt - Chi nhánh HCM có số dư hiện tại (ghi nhận trước khi test)  
**Người thực hiện:** Quản lý chi nhánh


| Bước | Thao tác | Kết quả mong đợi |
| ---- | -------- | ---------------- |
| 1 | Ghi nhận số dư hiện tại của `Quỹ tiền mặt - Chi nhánh HCM` | Ví dụ: X đồng |
| 2 | Vào **Quỹ tiền → Phiếu thu → Tạo phiếu thu** | Form tạo phiếu thu hiển thị |
| 3 | Chọn quỹ tiền: `Quỹ tiền mặt - Chi nhánh HCM`; mục đích: `Khác` | |
| 4 | Thêm dòng: mô tả `Thu tiền khách hàng`, số tiền = 500,000 | Tổng phiếu = 500,000 |
| 5 | Nhấn **Lưu** | KQMM: Phiếu POSTED ngay, mã PT######, cash movement DEPOSIT tạo, số dư = X + 500,000. KQHT: Phiếu ở trạng thái DRAFT, số dư không đổi (BUG-001) |

**Kiểm tra thêm:**
- [ ] Phiếu xuất hiện trong Sổ chi tiết tiền mặt với đúng số tiền
- [ ] Cash movement type = DEPOSIT, amount = 500,000

---

### TC-06-002: Đảo Phiếu Thu đã POST → kiểm tra số dư giảm về ban đầu

> **Mục tiêu:** Xác nhận phiếu thu đã POST có thể đảo và số dư quỹ bị trừ lại

**Điều kiện:** Có phiếu thu đã POSTED từ TC-06-001  
**Người thực hiện:** Quản lý chi nhánh


| Bước | Thao tác                                      | Kết quả mong đợi                                             |
| ---- | --------------------------------------------- | ------------------------------------------------------------ |
| 1    | Mở phiếu thu đã POST                          | Chi tiết phiếu thu hiển thị                                  |
| 2    | Nhấn **Đảo phiếu (Reverse)**                  | Xác nhận đảo                                                 |
| 3    | Xác nhận                                      | Phiếu đảo mới được tạo với trạng thái POSTED (loại REVERSAL) |
| 4    | Kiểm tra số dư `Quỹ tiền mặt - Chi nhánh HCM` | Giảm lại về X (trước khi tạo phiếu thu)                      |
| 5    | Xem phiếu gốc                                 | Trạng thái hiển thị là đã bị đảo (REVERSED)                  |


**Kiểm tra thêm:**

- [ ] Cash movement WITHDRAWAL được tạo để bù trừ DEPOSIT
- [ ] Phiếu đảo có `reversesVoucherId` trỏ về phiếu gốc

---

### TC-06-003: Tạo Phiếu Chi DRAFT → POST → kiểm tra số dư quỹ giảm

> **Mục tiêu:** Xác nhận phiếu chi khi POST sẽ tạo cash movement WITHDRAWAL và giảm số dư quỹ tiền

**Điều kiện:** Quỹ tiền mặt - Chi nhánh HCM có số dư ≥ 300,000 (đủ chi)  
**Người thực hiện:** Quản lý chi nhánh


| Bước | Thao tác | Kết quả mong đợi |
| ---- | -------- | ---------------- |
| 1 | Ghi nhận số dư hiện tại `Quỹ tiền mặt - Chi nhánh HCM` | Ví dụ: Y đồng |
| 2 | Vào **Quỹ tiền → Phiếu chi → Tạo phiếu chi** | Form tạo phiếu chi |
| 3 | Chọn quỹ: `Quỹ tiền mặt - Chi nhánh HCM`; mục đích: `Khác` | |
| 4 | Thêm dòng: mô tả `Chi phí vận chuyển`, số tiền = 200,000 | |
| 5 | Nhấn **Lưu** | KQMM: Phiếu POSTED ngay, mã PC######, cash movement WITHDRAWAL tạo, số dư = Y - 200,000. KQHT: Phiếu ở trạng thái DRAFT, số dư không đổi (BUG-001) |


---

### TC-06-004: Đảo Phiếu Chi đã POST → kiểm tra số dư tăng về ban đầu

> **Mục tiêu:** Xác nhận đảo phiếu chi hoạt động đúng và số dư quỹ tăng lại

**Điều kiện:** Có phiếu chi đã POSTED  
**Người thực hiện:** Quản lý chi nhánh


| Bước | Thao tác                                      | Kết quả mong đợi          |
| ---- | --------------------------------------------- | ------------------------- |
| 1    | Mở phiếu chi đã POST → nhấn **Đảo phiếu**     | Xác nhận đảo              |
| 2    | Xác nhận                                      | Phiếu đảo POSTED được tạo |
| 3    | Kiểm tra số dư `Quỹ tiền mặt - Chi nhánh HCM` | Tăng lại về Y             |


---

### TC-06-005: Kiểm kê tiền mặt — thực tế lớn hơn hệ thống → Phiếu Thu tự tạo

> **Mục tiêu:** Xác nhận khi đếm tiền thực tế nhiều hơn hệ thống, hệ thống tự tạo Phiếu Thu để điều chỉnh số dư

**Điều kiện:** Quỹ tiền mặt - Chi nhánh HCM có số dư = Z đồng  
**Người thực hiện:** Quản lý chi nhánh


| Bước | Thao tác                                                          | Kết quả mong đợi                                           |
| ---- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| 1    | Vào **Quỹ tiền → Kiểm kê tiền mặt → Tạo kiểm kê**                 | Form kiểm kê hiển thị                                      |
| 2    | Chọn quỹ: `Quỹ tiền mặt - Chi nhánh HCM`; nhập ngày kiểm kê       |                                                            |
| 3    | Nhập số tiền thực đếm: `Z + 100,000` (nhiều hơn hệ thống 100,000) | Hiển thị chênh lệch = +100,000                             |
| 4    | Tùy chọn: nhập mệnh giá (denomination breakdown)                  | Hiển thị bảng mệnh giá                                     |
| 5    | Nhấn **Xác nhận kiểm kê (POST)**                                  | Kiểm kê POSTED                                             |
| 6    | Kiểm tra số dư `Quỹ tiền mặt - Chi nhánh HCM`                     | = Z + 100,000                                              |
| 7    | Vào Phiếu Thu → tìm phiếu liên quan                               | Phiếu Thu tự động được tạo và POST, mô tả kiểm kê tiền mặt |


**Kiểm tra thêm:**

- [ ] `varianceCashMovementId` trỏ về DEPOSIT movement
- [ ] `varianceVoucherKind = CASH_RECEIPT`

---

### TC-06-006: Kiểm kê tiền mặt — thực tế nhỏ hơn hệ thống → Phiếu Chi tự tạo

> **Mục tiêu:** Xác nhận khi đếm tiền thực tế ít hơn hệ thống, hệ thống tự tạo Phiếu Chi để điều chỉnh

**Điều kiện:** Quỹ tiền mặt - Chi nhánh HCM có số dư = Z đồng  
**Người thực hiện:** Quản lý chi nhánh


| Bước | Thao tác                                                    | Kết quả mong đợi              |
| ---- | ----------------------------------------------------------- | ----------------------------- |
| 1    | Tạo kiểm kê tiền mặt mới cho `Quỹ tiền mặt - Chi nhánh HCM` |                               |
| 2    | Nhập số tiền thực đếm: `Z - 50,000` (thiếu 50,000)          | Chênh lệch = -50,000          |
| 3    | POST kiểm kê                                                | Kiểm kê POSTED                |
| 4    | Kiểm tra số dư `Quỹ tiền mặt - Chi nhánh HCM`               | = Z - 50,000                  |
| 5    | Vào Phiếu Chi → tìm phiếu liên quan                         | Phiếu Chi tự động tạo và POST |


---

### TC-06-007: Xem Sổ chi tiết tiền mặt (Cash Ledger)

> **Mục tiêu:** Xác nhận sổ chi tiết tiền mặt hiển thị đúng tất cả giao dịch theo thứ tự, số dư mở đầu/cuối chính xác

**Điều kiện:** Đã thực hiện ít nhất 3 giao dịch trên `Quỹ tiền mặt - Chi nhánh HCM` (từ TC-06-001, TC-06-003, TC-06-005 hoặc TC-06-006)  
**Người thực hiện:** Quản lý chi nhánh


| Bước | Thao tác                                                          | Kết quả mong đợi                                                                       |
| ---- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1    | Vào **Quỹ tiền → Sổ chi tiết tiền mặt**                           | Danh sách tài khoản quỹ hiển thị                                                       |
| 2    | Chọn `Quỹ tiền mặt - Chi nhánh HCM`; lọc theo khoảng ngày hôm nay | Sổ chi tiết hiển thị                                                                   |
| 3    | Kiểm tra **Số dư đầu kỳ**                                         | = Số dư đầu ngày (trước các giao dịch hôm nay)                                         |
| 4    | Xem từng dòng giao dịch                                           | Mỗi dòng có: type (DEPOSIT/WITHDRAWAL), số tiền, nguồn gốc (invoice ID, phiếu thu/chi) |
| 5    | Kiểm tra **Số dư cuối kỳ**                                        | = Đầu kỳ + tổng DEPOSIT - tổng WITHDRAWAL                                              |
| 6    | Kiểm tra tổng cộng bên Thu và bên Chi                             | Khớp với tổng các giao dịch trong kỳ                                                   |


**Kiểm tra thêm:**

- [ ] Phân trang (cursor pagination) hoạt động đúng nếu có nhiều dòng
- [ ] Lọc theo ngày thu hẹp đúng danh sách

---

## Trường hợp biên & trường hợp lỗi

### TC-06-EF-001: POST Phiếu Chi khi số dư quỹ không đủ

> **Mục tiêu:** Xác nhận hệ thống từ chối xuất tiền khi quỹ không đủ

**Điều kiện:** Ghi nhận số dư hiện tại `Quỹ tiền mặt - Chi nhánh HCM` = **S** trước khi test


| Bước | Thao tác                                                                           | Kết quả mong đợi                                  |
| ---- | ---------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1    | Tạo Phiếu Chi cho `Quỹ tiền mặt - Chi nhánh HCM`, số tiền = **S + 1** (vượt số dư) | Phiếu được tạo DRAFT bình thường                  |
| 2    | Nhấn **Xác nhận (POST)**                                                           | Hệ thống báo lỗi: số dư quỹ không đủ để xuất tiền |
| 3    | Kiểm tra số dư `Quỹ tiền mặt - Chi nhánh HCM`                                      | Không thay đổi (= S)                              |


---

### TC-06-EF-002: Cố sửa Phiếu Thu đã POST

> **Mục tiêu:** Xác nhận phiếu đã POST là bất biến


| Bước | Thao tác                           | Kết quả mong đợi                                |
| ---- | ---------------------------------- | ----------------------------------------------- |
| 1    | Mở Phiếu Thu đã POSTED             | Hiển thị read-only                              |
| 2    | Cố thay đổi số tiền                | Nút chỉnh sửa bị ẩn/disabled                    |
| 3    | Gọi API `PATCH /cash-receipts/:id` | Server trả về 400: phiếu đã POST, không thể sửa |


---

### TC-06-EF-003: Tạo Kiểm kê tiền với denomination không khớp tổng tiền

> **Mục tiêu:** Xác nhận tổng mệnh giá phải bằng số tiền thực đếm


| Bước | Thao tác                                                      | Kết quả mong đợi                                                                    |
| ---- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1    | Tạo kiểm kê, nhập actualAmount = 500,000                      |                                                                                     |
| 2    | Nhập denomination: 200,000 × 1 = 200,000 (không khớp 500,000) |                                                                                     |
| 3    | Nhấn POST                                                     | Hệ thống báo lỗi: tổng mệnh giá (200,000) không khớp với số tiền thực đếm (500,000) |


