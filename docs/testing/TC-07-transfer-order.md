# TC-07 — Journey: Điều chuyển hàng giữa chi nhánh (Lệnh điều chuyển)

## Phạm vi

Kiểm tra luồng điều chuyển hàng hóa đầy đủ giữa hai chi nhánh: tạo lệnh điều chuyển → chi nhánh nguồn xác nhận xuất hàng → chi nhánh đích xác nhận nhận hàng → kiểm tra tồn kho cả hai đầu.

**Môi trường:** Backoffice Web  
**Điều kiện chung:** 

- Branch A (Chi nhánh HCM): TSNAM-A-38 tồn kho ≥ 10 tại A-01
- Branch B (Chi nhánh Hà Nội): đã có kho Showroom HN với vị trí HN-01

---

### TC-07-001: Tạo lệnh điều chuyển từ chi nhánh A sang chi nhánh B

> **Mục tiêu:** Xác nhận tạo được lệnh điều chuyển DRAFT với nguồn và đích đúng

**Người thực hiện:** Quản lý chi nhánh HCM (`mgr-hcm@test.com`)


| Bước | Thao tác                                                                     | Kết quả mong đợi                                                   |
| ---- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1    | Đăng nhập với chi nhánh HCM → vào **Kho hàng → Lệnh điều chuyển → Tạo lệnh** | Form tạo lệnh điều chuyển hiển thị                                 |
| 2    | Chi nhánh nguồn: `Chi nhánh HCM` (tự động theo branch hiện tại)              |                                                                    |
| 3    | Chi nhánh đích: `Chi nhánh Hà Nội`                                           |                                                                    |
| 4    | Thêm hàng: TSNAM-A-38, số lượng yêu cầu = 5                                  | Dòng hàng xuất hiện; vị trí nguồn tự động đề xuất (A-01 có tồn 10) |
| 5    | Nhấn **Lưu**                                                                 | Lệnh điều chuyển DRAFT được tạo, mã LDC-...                        |


**Kiểm tra thêm:**

- [x] `sourceBranchId` = Branch A, `destinationBranchId` = Branch B
- [x] `status` = DRAFT
- [x] Tồn kho chưa thay đổi

---

### TC-07-002: Chi nhánh A xác nhận xuất hàng (spawn GoodsIssue)

> **Mục tiêu:** Xác nhận chi nhánh nguồn xác nhận xuất hàng, hệ thống tạo phiếu xuất kho và trừ tồn kho

**Điều kiện:** Lệnh điều chuyển đang ở DRAFT  
**Người thực hiện:** Quản lý chi nhánh HCM


| Bước | Thao tác                                                | Kết quả mong đợi                                                         |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1    | Ghi nhận tồn kho TSNAM-A-38 tại A-01 Chi nhánh HCM      | Ví dụ: 10 đôi                                                            |
| 2    | Mở lệnh điều chuyển DRAFT → nhấn **Xác nhận xuất hàng** | Form xuất hàng hiển thị                                                  |
| 3    | Kiểm tra thông tin: hàng, số lượng, vị trí xuất A-01    |                                                                          |
| 4    | Nhấn **Xác nhận**                                       | Lệnh chuyển sang IN_PROGRESS; Phiếu xuất kho (XK-...) được tạo và POSTED |
| 5    | Kiểm tra tồn kho TSNAM-A-38 tại Chi nhánh HCM           | = 10 - 5 = 5                                                             |
| 6    | Xem chi tiết lệnh điều chuyển                           | `exportGoodsIssueId` được gán; `exportedAt` ghi nhận thời gian           |


**Kiểm tra thêm:**

- [x] GoodsIssue purpose = TRANSFER_OUT
- [x] Stock ledger entry type = TRANSFER_OUT, quantity = -5

---

### TC-07-003: Chi nhánh B xác nhận nhận hàng (spawn GoodsReceipt)

> **Mục tiêu:** Xác nhận chi nhánh đích xác nhận nhận hàng, hệ thống tạo phiếu nhập kho và tăng tồn kho

**Điều kiện:** Lệnh điều chuyển đang IN_PROGRESS  
**Người thực hiện:** Quản lý chi nhánh HN (`mgr-hn@test.com`)


| Bước | Thao tác                                           | Kết quả mong đợi                                                        |
| ---- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| 1    | Đăng nhập với chi nhánh HN                         |                                                                         |
| 2    | Vào **Kho hàng → Lệnh điều chuyển → Tab Cần nhận** | Thấy lệnh điều chuyển đang IN_PROGRESS từ HCM                           |
| 3    | Mở lệnh → nhấn **Xác nhận nhận hàng**              | Form nhận hàng hiển thị                                                 |
| 4    | Chọn vị trí nhập: `HN-01` cho TSNAM-A-38           |                                                                         |
| 5    | Nhấn **Xác nhận**                                  | Lệnh chuyển sang COMPLETED; Phiếu nhập kho (PNK-...) được tạo và POSTED |
| 6    | Kiểm tra tồn kho TSNAM-A-38 tại Chi nhánh HN       | = 0 + 5 = 5 tại HN-01                                                   |
| 7    | Xem chi tiết lệnh điều chuyển                      | `importGoodsReceiptId` được gán; `completedAt` ghi nhận                 |


**Kiểm tra thêm:**

- [x] GoodsReceipt purpose = TRANSFER_IN
- [x] Stock ledger entry type = TRANSFER_IN, quantity = +5

---

### TC-07-004: Kiểm tra tồn kho chi nhánh A giảm, chi nhánh B tăng

> **Mục tiêu:** Xác nhận sau khi lệnh COMPLETED, tồn kho phản ánh đúng ở cả hai chi nhánh

**Điều kiện:** Lệnh điều chuyển đã COMPLETED  
**Người thực hiện:** Quản lý tổng (`gm@test.com`)


| Bước | Thao tác                                | Kết quả mong đợi                            |
| ---- | --------------------------------------- | ------------------------------------------- |
| 1    | Vào Báo cáo → **Tồn kho theo cửa hàng** | Báo cáo hiển thị                            |
| 2    | Tìm TSNAM-A-38                          | Hiển thị tồn theo từng chi nhánh            |
| 3    | Chi nhánh HCM                           | Tồn = giá trị trước khi điều chuyển - 5     |
| 4    | Chi nhánh HN                            | Tồn = 5 (nhận từ HCM)                       |
| 5    | Kiểm tra tổng tồn toàn hệ thống         | Không thay đổi so với trước khi điều chuyển |


---

### TC-07-005: Hủy lệnh điều chuyển ở trạng thái DRAFT

> **Mục tiêu:** Xác nhận có thể hủy lệnh điều chuyển khi chưa xuất hàng và không ảnh hưởng tồn kho

**Điều kiện:** Có lệnh điều chuyển DRAFT mới  
**Người thực hiện:** Quản lý chi nhánh HCM


| Bước | Thao tác                             | Kết quả mong đợi        |
| ---- | ------------------------------------ | ----------------------- |
| 1    | Tạo lệnh điều chuyển DRAFT mới       |                         |
| 2    | Mở lệnh → nhấn **Hủy**               | Xác nhận hủy            |
| 3    | Xác nhận                             | Lệnh bị hủy (CANCELLED) |
| 4    | Kiểm tra tồn kho hàng hóa trong lệnh | Không thay đổi          |


---

## Trường hợp biên & trường hợp lỗi

### TC-07-EF-001: Tạo lệnh điều chuyển với nguồn và đích giống nhau

> **Mục tiêu:** Xác nhận không thể tạo lệnh điều chuyển nội bộ trong cùng một chi nhánh


| Bước | Thao tác                                                          | Kết quả mong đợi                                         |
| ---- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| 1    | Tạo lệnh điều chuyển: nguồn = Chi nhánh HCM, đích = Chi nhánh HCM |                                                          |
| 2    | Xác nhận                                                          | Hệ thống báo lỗi: chi nhánh nguồn và đích phải khác nhau |


---

### TC-07-EF-002: Chi nhánh B cố xác nhận xuất hàng (không phải chi nhánh nguồn)

> **Mục tiêu:** Xác nhận chỉ chi nhánh nguồn mới được xác nhận xuất hàng

**Điều kiện:** Lệnh điều chuyển DRAFT, nguồn = HCM, đích = HN


| Bước | Thao tác                                                        | Kết quả mong đợi                                    |
| ---- | --------------------------------------------------------------- | --------------------------------------------------- |
| 1    | Đăng nhập `mgr-hn@test.com` (chi nhánh HN)                      |                                                     |
| 2    | Mở lệnh điều chuyển đang DRAFT                                  | Thấy lệnh nhưng không có nút **Xác nhận xuất hàng** |
| 3    | Gọi API `POST /transfer-orders/:id/export` với token của mgr-hn | Server trả về 403: user không thuộc chi nhánh nguồn |


---

### TC-07-EF-003: Hủy lệnh điều chuyển sau khi đã xuất hàng (IN_PROGRESS)

> **Mục tiêu:** Xác nhận hệ thống chặn hủy lệnh đang IN_PROGRESS

**Điều kiện:** Lệnh điều chuyển đang IN_PROGRESS (đã xuất, chưa nhập)


| Bước | Thao tác                               | Kết quả mong đợi                                       |
| ---- | -------------------------------------- | ------------------------------------------------------ |
| 1    | Mở lệnh IN_PROGRESS → thử nhấn **Hủy** | Nút Hủy bị ẩn hoặc bị disabled                         |
| 2    | Gọi API `DELETE /transfer-orders/:id`  | Server trả về 400: không thể hủy lệnh đang IN_PROGRESS |


---

### TC-07-EF-004: Hủy lệnh điều chuyển sau khi đã COMPLETED

> **Mục tiêu:** Xác nhận không thể hủy lệnh đã hoàn thành

**Điều kiện:** Lệnh điều chuyển đang COMPLETED


| Bước | Thao tác                              | Kết quả mong đợi                                    |
| ---- | ------------------------------------- | --------------------------------------------------- |
| 1    | Mở lệnh COMPLETED → thử nhấn **Hủy**  | Không có nút Hủy                                    |
| 2    | Gọi API `DELETE /transfer-orders/:id` | Server trả về 400: không thể hủy lệnh đã hoàn thành |


