# Báo cáo test — 02 Nhập hàng vào kho

---

## Thông tin phiên test

| Mục | Giá trị |
| --- | --- |
| **Test case** | TC-02 — Nhập hàng vào kho |
| **Người test** | LocTran |
| **Ngày test** | 2026-06-26 |
| **Ứng dụng** | Backoffice |
| **Môi trường** | `http://localhost:3000` / API `:4000` |
| **Tài khoản** | Quản lý chi nhánh (`mgr-hcm@test.com`) |

**Trạng thái phiên:** 🟢 Hoàn thành *(TC-02-EF-003 chưa test — API-level, không block)*

---

## 1. Tóm tắt

### Thống kê

| | 🔴 Critical | 🟠 Major | 🟡 Minor | 💡 UX |
| --- | ---: | ---: | ---: | ---: |
| **Bug** | 0 | 0 | 0 | — |
| **UX** | — | 0 | 1 | 0 |

### Danh sách issue

| ID | Loại | Mức độ | Màn hình | TC ref | Tiêu đề | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| UX-001 | UX | 🟡 Nhỏ | Kho hàng › Nhập kho | TC-02-EF-002 | Error message kỹ thuật, chưa human-friendly | 🆕 Mới |

---

## 2. Chi tiết theo màn hình

### 📍 Backoffice › Kho hàng › Nhập kho

**TC liên quan:** TC-02-EF-002  
**Route:** `/admin/goods-receipts/new`

#### UX-001 — Error message số lượng không thân thiện

| KQHT | KQMM |
| --- | --- |
| `lines.0.quantity must not be less than 0.001` | `Số lượng phải lớn hơn 0` |

**Gợi ý:** Frontend nên map lỗi validation từ backend ra tiếng Việt thân thiện trước khi hiển thị cho người dùng.

---

## 3. Kết quả chạy TC-02

| TC | Tên | Kết quả | Ghi chú |
| --- | --- | --- | --- |
| TC-02-001 | Nhập kho cơ bản → kiểm tra tồn kho tăng | ✅ Pass | Phiếu auto-POST, mã tự sinh `NK000001` |
| TC-02-002 | Nhập kho nhiều mặt hàng, nhiều vị trí | ✅ Pass | |
| TC-02-003 | Nhập kho với nhà cung cấp | ✅ Pass | |
| TC-02-004 | ~~Hủy phiếu DRAFT~~ | 🚫 N/A | Không có DRAFT — phiếu auto-POST ngay khi tạo |
| TC-02-005 | Không thể sửa phiếu sau khi POSTED | ✅ Pass (UI) | Tất cả field disabled; API PATCH chưa test |
| TC-02-006 | Nhập kho dùng kho mặc định (isDefaultReceiving) | ✅ Pass | Vị trí tự gợi ý A-01 từ lịch sử nhập trước |
| TC-02-EF-001 | Tạo phiếu không có dòng hàng | ✅ Pass | Message: `Cần ít nhất 1 dòng hàng hợp lệ.` |
| TC-02-EF-002 | Số lượng = 0 | ✅ Pass | Message kỹ thuật → UX-001 |
| TC-02-EF-003 | Sửa phiếu đã POST qua API PATCH trực tiếp | ⬜ Chưa test | |

---

## Sign-off

| Người test | Ngày | Kết quả |
| --- | --- | --- |
| LocTran | 2026-06-26 | ✅ 7/8 pass (1 N/A, 1 chưa test) — 1 UX issue nhỏ |
