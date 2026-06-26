# TC-04 — Journey: Chuyển kho tạm (POS)

## Phạm vi

Kiểm tra luồng chuyển hàng qua kho tạm trong POS: di chuyển hàng giữa kho lưu trữ và showroom để chuẩn bị bán hàng. Dùng session-based temp warehouse, sau đó hoàn tất để tạo stock transfer thực sự.

**Người thực hiện mặc định:** Nhân viên (`staff-hcm@test.com`)  
**Môi trường:** POS Web (`http://localhost:3001`) — Chi nhánh HCM  
**Điều kiện chung:** TSNAM-A-40 có tồn kho ≥ 5 tại `Kho lưu trữ HCM` (nhập từ TC-02)

---

### TC-04-001: Chuyển hàng từ kho lưu trữ → showroom

> **Mục tiêu:** Xác nhận nhân viên có thể tạo yêu cầu chuyển hàng từ kho vào showroom qua kho tạm, đóng session và tồn kho được cập nhật

**Điều kiện:** TSNAM-A-40 tồn kho = 5 tại vị trí A-01 (Kho lưu trữ HCM); Showroom HCM tồn TSNAM-A-40 = 0  
**Người thực hiện:** Nhân viên

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào POS → menu **Chuyển kho tạm** | Giao diện kho tạm hiển thị, session mới tự tạo nếu chưa có |
| 2 | Nhấn **Thêm hàng** | Form thêm mặt hàng xuất hiện |
| 3 | Tìm và chọn `Giày thể thao Nam A (40)` (Giày thể thao Nam A), hướng: **Kho → Showroom** | Mặt hàng thêm vào danh sách với direction WAREHOUSE_TO_SHOWROOM |
| 4 | Chỉnh số lượng: 3 | SL = 3 |
| 5 | Xem danh sách kho tạm | Dòng hàng TSNAM-A-40, hướng W→S, SL=3 |
| 6 | Nhấn **Hoàn tất** (đóng session, tạo transfer) | Xác nhận đóng session |
| 7 | Xác nhận đóng → chọn mode CREATE_TRANSFERS | Session CLOSED, transfer được tạo async |
| 8 | Chờ transfer xử lý xong → kiểm tra tồn kho | Kho lưu trữ A-01: TSNAM-A-40 = 5 - 3 = 2; Showroom SH-01 hoặc Mặc định: TSNAM-A-40 = 3 |

**Kiểm tra thêm:**
- [ ] Session chuyển status từ ACTIVE → CLOSED
- [ ] StockTransferEntity được tạo và POSTED
- [ ] Tồn kho tại kho nguồn giảm, kho đích tăng đúng số lượng

---

### TC-04-002: Chuyển hàng từ showroom → kho lưu trữ

> **Mục tiêu:** Xác nhận luồng chuyển ngược (trả hàng từ showroom về kho) hoạt động đúng

**Điều kiện:** Showroom HCM có `TAT-F` (Tất thể thao) tồn = 5 (đã chuyển vào showroom trước đó)  
**Người thực hiện:** Nhân viên

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào POS → Chuyển kho tạm → Thêm hàng | |
| 2 | Chọn `TAT-F` (Tất thể thao), hướng: **Showroom → Kho** | Direction SHOWROOM_TO_WAREHOUSE |
| 3 | Số lượng = 2 | |
| 4 | Hoàn tất session → CREATE_TRANSFERS | Session CLOSED |
| 5 | Kiểm tra tồn kho | Showroom giảm 2; Kho lưu trữ tăng 2 |

---

### TC-04-003: Kiểm tra tồn kho tại 2 vị trí sau khi hoàn thành session

> **Mục tiêu:** Xác nhận số liệu tồn kho sau chuyển kho tạm phản ánh đúng ở cả kho nguồn và kho đích

**Điều kiện:** Đã thực hiện TC-04-001 và TC-04-002  
**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào Backoffice → **Kho hàng → Tồn kho** | Danh sách tồn kho hiển thị |
| 2 | Lọc theo kho: `Kho lưu trữ HCM` | Hiển thị tồn kho theo kho lưu trữ |
| 3 | Kiểm tra TSNAM-A-40 tại A-01 | SL = 2 (sau khi chuyển 3 vào showroom) |
| 4 | Lọc theo kho: `Showroom HCM` | Hiển thị tồn kho showroom |
| 5 | Kiểm tra TSNAM-A-40 tại SH-01 hoặc vị trí Mặc định | SL = 3 |
| 6 | Vào Báo cáo → Hàng hóa xuất kho tạm | Hiển thị giao dịch chuyển kho tạm vừa thực hiện |

**Kiểm tra thêm:**
- [ ] Tổng tồn kho TSNAM-A-40 toàn chi nhánh không thay đổi (= tổng kho trước khi chuyển)
- [ ] Stock transfer được POST với movement type TRANSFER_OUT (kho nguồn) + TRANSFER_IN (kho đích)

---

## Trường hợp biên & trường hợp lỗi

### TC-04-EF-001: Thêm hàng vào kho tạm khi cả 2 vị trí đều có tồn (direction không rõ)

> **Mục tiêu:** Xác nhận hệ thống yêu cầu chọn hướng thủ công khi không thể tự xác định

**Điều kiện:** TSNAM-A-39 có tồn kho ở cả Kho lưu trữ HCM (A-01) VÀ Showroom HCM (SH-01)

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào Chuyển kho tạm → Thêm hàng → chọn `Giày thể thao Nam A (39)`, không chọn hướng | |
| 2 | Xác nhận thêm | Hệ thống báo lỗi: không thể xác định hướng tự động; yêu cầu chọn hướng thủ công |
| 3 | Thêm lại với hướng cụ thể: **Kho → Showroom** | Thêm thành công |

---

### TC-04-EF-002: Thêm hàng không có tồn kho ở bất kỳ vị trí nào

> **Mục tiêu:** Xác nhận hành vi khi hàng hóa có tồn = 0 ở cả hai phía

**Điều kiện:** Tìm 1 mặt hàng có tồn = 0 ở cả kho và showroom

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Thêm mặt hàng tồn = 0, không chọn hướng | Hệ thống báo lỗi hoặc yêu cầu chỉ định hướng thủ công |
| 2 | Chọn hướng thủ công: Kho → Showroom, SL=1 | Thêm được (kho tạm không kiểm tra tồn kho) |

> **Lưu ý:** Kho tạm không validate tồn kho — transfer thực tế sau đó có thể gây tồn âm.
