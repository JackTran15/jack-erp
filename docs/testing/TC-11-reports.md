# TC-11 — Journey: Báo cáo

## Phạm vi

Kiểm tra toàn bộ 16 báo cáo của hệ thống: 8 báo cáo kho, 4 báo cáo bán hàng, dashboard + công nợ + 2 báo cáo quỹ tiền. Tất cả báo cáo phải phản ánh đúng dữ liệu từ các thao tác ở TC-02 đến TC-10.

**Điều kiện chung:**
- Đã thực hiện TC-02 → TC-10 (có dữ liệu nhập/xuất/bán hàng/kiểm kê/điều chuyển)
- Biết chính xác các số liệu đã thực hiện (số lượng nhập, xuất, bán, trả)

**Lưu ý về phân quyền báo cáo:**
- Quản lý chi nhánh (`mgr-hcm@test.com`): xem báo cáo chi nhánh HCM; không thấy HN
- Quản lý tổng (`gm@test.com`): xem báo cáo toàn hệ thống (cả HCM + HN)

**Lưu ý về giá trong báo cáo:**
| Báo cáo | Giá hiển thị | Nguồn dữ liệu |
|---------|-------------|---------------|
| Báo cáo nhập kho (TC-11-002) | **Giá mua** (giá nhập kho) | `GoodsReceiptLine.unitPrice` — ví dụ: TSNAM-A = 500,000 |
| Báo cáo doanh thu / bán hàng (TC-11-009 → 012) | **Giá bán** | `InvoiceItem.unitPrice` — ví dụ: TSNAM-A = 800,000 |
| Lợi nhuận / giá vốn (nếu có) | **Giá vốn** | `InvoiceItem.costPrice` — server tự fill từ giá mua mặc định |

---

## A. Báo cáo Kho (8 loại — Phụ lục mục 2.4)

---

### TC-11-001: Tổng hợp Nhập – Xuất – Tồn kho

> **Mục tiêu:** Xác nhận báo cáo tổng hợp nhập xuất tồn phản ánh đúng tất cả phiếu trong kỳ

**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào **Báo cáo → Tổng hợp nhập xuất tồn kho** | Báo cáo hiển thị |
| 2 | Lọc: chi nhánh HCM, ngày = hôm nay | |
| 3 | Kiểm tra cột **Nhập** của từng mặt hàng | Khớp với tổng số lượng đã nhập (TC-02) |
| 4 | Kiểm tra cột **Xuất** | Khớp với tổng xuất kho + bán hàng (TC-03, TC-08) |
| 5 | Kiểm tra cột **Điều chỉnh** | Phản ánh kiểm kê kho (TC-09) |
| 6 | Kiểm tra cột **Tồn cuối** | = Tồn đầu + Nhập - Xuất ± Điều chỉnh |

**Kiểm tra thêm:**
- [ ] Bộ lọc theo mặt hàng thu hẹp kết quả đúng
- [ ] Bộ lọc theo khoảng ngày hoạt động

---

### TC-11-002: Bảng kê chi tiết phiếu nhập xuất kho

> **Mục tiêu:** Xác nhận bảng kê liệt kê từng phiếu nhập/xuất với đầy đủ thông tin

**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào **Báo cáo → Bảng kê chi tiết phiếu nhập xuất** | Báo cáo hiển thị |
| 2 | Lọc theo chi nhánh HCM, hôm nay | Danh sách phiếu trong ngày |
| 3 | Kiểm tra phiếu nhập (PNK-...) từ TC-02 | Xuất hiện đúng mã phiếu, ngày, số lượng |
| 4 | Kiểm tra phiếu xuất (XK-...) từ TC-08 | Xuất hiện đúng |
| 5 | Lọc theo loại phiếu: **Nhập** | Chỉ thấy phiếu nhập |
| 6 | Lọc theo loại phiếu: **Xuất** | Chỉ thấy phiếu xuất |

---

### TC-11-003: Chi tiết số lượng nhập – xuất – tồn theo mặt hàng

> **Mục tiêu:** Xác nhận báo cáo drill-down từng mặt hàng với lịch sử từng giao dịch

**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào **Báo cáo → Chi tiết nhập xuất tồn theo mặt hàng** | |
| 2 | Chọn mặt hàng: TSNAM-A-38 | |
| 3 | Xem các giao dịch trong ngày | Mỗi giao dịch (nhập TC-02, bán TC-03, trả TC-10) xuất hiện thành từng dòng riêng |
| 4 | Kiểm tra số dư cuối mỗi giao dịch | Số dư tích lũy đúng theo thứ tự thời gian |

---

### TC-11-004: Tổng hợp Nhập – Xuất – Tồn theo từng cửa hàng

> **Mục tiêu:** Xác nhận Quản lý tổng thấy được so sánh tồn kho giữa các chi nhánh

**Người thực hiện:** Quản lý tổng

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Đăng nhập `gm@test.com` → Báo cáo → **Tổng hợp nhập xuất tồn theo cửa hàng** | |
| 2 | Xem báo cáo | Cả Chi nhánh HCM và Chi nhánh HN xuất hiện |
| 3 | Kiểm tra cột HCM | Tổng nhập, xuất, tồn Chi nhánh HCM đúng |
| 4 | Kiểm tra cột HN | Thấy tồn kho sau khi nhận từ điều chuyển TC-07 |
| 5 | Đăng nhập `mgr-hcm@test.com` → cùng báo cáo | Chỉ thấy cột Chi nhánh HCM (không có HN) |

---

### TC-11-005: Số lượng tồn kho theo từng cửa hàng

> **Mục tiêu:** Xác nhận báo cáo tồn kho dạng pivot: mặt hàng × chi nhánh

**Người thực hiện:** Quản lý tổng

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào **Báo cáo → Tồn kho theo cửa hàng** | Bảng tồn kho mỗi mặt hàng theo chi nhánh |
| 2 | Kiểm tra TSNAM-A-38 | Tồn HCM và tồn HN đúng với thực tế |
| 3 | Kiểm tra TSNAM-A-40 | Tồn HCM giảm (sau chuyển kho tạm TC-04); Showroom HCM tăng |

---

### TC-11-006: Tổng hợp Nhập – Xuất điều chuyển

> **Mục tiêu:** Xác nhận báo cáo điều chuyển phản ánh lệnh điều chuyển TC-07

**Người thực hiện:** Quản lý tổng / chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào **Báo cáo → Tổng hợp nhập xuất điều chuyển** | |
| 2 | Lọc theo ngày hôm nay | |
| 3 | Kiểm tra dòng điều chuyển từ HCM → HN | TSNAM-A-38, số lượng = 5, trạng thái COMPLETED |
| 4 | Kiểm tra tổng xuất điều chuyển HCM | = 5 |
| 5 | Kiểm tra tổng nhập điều chuyển HN | = 5 |

---

### TC-11-007: Hàng hóa điều chuyển theo cửa hàng

> **Mục tiêu:** Xác nhận báo cáo liệt kê hàng hóa đã điều chuyển, phân theo chi nhánh gửi và nhận

**Người thực hiện:** Quản lý tổng

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào **Báo cáo → Hàng hóa điều chuyển theo cửa hàng** | |
| 2 | Lọc: khoảng ngày hôm nay | |
| 3 | Kiểm tra dòng: TSNAM-A-38, HCM → HN | SL = 5, đúng ngày thực hiện |

---

### TC-11-008: Hàng hóa xuất kho tạm

> **Mục tiêu:** Xác nhận báo cáo hàng hóa xuất kho tạm phản ánh session TC-04

**Người thực hiện:** Quản lý chi nhánh HCM

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào **Báo cáo → Hàng hóa xuất kho tạm** | |
| 2 | Lọc chi nhánh HCM, hôm nay | |
| 3 | Tìm giao dịch TSNAM-A-40 từ TC-04-001 | Hướng: Kho → Showroom, SL = 3 |
| 4 | Tìm giao dịch `TAT-F` từ TC-04-002 | Hướng: Showroom → Kho, SL = 2 |

---

## B. Báo cáo Bán hàng (4 loại — Phụ lục mục 1.3)

---

### TC-11-009: Tổng hợp bán hàng theo ngày

> **Mục tiêu:** Xác nhận báo cáo doanh thu ngày khớp với tổng hóa đơn bán trong ngày

**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Tính tổng doanh thu bán hàng trong ngày từ TC-03 | Ví dụ: D đồng |
| 2 | Vào **Báo cáo → Tổng hợp bán hàng theo ngày** | |
| 3 | Lọc chi nhánh HCM, hôm nay | |
| 4 | Kiểm tra tổng doanh thu | = D đồng |
| 5 | Kiểm tra số lượng hóa đơn | Khớp với số hóa đơn đã tạo |
| 6 | Kiểm tra doanh thu trừ trả hàng | = D - tổng trả hàng (TC-10) |

---

### TC-11-010: Bảng kê hóa đơn và đơn hàng

> **Mục tiêu:** Xác nhận bảng kê liệt kê đầy đủ tất cả hóa đơn với bộ lọc đa dạng

**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào **Báo cáo → Bảng kê hóa đơn** | Danh sách hóa đơn |
| 2 | Lọc theo trạng thái: PAID | Chỉ thấy hóa đơn đã thanh toán |
| 3 | Lọc theo trạng thái: RETURN | Thấy hóa đơn trả hàng từ TC-10 |
| 4 | Lọc theo khách hàng: KH-001 | Thấy hóa đơn TC-03-002, TC-03-003, TC-10 |
| 5 | Lọc theo khoảng tiền | Chỉ thấy hóa đơn trong khoảng lọc |
| 6 | Xuất Excel (nếu có) | File Excel tải về được mở đúng |

---

### TC-11-011: Chi tiết doanh thu theo đơn hàng và mặt hàng

> **Mục tiêu:** Xác nhận báo cáo drill-down từng hóa đơn → từng dòng hàng với số liệu đúng

**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào **Báo cáo → Chi tiết doanh thu theo đơn hàng** | |
| 2 | Lọc hôm nay, chi nhánh HCM | |
| 3 | Kiểm tra hóa đơn TC-03-001 | Có dòng: TSNAM-A-38, SL=2, đơn giá=800,000, thành tiền=1,600,000 |
| 4 | Kiểm tra hóa đơn TC-03-004 (bán chịu) | Tổng tiền, tiền đã trả, còn nợ đúng |

---

### TC-11-012: Doanh thu theo mặt hàng

> **Mục tiêu:** Xác nhận báo cáo tổng hợp doanh thu phân theo từng mặt hàng

**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào **Báo cáo → Doanh thu theo mặt hàng** | |
| 2 | Lọc hôm nay, chi nhánh HCM | |
| 3 | Kiểm tra TSNAM-A-38 | SL bán = đúng tổng từ các TC-03; Doanh thu = SL × đơn giá |
| 4 | Kiểm tra TAT-F (Tất thể thao) | SL bán = đúng từ TC-03; Doanh thu = SL × 50,000 |

---

## C. Dashboard & Vận hành

---

### TC-11-013: Dashboard tổng quan hôm nay

> **Mục tiêu:** Xác nhận dashboard hiển thị đúng các chỉ số tổng quan trong ngày

**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Đăng nhập Backoffice → Trang chủ / Dashboard | Dashboard tải được |
| 2 | Kiểm tra **Doanh thu hôm nay** | Khớp với tổng hóa đơn PAID hôm nay |
| 3 | Kiểm tra **Số hóa đơn hôm nay** | Khớp với số hóa đơn tạo hôm nay |
| 4 | Kiểm tra **Tồn kho thấp** (nếu có) | Hiển thị các mặt hàng có tồn < ngưỡng cảnh báo |
| 5 | Kiểm tra **Số ca đang mở** | Khớp với số POS session đang ACTIVE_SALES |

---

### TC-11-014: Công nợ phải thu theo tuổi nợ (Receivables Aging)

> **Mục tiêu:** Xác nhận báo cáo công nợ phải thu phản ánh đúng hóa đơn bán chịu từ TC-03-004

**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào **Báo cáo → Công nợ phải thu** | Báo cáo aging hiển thị |
| 2 | Tìm KH-001 trong danh sách | Có công nợ từ TC-03-004: remainingAmount = 1,000,000 |
| 3 | Kiểm tra nhóm tuổi nợ | Hóa đơn hôm nay: thuộc nhóm "Hiện tại" (Current) |

---

## D. Báo cáo Quỹ tiền

---

### TC-11-015: Sổ chi tiết tiền mặt (Cash Ledger)

> **Mục tiêu:** Xác nhận sổ chi tiết phản ánh tất cả giao dịch tiền từ bán hàng, phiếu thu/chi, kiểm kê tiền từ TC-05 và TC-06

**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào **Quỹ tiền → Sổ chi tiết → Quầy 1 - HCM** | Sổ chi tiết hiển thị |
| 2 | Lọc theo ngày hôm nay | |
| 3 | Kiểm tra DEPOSIT từ bán hàng (TC-05-003) | Có dòng DEPOSIT với số tiền = doanh thu tiền mặt bán hàng |
| 4 | Tính **Số dư cuối** | = Số dư đầu + Tổng DEPOSIT - Tổng WITHDRAWAL |
| 5 | So sánh số dư cuối với số dư hiển thị trên Cash Account | Phải khớp nhau |

---

### TC-11-016: Đối soát tiền mặt cuối ca

> **Mục tiêu:** Xác nhận báo cáo đối soát ca phản ánh đúng kết quả kiểm đếm từ TC-05

**Người thực hiện:** Quản lý chi nhánh

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào **Báo cáo → Đối soát tiền mặt cuối ca** | |
| 2 | Tìm ca đã đóng từ TC-05 | Ca xuất hiện trong danh sách |
| 3 | Kiểm tra thông tin ca | Quỹ đầu ca = 500,000; tiền kỳ vọng; tiền thực đếm; chênh lệch |
| 4 | Kiểm tra trạng thái duyệt | Khớp với kết quả TC-05-004 (auto approve) hoặc TC-05-005 (duyệt thủ công) |


---

## Trường hợp biên & trường hợp lỗi

### TC-11-EF-001: Báo cáo với khoảng ngày không có dữ liệu

> **Mục tiêu:** Xác nhận báo cáo trả về kết quả rỗng (không lỗi) khi không có dữ liệu trong kỳ

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào Báo cáo tổng hợp nhập xuất tồn | |
| 2 | Lọc ngày: khoảng tương lai (ví dụ: 2030-01-01 → 2030-01-31) | |
| 3 | Xem kết quả | Bảng rỗng hoặc tất cả giá trị = 0; không có thông báo lỗi |

---

### TC-11-EF-002: Quản lý chi nhánh cố xem báo cáo consolidated toàn hệ thống

> **Mục tiêu:** Xác nhận Quản lý chi nhánh không thể xem dữ liệu vượt phạm vi chi nhánh mình

**Điều kiện:** Đăng nhập `mgr-hcm@test.com`

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Vào Báo cáo → Tổng hợp nhập xuất tồn theo cửa hàng | |
| 2 | Kiểm tra danh sách chi nhánh hiển thị | Chỉ thấy Chi nhánh HCM; không có Chi nhánh HN |
| 3 | Gọi API report với filter `branchId` của Chi nhánh HN | Server trả về 403 hoặc kết quả rỗng |

---

### TC-11-EF-003: Báo cáo với filter ngày đảo ngược (startDate > endDate)

> **Mục tiêu:** Xác nhận hệ thống xử lý đúng khi filter ngày không hợp lệ

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Nhập startDate = 2026-06-30, endDate = 2026-06-01 (start > end) | |
| 2 | Xem kết quả | Hệ thống báo lỗi validation hoặc tự hoán vị start/end và hiển thị kết quả |
