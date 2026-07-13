# Item Category Import Field Mapping

**Phạm vi:** `apps/api/src/modules/inventory/csv` (category-import/export)
**Cập nhật:** 2026-07-11

## Mục tiêu hiện tại

- Dùng template tĩnh `DanhMucNhomHangHoa.xls` làm tệp mẫu tải về.
- Layout: dòng 1–4 trống, dòng 5 tiêu đề `DANH MỤC NHÓM HÀNG HÓA` (merge A–C), **dòng 6 = key EN (ẩn)**, dòng 7 = nhãn tiếng Việt, dữ liệu từ dòng 8. Dòng key được dò động theo `ItemCategoryCode`, dữ liệu bắt đầu 2 dòng bên dưới.
- Export sinh `.xlsx` cùng layout để re-import được: **cột D (Thuế suất) ẩn mặc định**, note ở ô A2 hướng dẫn Unhide C→E cho cửa hàng theo dõi Thuế GTGT; sort theo mã nhóm.
- Hỗ trợ import `.xlsx`, `.xls`, `.csv` (delimiter `;` hoặc `,`, quote-aware, UTF-8 BOM).

## Trạng thái triển khai

### Đã triển khai

- Validate/import theo job (`inventory_import_jobs`, `type=CATEGORIES`), duplicateMode `UPDATE`/`SKIP` dedupe theo **mã nhóm**.
- Cây nhóm cha/con: cột `ParentName` chứa **mã nhóm cha**, resolve trong file trước rồi tới DB (commit 2-pass nên nhóm cha nằm sau nhóm con trong file vẫn được); mã cha không tồn tại (vd `KCT` trong file KiotViet) → **warning, đặt nhóm gốc**, row vẫn hợp lệ; chống vòng lặp cây khi liên kết.
- Tên nhóm unique theo org: tên đã thuộc nhóm khác = lỗi dòng; tên trùng nhóm chưa có mã → adopt nhóm đó và gán mã (nhất quán `resolveOrCreateCategoryByCode` của items import).
- Export lỗi dạng `.xlsx` có cột `Tình trạng`.
- Danh sách nhóm hàng (cây + v2 search) đổi default sort `name ASC` → **`code ASC`**.

### Còn lại (ngoài MVP)

- `TaxRate`: cần thêm field thuế trên `ItemCategoryEntity` trước khi map (đồng bộ với `TaxRate` của hàng hóa — DEFER P4).

## Mapping 4 fields

**Chú thích:** `MAP` = đã map; `DEFER` = giữ trong `rawData`, không chặn import, export để trống.

| # | Excel Key | Nhãn | Trạng thái | Đích hiện tại / Ghi chú |
| --- | --- | --- | --- | --- |
| 1 | `ItemCategoryCode` | Mã nhóm hàng hóa (*) | MAP | `inventory_item_categories.code` (bắt buộc; key dedupe UPDATE/SKIP; >50 ký tự = lỗi) |
| 2 | `ItemCategoryName` | Tên nhóm hàng hóa (*) | MAP | `inventory_item_categories.name` (bắt buộc; unique theo org) |
| 3 | `ParentName` | Thuộc nhóm hàng hóa | MAP | mã nhóm cha → `parentGroupId` (miss → warning + nhóm gốc; export ghi mã cha, nhóm gốc để trống) |
| 4 | `TaxRate` | Thuế suất | DEFER | chưa có field thuế trên entity — cột D ẩn mặc định, note A2 hướng dẫn Unhide |

## Ghi chú runtime

- Cột `Tình trạng` là cột hệ thống khi review/export lỗi, không thuộc 4 cột gốc.
- File mẫu KiotViet ghi `KCT` ở cột nhóm cha cho nhóm gốc — hệ thống coi đây là mã không tồn tại (warning + nhóm gốc), export của ta để trống thay vì ghi `KCT`.
