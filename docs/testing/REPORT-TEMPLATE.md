# Báo cáo test — [TC-XX tên journey]

> **Quy trình file**
>
> | Giai đoạn | File |
> | --- | --- |
> | Đang test | `output.md` — ghi chú nhanh, chưa cần format đầy đủ |
> | Đã xong journey | Đổi tên → `report-TC-XX.md` (vd. `report-TC-00.md`) |
> | Mẫu | File này (`REPORT-TEMPLATE.md`) |
>
> **Cấu trúc:** Bảng tóm tắt (phẳng) + chi tiết **nhóm theo màn hình**.

---

## Thông tin phiên test

| Mục | Giá trị |
| --- | --- |
| **Test case** | TC-XX — [Tên journey] |
| **Người test** | LocTran |
| **Ngày test** | YYYY-MM-DD |
| **Ứng dụng** | Backoffice / POS / API |
| **Môi trường** | `:3000` / `:3001` / `:4000` |
| **Tài khoản** | Inventory Admin (`inventory.admin@erp.local`) |
| **Chi nhánh** | [vd. Chi nhánh HCM] |

**Trạng thái phiên:** 🟡 Đang test · 🟢 Hoàn thành · 🔴 Blocked

---

## 1. Tóm tắt

### Thống kê

| | 🔴 Critical | 🟠 Major | 🟡 Minor | 💡 UX |
| --- | ---: | ---: | ---: | ---: |
| **Bug** | 0 | 0 | 0 | — |
| **UX** | — | — | — | 0 |

### Danh sách issue

| ID | Loại | Mức độ | Màn hình | TC ref | Tiêu đề | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | Bug | 🟠 Major | Backoffice › … | TC-XX-YYY | [Tiêu đề] | 🆕 Mới |

**Trạng thái:** 🆕 Mới · 👀 Đang xử lý · ✅ Đã fix · 🔄 Retest · ❌ Won't fix

---

## 2. Chi tiết theo màn hình

> Mỗi màn hình: **Bug trước, UX sau**. Xem quy tắc KQHT/KQMM bên dưới.

### 📍 Backoffice › [Menu] › [Trang]

**TC liên quan:** TC-XX-YYY  
**Route:** `/admin/...`

#### BUG-xxx — [Tiêu đề]

| | |
| --- | --- |
| Mức độ | 🔴 / 🟠 / 🟡 |
| Trạng thái | 🆕 Mới |

| KQHT | KQMM |
| --- | --- |
| [Hệ thống đang làm gì] | [Hệ thống phải làm gì] |

**Tái hiện** *(nếu không hiển nhiên từ KQHT/KQMM):*

1. …
2. …

**Kỹ thuật** *(tuỳ chọn):* `QueryFailedError…`, `[POST /api/...]`

**Ảnh:** `![BUG-xxx](screenshots/TC-XX/BUG-xxx.png)`

---

#### UX-xxx — [Tiêu đề]

| | |
| --- | --- |
| Loại | 🟠 Cần sửa / 🟡 Nhỏ / 💡 Gợi ý |
| Thành phần | Nút / Form / Dropdown |

**Hành vi sai** *(chỉ khi UX có KQHT/KQMM — vd. nút có nhưng không đúng):*

| KQHT | KQMM |
| --- | --- |
| … | … |

**Hiện tại / Đề xuất** *(layout, default, copy — không cần KQHT):*

- **Hiện tại:** …
- **Đề xuất:** …

---

## 3. Kết quả chạy test case

| TC ref | Kết quả | Ghi chú |
| --- | --- | --- |
| TC-XX-001 | ✅ Pass / ❌ Fail / ⚠️ Pass có issue / ⏸ Blocked | [BUG-001] |

> **TC-00:** dùng cột **Bước** (1–34) thay TC ref — xem `report-TC-00.md`.

---

## Quy tắc KQHT / KQMM

| Loại | Có cần bảng KQHT \| KQMM? | Ghi chú |
| --- | --- | --- |
| **Bug chức năng** | **Bắt buộc** | Dev cần biết chính xác gap |
| **UX — hành vi sai** (nút có nhưng sai, checkbox lệch state) | **Bắt buộc** | Coi như bug UX |
| **UX — gợi ý** (layout, default value, thiếu nút, copy) | **Không** | Dùng **Hiện tại / Đề xuất** — ngắn hơn, đủ cho dev |
| **Lỗi API / DB** | KQHT = error message; KQMM = thành công | Kèm stack hoặc endpoint |

**Vì sao không dùng KQHT/KQMM cho mọi UX?** Ghi *"Layout ngang, vừa 1 màn"* làm KQMM sẽ dài và trùng với Đề xuất. Chỉ dùng bảng 2 cột khi có **hành vi thực tế vs mong đợi** cần đối chiếu rõ.

---

## Checklist trước khi đổi tên `report-TC-XX.md`

- [ ] Bảng tóm tắt đủ issue; ID không trùng
- [ ] Mọi **Bug** có KQHT \| KQMM
- [ ] UX hành vi sai có KQHT \| KQMM; UX gợi ý có Hiện tại / Đề xuất
- [ ] Bảng kết quả chạy TC đã cập nhật
- [ ] Screenshot trong `docs/testing/screenshots/TC-XX/`
