# TC-08 — Journey: Xuất kho thủ công

## Phạm vi

Kiểm tra luồng xuất kho thủ công (không phải từ bán hàng hay điều chuyển): tạo phiếu xuất và kiểm tra tồn kho giảm.

> **Lưu ý thực tế:** Phiếu xuất kho **tự động POSTED ngay khi tạo** — không có trạng thái DRAFT trên UI (giống phiếu nhập kho).

**Người thực hiện mặc định:** Quản lý chi nhánh (`mgr-hcm@test.com`)  
**Môi trường:** Backoffice Web — Chi nhánh HCM  
**Điều kiện chung:** TAT-F (Tất thể thao) tồn kho ≥ 10 tại A-02

---

### TC-08-001: Xuất kho cơ bản → kiểm tra tồn kho giảm

> **Mục tiêu:** Xác nhận phiếu xuất kho thủ công khi tạo sẽ tự POSTED và trừ tồn kho đúng tại vị trí xuất

**Điều kiện:** TAT-F tồn kho ≥ 3 tại A-02 (ghi nhận trước khi test)  
**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
| ---- | -------- | ---------------- |
| 1 | Ghi nhận tồn kho TAT-F tại A-02 | Ví dụ: X đôi |
| 2 | Vào **Kho hàng → Xuất kho → Tạo phiếu xuất** | Form xuất kho hiển thị |
| 3 | Chọn mục đích: `Khác`; chọn lý do xuất | |
| 4 | Thêm hàng: `TAT-F`, SL=3, vị trí A-02 | Dòng hàng xuất hiện |
| 5 | Nhấn **Xác nhận** | Phiếu tự động POSTED, mã XK-... được tạo; tồn kho = X - 3 |

**Kiểm tra thêm:**
- [x] Stock ledger entry type = GOODS_ISSUE, quantity = -3
- [x] `postedAt` và `postedBy` được ghi nhận

---

~~### TC-08-002: Hủy phiếu xuất kho DRAFT~~

> **Bỏ TC này** — phiếu xuất kho tự động POSTED khi tạo, không có trạng thái DRAFT để hủy.


---

## Trường hợp biên & trường hợp lỗi

### TC-08-EF-001: Xuất kho với số lượng = 0

> **Mục tiêu:** Xác nhận hệ thống từ chối tạo phiếu khi số lượng không hợp lệ

| Bước | Thao tác | KQHT | KQMM |
| ---- | -------- | ---- | ---- |
| 1 | Tạo phiếu xuất kho, nhập SL=0 và nhấn Xác nhận | `lines.0.quantity must not be less than 0.01` | `Số lượng phải lớn hơn 0` |


---

### TC-08-EF-002: Xóa phiếu xuất kho đã POST

> **Mục tiêu:** Xác nhận xóa phiếu xuất đã POSTED hoàn trả tồn kho về kho

| Bước | Thao tác | Kết quả mong đợi |
| ---- | -------- | ---------------- |
| 1 | Ghi nhận tồn kho trước khi xóa | Ví dụ: Y đôi |
| 2 | Mở phiếu xuất đã POSTED → nhấn **Xóa** | Xác nhận xóa |
| 3 | Xác nhận | Phiếu bị xóa; tồn kho = Y + số lượng đã xuất |


