# TC-08 — Journey: Xuất kho thủ công

## Phạm vi

Kiểm tra luồng xuất kho thủ công (không phải từ bán hàng hay điều chuyển): tạo phiếu xuất DRAFT, xác nhận POST và kiểm tra tồn kho giảm.

**Người thực hiện mặc định:** Quản lý chi nhánh (`mgr-hcm@test.com`)  
**Môi trường:** Backoffice Web — Chi nhánh HCM  
**Điều kiện chung:** TAT-F (Tất thể thao) tồn kho ≥ 10 tại A-02

---

### TC-08-001: Xuất kho cơ bản DRAFT → POSTED → kiểm tra tồn kho giảm

> **Mục tiêu:** Xác nhận phiếu xuất kho thủ công khi POST sẽ trừ tồn kho đúng tại vị trí xuất

**Điều kiện:** TAT-F tồn kho = 15 tại A-02  
**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Ghi nhận tồn kho TAT-F tại A-02 | Ví dụ: 15 đôi |
| 2 | Vào **Kho hàng → Xuất kho → Tạo phiếu xuất** | Form xuất kho hiển thị |
| 3 | Chọn mục đích: `Khác`; chọn lý do xuất | |
| 4 | Thêm hàng: `TAT-F` (Tất thể thao), SL=3, vị trí A-02 | Dòng hàng xuất hiện |
| 5 | Lưu nháp | Phiếu DRAFT; tồn kho chưa thay đổi |
| 6 | Nhấn **Xác nhận xuất kho (POST)** | Phiếu POSTED; mã XK-... được tạo |
| 7 | Kiểm tra tồn kho TAT-F tại A-02 | = 15 - 3 = 12 |

**Kiểm tra thêm:**
- [ ] Stock ledger entry type = GOODS_ISSUE, quantity = -3
- [ ] `postedAt` và `postedBy` được ghi nhận

---

### TC-08-002: Hủy phiếu xuất kho DRAFT

> **Mục tiêu:** Xác nhận phiếu xuất kho DRAFT có thể hủy và tồn kho không bị ảnh hưởng

**Điều kiện:** Có phiếu xuất kho DRAFT chưa POST  
**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Tạo phiếu xuất kho DRAFT với `TAT-F`, SL=2 | Phiếu DRAFT |
| 2 | Nhấn **Hủy phiếu** → xác nhận | Phiếu bị hủy |
| 3 | Kiểm tra tồn kho TAT-F | Không thay đổi |

---

## Trường hợp biên & trường hợp lỗi

### TC-08-EF-001: Xuất kho khi tồn kho = 0

> **Mục tiêu:** Xác nhận hệ thống từ chối POST phiếu xuất khi không đủ tồn kho tại vị trí chỉ định

**Điều kiện:** TSNAM-A-39 tồn kho = 0 tại A-01

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Tạo phiếu xuất kho: TSNAM-A-39, SL=1, vị trí A-01 | Phiếu DRAFT tạo được |
| 2 | Nhấn **Xác nhận xuất kho (POST)** | Hệ thống báo lỗi: không đủ tồn kho tại vị trí A-01 |
| 3 | Kiểm tra tồn kho TSNAM-A-39 | Vẫn = 0 |

---

### TC-08-EF-002: Cố hủy phiếu xuất kho đã POST

> **Mục tiêu:** Xác nhận phiếu xuất đã POST là bất biến

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Mở phiếu xuất đã POSTED | Hiển thị read-only |
| 2 | Tìm nút Hủy / Cancel | Nút bị ẩn hoặc disabled |
| 3 | Gọi API `POST /inventory/goods-issues/:id/cancel` | Server trả về 400: không thể hủy phiếu đã POST |
