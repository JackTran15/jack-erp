# Báo cáo test — 11 Báo cáo

---

## Thông tin phiên test

| Mục | Giá trị |
| --- | --- |
| **Test case** | TC-11 — Báo cáo |
| **Người test** | LocTran |
| **Ngày test** | 2026-06-26 |
| **Ứng dụng** | Backoffice Web |
| **Môi trường** | `http://localhost:3000` / API `:4000` |
| **Tài khoản** | Quản lý chi nhánh (`mgr-hcm@test.com`) & Quản lý tổng (`gm@test.com`) |

**Trạng thái phiên:** 🔧 Đang test — 3/16 TC đã kiểm tra, tạm dừng chờ fix bug chung

---

## 1. Tóm tắt

### Thống kê (tạm thời — chỉ từ 3 TC đã test)

| | 🔴 Critical | 🟠 Major | 🟡 Minor | 💡 UX |
| --- | ---: | ---: | ---: | ---: |
| **Bug** | 0 | 2 | 1 | — |
| **UX** | — | 0 | 1 | 1 |

### Danh sách issue

| ID | Loại | Mức độ | Màn hình | TC ref | Tiêu đề | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | Bug | 🟠 Major | Backoffice › Báo cáo | TC-11-001 | Báo cáo tổng hợp nhập xuất tồn: sản phẩm bị tách thành nhiều dòng theo vị trí thay vì tổng hợp 1 dòng; thừa cột Mã vị trí / Tên vị trí | 🆕 Mới |
| BUG-002 | Bug | 🟠 Major | Backoffice › Báo cáo | TC-11-003 | Báo cáo chi tiết số lượng tồn theo mặt hàng: 1 sản phẩm xuất hiện nhiều dòng (mỗi kho/vị trí 1 dòng thay vì gộp thành 1) | 🆕 Mới |
| BUG-003 | Bug | 🟡 Minor | Backoffice › Báo cáo | TC-11-002 | Cột Tham chiếu trong bảng kê phiếu nhập xuất hiển thị `id` thay vì `code` | 🆕 Mới |
| BUG-004 | Bug | 🟡 Minor | Backoffice › Báo cáo | Chung | Bộ lọc bảng báo cáo TC-11-001 chỉ lọc FE, không gửi tham số lên BE | 🆕 Mới |
| UX-001 | UX | 💡 Gợi ý | Backoffice (header) | Chung | "Quản lý tổng" (`gm@test.com`) không có selector chi nhánh kế bên avatar — không rõ đang xem dữ liệu chi nhánh nào | 🆕 Mới |
| UX-002 | UX | 🟡 Minor | Backoffice › Báo cáo | TC-11-EF-002 | Phân quyền báo cáo mới có BE, chưa có FE — Quản lý chi nhánh HCM vẫn select được chi nhánh HN trên UI | 🆕 Mới |

---

## 2. Ghi chú chung trước khi tiếp tục test

BUG-001 và BUG-002 có cùng nguyên nhân gốc: **query báo cáo đang group by `(product, location)` thay vì chỉ `(product)`**. Khi sản phẩm có tồn kho ở nhiều vị trí → nhiều dòng. Cần fix SQL/aggregation ở BE trước rồi mới re-test TC-11-003 trở đi.

---

## 3. Chi tiết issue đã tìm thấy

### 📍 Backoffice › Báo cáo Kho

#### BUG-001 — Tổng hợp nhập xuất tồn: tách dòng theo vị trí

| KQHT | KQMM |
| --- | --- |
| 1 sản phẩm = N dòng (N = số vị trí); hiển thị cột Mã vị trí, Tên vị trí | 1 sản phẩm = 1 dòng tổng hợp; không có cột vị trí trong báo cáo tổng hợp |

**Kỹ thuật:** Query SELECT group by `(inventoryItemId, locationId)` — cần bỏ `locationId` khỏi GROUP BY, xóa 2 cột vị trí khỏi SELECT.

---

#### BUG-002 — Chi tiết số lượng tồn theo mặt hàng: trùng dòng sản phẩm

| KQHT | KQMM |
| --- | --- |
| 1 sản phẩm xuất hiện nhiều dòng (1 dòng/vị trí/kho) | 1 sản phẩm = 1 dòng duy nhất, tổng hợp tất cả kho/vị trí |

Cùng gốc với BUG-001.

---

#### BUG-003 — Cột Tham chiếu hiển thị `id` thay vì `code`

| KQHT | KQMM |
| --- | --- |
| Cột tham chiếu hiển thị UUID (ví dụ: `3f4a1c2d-...`) | Hiển thị mã chứng từ (ví dụ: `PNK-202606-00001`) |

---

#### BUG-004 — Bộ lọc báo cáo TC-11-001 chỉ lọc FE

Bộ lọc trên bảng chỉ filter dữ liệu đang render trên FE, không gửi params lên API — khi data nhiều trang, filter sẽ bỏ sót dữ liệu.

---

### 📍 Backoffice (header chung)

#### UX-001 — Quản lý tổng thiếu branch selector

`mgr-hcm` có dropdown chi nhánh trên header; `gm@test.com` không có — UI không cho thấy đang xem tổng hay theo chi nhánh nào.

---

#### UX-002 — FE chưa enforce phân quyền báo cáo theo chi nhánh

BE đã giới hạn data theo `organizationId`/`branchId`. FE chưa ẩn/disable dropdown chi nhánh theo role — Quản lý chi nhánh HCM vẫn chọn được HN trên UI (dù BE sẽ trả về 403/rỗng).

---

## 4. Kết quả chạy TC-11 (tạm thời)

| TC | Tên | Kết quả | Ghi chú |
| --- | --- | --- | --- |
| TC-11-001 | Tổng hợp nhập xuất tồn kho | ❌ NG | BUG-001 + BUG-004 |
| TC-11-002 | Bảng kê chi tiết phiếu nhập xuất | ⚠️ Pass | Data đúng; BUG-003: tham chiếu dùng id |
| TC-11-003 | Chi tiết số lượng tồn theo mặt hàng | ❌ NG | BUG-002 |
| TC-11-004 | Tổng hợp nhập xuất tồn theo cửa hàng | ⏳ Chờ fix | — |
| TC-11-005 | Tồn kho theo cửa hàng | ⏳ Chờ fix | — |
| TC-11-006 | Tổng hợp nhập xuất điều chuyển | ⏳ Chờ fix | — |
| TC-11-007 | Hàng hóa điều chuyển theo cửa hàng | ⏳ Chờ fix | — |
| TC-11-008 | Hàng hóa xuất kho tạm | ⏳ Chờ fix | — |
| TC-11-009 | Tổng hợp bán hàng theo ngày | ⏳ Chờ fix | — |
| TC-11-010 | Bảng kê hóa đơn và đơn hàng | ⏳ Chờ fix | — |
| TC-11-011 | Chi tiết doanh thu theo đơn hàng & mặt hàng | ⏳ Chờ fix | — |
| TC-11-012 | Doanh thu theo mặt hàng | ⏳ Chờ fix | — |
| TC-11-013 | Dashboard tổng quan hôm nay | ⏳ Chờ fix | — |
| TC-11-014 | Công nợ phải thu (Receivables Aging) | ⏳ Chờ fix | — |
| TC-11-015 | Sổ chi tiết tiền mặt | ⏳ Chờ fix | — |
| TC-11-016 | Đối soát tiền mặt cuối ca | ⏳ Chờ fix | — |

---

## Sign-off

_Chưa hoàn thành — tạm dừng chờ fix BUG-001/002 (group-by location) và BUG-003/004 trước khi re-test toàn bộ TC-11._
