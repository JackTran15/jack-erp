# TC-01 — Journey: Thiết lập hệ thống

## Phạm vi

Kiểm tra luồng thiết lập hệ thống: tạo chi nhánh, kho, vị trí, tài khoản người dùng, và danh mục hàng hóa. Đây là điều kiện tiên quyết cho tất cả journey còn lại.

**Người thực hiện mặc định:** Quản trị hệ thống (`inventory.admin@erp.local`)  
**Môi trường:** Backoffice Web (`http://localhost:3000`)

> Tài khoản `inventory.admin@erp.local` có full access. Chạy `pnpm seed:dev-admin` để tạo tài khoản này trước khi bắt đầu TC-01.

---

### TC-01-001: Tạo chi nhánh mới và kiểm tra kho Showroom tự động tạo

> **Mục tiêu:** Xác nhận rằng khi tạo chi nhánh mới, hệ thống tự động tạo kho Showroom kèm vị trí "Mặc định" và "Chưa xếp"

**Điều kiện:** Đã đăng nhập với `inventory.admin@erp.local`  
**Người thực hiện:** Quản trị hệ thống


| Bước | Thao tác                                         | Kết quả mong đợi                                                          |
| ---- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| 1    | Vào menu **Cài đặt → Chi nhánh → Tạo chi nhánh** | Form tạo chi nhánh hiển thị                                               |
| 2    | Nhập tên: `Chi nhánh HCM`, xác nhận              | Chi nhánh được tạo, xuất hiện trong danh sách                             |
| 3    | Vào chi tiết Chi nhánh HCM → tab **Kho hàng**    | Hiển thị kho `Showroom HCM` đã tự tạo (isMainStorage=true)                |
| 4    | Vào chi tiết kho Showroom HCM → tab **Vị trí**   | Có 2 vị trí mặc định: `Chưa xếp` (isUnassigned) và `Mặc định` (isDefault) |


**Kiểm tra thêm:**

- [x] Kho Showroom HCM có `isMainStorage = true`
- [x] Vị trí "Chưa xếp" có `isUnassigned = true`
- [x] Vị trí "Mặc định" có `isDefault = true`

---

### TC-01-002: Tạo kho lưu trữ thêm trong chi nhánh

> **Mục tiêu:** Xác nhận có thể tạo thêm kho phụ (ngoài Showroom) cho một chi nhánh

**Điều kiện:** Chi nhánh HCM đã tồn tại  
**Người thực hiện:** Quản trị hệ thống


| Bước | Thao tác                                             | Kết quả mong đợi                                                       |
| ---- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| 1    | Vào Chi nhánh HCM → tab Kho hàng → **Thêm kho**      | Form tạo kho hiển thị                                                  |
| 2    | Nhập tên: `Kho lưu trữ HCM`, loại: Kho phụ, xác nhận | Kho được tạo, xuất hiện trong danh sách kho của chi nhánh              |
| 3    | Vào chi tiết Kho lưu trữ HCM                         | Thông tin kho hiển thị đúng, có 2 vị trí mặc định (Chưa xếp, Mặc định) |


---

### TC-01-003: Tạo vị trí (bin) trong kho

> **Mục tiêu:** Xác nhận có thể tạo vị trí mới trong kho để phân loại chỗ để hàng

**Điều kiện:** Kho lưu trữ HCM đã tồn tại  
**Người thực hiện:** Quản trị hệ thống


| Bước | Thao tác                                                | Kết quả mong đợi                                |
| ---- | ------------------------------------------------------- | ----------------------------------------------- |
| 1    | Vào Kho lưu trữ HCM → tab Vị trí → **Thêm vị trí**      | Form tạo vị trí hiển thị                        |
| 2    | Nhập mã: `A-01`, tên: `Kệ A - Ngăn 1`, xác nhận         | Vị trí A-01 được tạo, xuất hiện trong danh sách |
| 3    | Lặp lại, tạo vị trí `A-02` — `Kệ A - Ngăn 2`            | Vị trí A-02 được tạo                            |
| 4    | Vào Showroom HCM → tạo vị trí `SH-01` — `Kệ showroom 1` | Vị trí SH-01 được tạo trong Showroom            |


**Kiểm tra thêm:**

- [x] Mã vị trí là duy nhất trong cùng một kho (không trùng)
- [x] Vị trí hiển thị trong danh sách kho đúng kho

---

### TC-01-004: Tạo user mới, gán role Nhân viên, gán chi nhánh

> **Mục tiêu:** Xác nhận tạo được tài khoản nhân viên với phân quyền và phạm vi chi nhánh đúng

**Điều kiện:** Chi nhánh HCM đã tồn tại, role Nhân viên đã có sẵn  
**Người thực hiện:** Quản trị hệ thống (hoặc Quản lý chi nhánh)


| Bước | Thao tác                                           | Kết quả mong đợi                                     |
| ---- | -------------------------------------------------- | ---------------------------------------------------- |
| 1    | Vào **Phân quyền → Người dùng → Tạo người dùng**   | Form tạo user hiển thị                               |
| 2    | Nhập email: `staff-hcm@test.com`, họ tên, mật khẩu | Form điền được                                       |
| 3    | Gán role: **Nhân viên**                            | Role được chọn                                       |
| 4    | Gán chi nhánh: **Chi nhánh HCM**                   | Chi nhánh được chọn                                  |
| 5    | Lưu                                                | User được tạo, hiển thị trong danh sách              |
| 6    | Đăng xuất → đăng nhập bằng `staff-hcm@test.com`    | Đăng nhập thành công                                 |
| 7    | Chọn chi nhánh HCM                                 | Vào được giao diện POS/Backoffice với scope Branch A |


**Kiểm tra thêm:**

- [x] User `staff-hcm@test.com` chỉ thấy Branch A trong dropdown chi nhánh

---

### TC-01-005: Tạo user Quản lý chi nhánh, gán chi nhánh

> **Mục tiêu:** Xác nhận tạo được tài khoản Quản lý chi nhánh với phạm vi đúng

**Điều kiện:** Chi nhánh HCM đã tồn tại  
**Người thực hiện:** Quản trị hệ thống


| Bước | Thao tác                                | Kết quả mong đợi                 |
| ---- | --------------------------------------- | -------------------------------- |
| 1    | Tạo user mới: email `mgr-hcm@test.com`  | User được tạo                    |
| 2    | Gán role: **Quản lý chi nhánh**         |                                  |
| 3    | Gán chi nhánh: **Chi nhánh HCM**        |                                  |
| 4    | Lưu → đăng nhập bằng `mgr-hcm@test.com` | Đăng nhập thành công             |
| 5    | Vào menu Kho hàng → Nhập kho            | Có thể xem và tạo phiếu nhập kho |
| 6    | Vào menu Báo cáo → Báo cáo tổng quan    | Thấy dashboard chi nhánh HCM     |


---

### TC-01-006: Tạo nhóm hàng hoá 2 cấp

> **Mục tiêu:** Xác nhận tạo được nhóm hàng hoá cha-con (2 cấp), dùng để phân loại sản phẩm

**Điều kiện:** Đã đăng nhập  
**Người thực hiện:** Quản trị hệ thống


| Bước | Thao tác                                         | Kết quả mong đợi                        |
| ---- | ------------------------------------------------ | --------------------------------------- |
| 1    | Vào **Hàng hóa → Nhóm hàng hóa → Tạo nhóm**      | Form tạo nhóm hiển thị                  |
| 2    | Nhập tên: `Giày`, không chọn nhóm cha            | Nhóm cấp 1 được tạo                     |
| 3    | Tạo nhóm `Giày thể thao`, chọn nhóm cha = `Giày` | Nhóm cấp 2 xuất hiện dưới Giày          |
| 4    | Tạo nhóm `Giày công sở`, cha = `Giày`            |                                         |
| 5    | Tạo nhóm `Dép / Sandal`, cha = `Giày`            |                                         |
| 6    | Tạo nhóm cấp 1: `Phụ kiện`                       |                                         |
| 7    | Tạo nhóm `Tất / Vớ`, cha = `Phụ kiện`            |                                         |
| 8    | Tạo nhóm `Chăm sóc giày`, cha = `Phụ kiện`       |                                         |
| 9    | Xem cây nhóm hàng hoá                            | Hiển thị 2 cấp đúng như cấu trúc đã tạo |


**Kiểm tra thêm:**

- [x] Nhóm cấp 2 không thể xóa khi còn sản phẩm thuộc nhóm đó (kiểm tra sau khi tạo sản phẩm)

---

### TC-01-007: Tạo danh mục hàng hóa với variant

> **Mục tiêu:** Xác nhận tạo được sản phẩm có nhiều biến thể (size), mỗi biến thể là một SKU riêng; có thể gán nhóm hàng hoá

**Điều kiện:** Đã tạo nhóm hàng hoá ở TC-01-006  
**Người thực hiện:** Quản trị hệ thống


| Bước | Thao tác                                                                                                                          | Kết quả mong đợi                                                |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1    | Vào **Hàng hóa → Sản phẩm → Tạo sản phẩm**                                                                                        | Form tạo sản phẩm hiển thị                                      |
| 2    | Tên mẫu mã: `Nam A`, SKU mẫu mã: `TSNAM-A`, đơn vị: `Đôi`, Giá mua: 500,000, Giá bán: 800,000                                     | Form có 2 trường riêng: "Giá mua" và "Giá bán"                  |
| 3    | Chọn nhóm hàng hoá: `Giày thể thao`                                                                                               |                                                                 |
| 4    | Nhập Size: `38`, `39`, `40`, `41`, `42` (Enter sau mỗi giá trị), không nhập Màu                                                   | Bảng variant hiện 5 dòng                                        |
| 5    | Kiểm tra tên variant tự sinh                                                                                                      | `Giày thể thao Nam A (38)` … `Giày thể thao Nam A (42)`         |
| 6    | Kiểm tra SKU variant tự sinh                                                                                                      | `TSNAM-A-38` … `TSNAM-A-42`                                     |
| 7    | Lưu sản phẩm                                                                                                                      | 5 SKU được tạo, tồn kho = 0 mỗi SKU                             |
| 8    | Tạo sản phẩm mới: Tên mẫu mã `Nữ B`, SKU: `TSNU-B`, nhóm: `Giày thể thao`, đơn vị `Đôi`, Giá mua: 400,000, Giá bán: 650,000       |                                                                 |
| 9    | Nhập Màu: `Đen`, `Trắng`; Size: `35`, `36`, `37`, `38`, `39`                                                                      | Bảng variant hiện 10 dòng (2 màu × 5 size)                      |
| 10   | Kiểm tra tên variant tự sinh                                                                                                      | `Giày thể thao Nữ B (Đen/35)` … `Giày thể thao Nữ B (Trắng/39)` |
| 11   | Kiểm tra SKU variant tự sinh                                                                                                      | `TSNU-B-DEN-35` … `TSNU-B-TRANG-39`                             |
| 12   | Lưu sản phẩm                                                                                                                      | 10 SKU được tạo, tồn kho = 0 mỗi SKU                            |
| 13   | Tạo sản phẩm `Tất thể thao`, SKU: `TAT-F`, nhóm: `Tất / Vớ`, đơn vị: `Đôi`, Giá mua: 25,000, Giá bán: 50,000, không nhập Size/Màu | Tên sinh ra: `Tất / Vớ Tất thể thao`; SKU = TAT-F               |


**Kiểm tra thêm:**

- [x] Mỗi variant có mã SKU riêng, không trùng nhau
- [x] Tồn kho ban đầu = 0 cho tất cả SKU
- [x] Size-only: tên = `{Nhóm} {Tên mẫu mã} ({Size})`, SKU = `{base}-{SIZE}`
- [x] Màu+Size: tên = `{Nhóm} {Tên mẫu mã} ({Màu}/{Size})`, SKU = `{base}-{COLORSLUG}-{SIZESLUG}`

---

### TC-01-008: Đặt kho nhập hàng mặc định (isDefaultReceiving)

> **Mục tiêu:** Xác nhận có thể đặt một kho phụ là kho nhập hàng mặc định cho chi nhánh, dùng khi tạo phiếu nhập không chỉ định kho

**Điều kiện:** `Kho lưu trữ HCM` đã tồn tại  
**Người thực hiện:** Quản trị hệ thống


| Bước | Thao tác                                                | Kết quả mong đợi                                                   |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| 1    | Vào Chi nhánh HCM → tab Kho hàng → mở `Kho lưu trữ HCM` | Chi tiết kho hiển thị                                              |
| 2    | Tìm tuỳ chọn **Kho nhập hàng mặc định** → bật ON        |                                                                    |
| 3    | Lưu                                                     | `isDefaultReceiving = true` được ghi nhận                          |
| 4    | Kiểm tra `Showroom HCM`                                 | `isDefaultReceiving = false` (không thể có 2 kho cùng là mặc định) |


**Kiểm tra thêm:**

- [x] Chỉ có đúng 1 kho có `isDefaultReceiving = true` trong mỗi chi nhánh

---

## Trường hợp biên & trường hợp lỗi

### TC-01-EF-001: Tạo chi nhánh với tên đã tồn tại

> **Mục tiêu:** Xác nhận hệ thống từ chối tạo chi nhánh trùng tên trong cùng tổ chức


| Bước | Thao tác                                  | Kết quả mong đợi                 |
| ---- | ----------------------------------------- | -------------------------------- |
| 1    | Tạo chi nhánh tên `Chi nhánh HCM` (đã có) | Hệ thống báo lỗi: tên đã tồn tại |
| 2    | Kiểm tra danh sách chi nhánh              | Chỉ có 1 chi nhánh HCM           |


---

### TC-01-EF-002: Tạo vị trí với mã trùng trong cùng kho

> **Mục tiêu:** Xác nhận mã vị trí là duy nhất trong một kho


| Bước | Thao tác                                              | Kết quả mong đợi                                     |
| ---- | ----------------------------------------------------- | ---------------------------------------------------- |
| 1    | Vào `Kho lưu trữ HCM` → tạo vị trí mã `A-01` (đã có)  | Hệ thống báo lỗi: mã vị trí đã tồn tại trong kho này |
| 2    | Thử tạo vị trí `A-01` trong `Showroom HCM` (kho khác) | Cho phép (mã chỉ duy nhất trong cùng kho)            |


---

### TC-01-EF-003: Đăng nhập sai mật khẩu

> **Mục tiêu:** Xác nhận hệ thống từ chối đăng nhập với credentials sai


| Bước | Thao tác                                    | Kết quả mong đợi                          |
| ---- | ------------------------------------------- | ----------------------------------------- |
| 1    | Nhập email `mgr-hcm@test.com`, mật khẩu sai | Thông báo: email hoặc mật khẩu không đúng |
| 2    | Kiểm tra không vào được hệ thống            | Trang đăng nhập vẫn hiển thị              |


