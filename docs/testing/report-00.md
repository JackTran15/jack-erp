# Báo cáo test — 00 Setup / ENV

---

## Thông tin phiên test

| Mục | Giá trị |
| --- | --- |
| **Test case** | ENV-00 — Setup / Môi trường test |
| **Người test** | LocTran |
| **Ngày test** | 2026-06-26 |
| **Ứng dụng** | Backoffice |
| **Môi trường** | `http://localhost:3000` / API `:4000` |
| **Tài khoản** | Inventory Admin (`inventory.admin@erp.local`) |

**Trạng thái phiên:** 🟢 Hoàn thành *(dữ liệu setup xong, còn issue cần dev fix)*

---

## 1. Tóm tắt

### Thống kê

| | 🔴 Critical | 🟠 Major | 🟡 Minor | 💡 UX |
| --- | ---: | ---: | ---: | ---: |
| **Bug** | 1 | 6 | 0 | — |
| **UX** | — | 3 | 2 | 7 |

### Danh sách issue

| ID | Loại | Mức độ | Màn hình | TC ref | Tiêu đề | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | Bug | 🟠 Major | Danh mục › KHÁC › Nhân viên | Bước 13–16 | "Lưu và thêm mới" đóng dialog | 🆕 Mới |
| BUG-002 | Bug | 🔴 Critical | Danh mục › KHÁCH HÀNG › Khách hàng | Bước 33 | Lỗi `code` null khi tạo KH | 🆕 Mới |
| BUG-003 | Bug | 🟠 Major | Danh mục › KHÁCH HÀNG › Khách hàng | Bước 33 | Lỗi `code` null khi nhân bản | 🆕 Mới |
| BUG-004 | Bug | 🟠 Major | Danh mục › HÀNG HÓA › Hàng hoá | Bước 21–30 | Checkbox POS: lưu xong mất trạng thái checked | 🆕 Mới |
| BUG-005 | Bug | 🟠 Major | Danh mục › HÀNG HÓA › Hàng hoá | Bước 21–30 | "Lưu và nhân bản" không hoạt động đúng | 🆕 Mới |
| BUG-006 | Bug | 🟠 Major | Danh mục › HÀNG HÓA › Hàng hoá | Bước 21–30 | Nhân bản từ list không đúng | 🆕 Mới |
| BUG-007 | Bug | 🟠 Major | Danh mục › HÀNG HÓA › Hàng hoá | Bước 21–30 | "Lưu và thêm mới" không hoạt động đúng | 🆕 Mới |
| UX-001 | UX | 🟠 Cần sửa | Danh mục › HÀNG HÓA › Nhóm hàng hoá | Bước 17–20 | Thiếu nút "Lưu và thêm mới" | 🆕 Mới |
| UX-002 | UX | 🟡 Nhỏ | Danh mục › HÀNG HÓA › Nhóm hàng hoá | Bước 17–20 | Dropdown @ui bị overscroll | 🆕 Mới |
| UX-003 | UX | 🟠 Cần sửa | Danh mục › HÀNG HÓA › Nhóm hàng hoá | Bước 17–20 | Select nhóm HH chưa đồng bộ theo level | 🆕 Mới |
| UX-004 | UX | 🟠 Cần sửa | Danh mục › HÀNG HÓA › Hàng hoá | Bước 21–30 | Select theo level; bỏ search dialog | 🆕 Mới |
| UX-005 | UX | 💡 Gợi ý | Danh mục › HÀNG HÓA › Hàng hoá | Bước 21–30 | Layout giống dialog thêm nhóm HH | 🆕 Mới |
| UX-006 | UX | 🟡 Nhỏ | Danh mục › HÀNG HÓA › Hàng hoá | Bước 21–30 | Checkbox POS fullwidth, dễ nhấn nhầm | 🆕 Mới |
| UX-007 | UX | 💡 Gợi ý | Danh mục › HÀNG HÓA › Hàng hoá | Bước 21–30 | Status mặc định "Đang hoạt động" | 🆕 Mới |
| UX-008 | UX | 💡 Gợi ý | Danh mục › KHÁCH HÀNG › Khách hàng | Bước 33 | Bỏ dòng mô tả sao chép | 🆕 Mới |
| UX-009 | UX | 🟠 Cần sửa | Danh mục › KHÁCH HÀNG › Khách hàng | Bước 33–34 | Thiếu nút "Lưu và thêm mới" | 🆕 Mới |
| UX-010 | UX | 💡 Gợi ý | Danh mục › KHÁCH HÀNG › Khách hàng | Bước 34 | Gán thẻ thành viên ngay trên form | 🆕 Mới |
| UX-011 | UX | 💡 Gợi ý | Danh mục › NHÀ CUNG CẤP › Nhà cung cấp | Bước 31 | Layout ngang, vừa 1 màn hình | 🆕 Mới |
| UX-012 | UX | 💡 Gợi ý | Danh mục › NHÀ CUNG CẤP › Nhà cung cấp | Bước 31 | Status mặc định "Đang theo dõi" | 🆕 Mới |

---

## 2. Chi tiết theo màn hình

### 📍 Backoffice › Danh mục › KHÁC › Nhân viên

**TC liên quan:** Bước 13–16  
**Route:** `/admin/employees`

#### BUG-001 — "Lưu và thêm mới" đóng dialog

| | |
| --- | --- |
| Mức độ | 🟠 Major |
| Trạng thái | 🆕 Mới |

| KQHT | KQMM |
| --- | --- |
| Bấm **Lưu và thêm mới** → dialog đóng | Lưu thành công, dialog **mở**, form reset để thêm nhân viên tiếp |

---

### 📍 Backoffice › Danh mục › HÀNG HÓA › Nhóm hàng hoá

**TC liên quan:** Bước 17–20

#### UX-001 — Thiếu nút "Lưu và thêm mới"

**Đề xuất:** Thêm nút **Lưu và thêm mới** — hành vi giống BUG-001 (lưu xong, giữ dialog, reset form). Nhất quán với pattern danh mục khác.

#### UX-002 — Dropdown @ui bị overscroll

**Hiện tại:** Panel dropdown cuộn quá mức (overscroll).  
**Đề xuất:** Giới hạn `max-height`, scroll nội bộ trong popover.

#### UX-003 — Select nhóm hàng hoá chưa đồng bộ theo level

**Hiện tại:** Các dropdown chọn nhóm HH chưa dùng pattern select theo cấp (level).  
**Đề xuất:** Đồng bộ select cascade theo level — giống UX-004 trên form Hàng hoá.

---

### 📍 Backoffice › Danh mục › HÀNG HÓA › Hàng hoá

**TC liên quan:** Bước 21–30  
**Route:** `/admin/inventory-items/new`, `/admin/inventory-items/:id`

#### UX-004 — Trường Nhóm hàng hoá

**Hiện tại:** Dùng search dialog; chưa select theo level.  
**Đề xuất:**

- Select nhóm hàng hoá **theo level** (cascade).
- **Bỏ** nút mở search dialog.

#### UX-005 — Dialog "Thêm nhanh" nhóm hàng hoá

**Đề xuất:** Sửa layout giống dialog **Thêm nhóm hàng hoá** ở Cài đặt (field, nút, thứ tự).

#### BUG-004 — Checkbox "Hiển thị trên màn hình bán hàng"

| KQHT | KQMM |
| --- | --- |
| Form khởi tạo với checkbox **checked**; sau khi lưu xong, giá trị **không còn checked**. Phải bỏ chọn rồi chọn lại mới thêm mới được | Sau lưu, trạng thái checkbox **khớp** giá trị đã chọn khi tạo |

#### UX-006 — Checkbox POS fullwidth

**Hiện tại:** Checkbox chiếm full width, dễ nhấn nhầm.  
**Đề xuất:** Thu gọn vùng click — inline với label, không fullwidth.

#### BUG-005 — "Lưu và nhân bản"

| KQHT | KQMM |
| --- | --- |
| Không hoạt động đúng | Tạo item mới, **ở lại** trang thêm mới, **copy tất cả field trừ mã (code/SKU)** |

#### BUG-007 — "Lưu và thêm mới"

| KQHT | KQMM |
| --- | --- |
| Không hoạt động đúng | Tạo item mới, **ở lại** trang thêm mới, **reset form** (trống) |

#### UX-007 — Status mặc định khi thêm mới

**Đề xuất:** Trường trạng thái mặc định = **Đang hoạt động**.

---

### 📍 Backoffice › Danh mục › HÀNG HÓA › Hàng hoá (danh sách)

**Route:** `/admin/inventory-items`

#### BUG-006 — Nhân bản từ danh sách

| KQHT | KQMM |
| --- | --- |
| Nhân bản không đúng | Navigate đến trang **thêm mới**, copy **tất cả field trừ mã (code/SKU)** |

---

### 📍 Backoffice › Danh mục › KHÁCH HÀNG › Khách hàng

**TC liên quan:** Bước 32–34  
**Route:** `/admin/customers`

#### BUG-002 — Thêm mới khách hàng

| KQHT | KQMM |
| --- | --- |
| Lỗi API: `QueryFailedError: null value in column "code" of relation "customers" violates not-null constraint` | Tạo KH thành công; mã tự sinh hoặc bắt buộc nhập trước khi lưu |

**Kỹ thuật:** `customers.code` NOT NULL — backend không auto-gen hoặc frontend không gửi field.

#### BUG-003 — Nhân bản khách hàng

| KQHT | KQMM |
| --- | --- |
| Cùng lỗi `code` null như BUG-002 | Nhân bản thành công; mã mới (trống hoặc suffix) để user chỉnh trước khi lưu |

#### UX-008 — Bỏ dòng mô tả khi nhân bản

**Đề xuất:** Xóa dòng: *"Dữ liệu đã được sao chép từ bản ghi đã chọn. Hãy chỉnh các trường bắt buộc (ví dụ mã, SKU) nếu trùng trước khi lưu."*

#### UX-009 — Thiếu "Lưu và thêm mới"

**Đề xuất:** Thêm nút **Lưu và thêm mới** trên form tạo/sửa — pattern thống nhất danh mục.

#### UX-010 — Gán thẻ thành viên trên form Thêm mới / Nhân bản

**Hiện tại:** Chỉ gán thẻ ở màn **chi tiết** khách hàng.  
**Đề xuất:** Cho phép gán thẻ ngay trên màn Thêm mới / Nhân bản (bước 34 setup).

---

### 📍 Backoffice › Danh mục › NHÀ CUNG CẤP › Nhà cung cấp

**TC liên quan:** Bước 31

#### UX-011 — Layout form Thêm / Sửa

**Hiện tại:** Form dọc, phải scroll nhiều.  
**Đề xuất:** Layout **ngang (horizontal)**, vừa **một màn hình** không cần scroll.

#### UX-012 — Status mặc định khi thêm mới

**Đề xuất:** Trạng thái mặc định = **Đang theo dõi**.

---

## 3. Kết quả chạy ENV-00 (setup checklist)

> ENV-00 không có mã TC-XX-YYY; map theo **bước** trong `TC-00-setup.md`.

| Bước | Nội dung | Kết quả | Ghi chú |
| --- | --- | --- | --- |
| 1–2 | Root + Tổ chức + GM | ✅ Pass | |
| 3 | Chi nhánh HCM, HN | ✅ Pass | |
| 4 | Kho & vị trí | ✅ Pass | |
| 5 | Quỹ tiền | ✅ Pass | |
| 6 | Users (bước 13–16) | ⚠️ Pass có issue | BUG-001 |
| 7 | Nhóm hàng hoá (17–20) | ⚠️ Pass có issue | UX-001–003 |
| 8 | Hàng hoá (21–30) | ⚠️ Pass có issue | BUG-004–007, UX-004–007 |
| 9 | Nhà cung cấp (31) | ⚠️ Pass có issue | UX-011–012 |
| 10 | Khách hàng (32–34) | ❌ Fail | BUG-002, BUG-003 — chưa tạo được KH |

**Kết luận setup:** Dữ liệu master phần lớn đã tạo được; **khách hàng chưa hoàn thành** do BUG-002/003. Các journey TC-03+ cần KH có thể bị block cho đến khi fix.

---

## Sign-off

| Người test | Ngày | Kết quả |
| --- | --- | --- |
| LocTran | 2026-06-26 | Setup xong với 7 bug + 12 UX ghi nhận |
