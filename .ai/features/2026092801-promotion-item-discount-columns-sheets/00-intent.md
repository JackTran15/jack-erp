---
feature: promotion-item-discount-columns-sheets
slug: 2026092801-promotion-item-discount-columns-sheets
owner: Akenzy
created: 2026-09-28
status: draft
---

# Intent — CTKM Giảm giá hàng hóa: cột ĐVT/Giá bán/Giá KM, Đồng giá, file Excel 3 sheet

## Problem

Yêu cầu gốc (mục 9 danh sách phản hồi, "#7 cũ", kèm 4 ảnh: màn hình hiện tại,
hai file đã xuất, và màn MISA eShop):

> *Cột Tên hàng hoá: xoá (Size - Color). Giảm giá theo Hàng hoá: thêm cột ĐVT,
> Giá bán, Giá khuyến mãi. Đồng giá: xoá cột % giảm giá; thiếu Import/Export.
> Import: thiếu file mẫu; xoá cột ĐVT, Giá bán, Giá khuyến mãi. Export: xoá cột
> ĐVT, Giá bán, Giá khuyến mãi. Tham khảo MISA: một file chung, 3 sheet; chọn
> phương thức nào thì nhập/xuất theo sheet tương ứng.*

Feature trước (`2026092701-promotion-item-discount-import-export`) đã làm
Nhập/Xuất khẩu cho *%* và *Số tiền*. Yêu cầu này đảo lại ba quyết định của nó:

| Quyết định cũ | Nay |
| --- | --- |
| A-02: ẩn Nhập/Xuất khi *Đồng giá* | Có Nhập/Xuất cho *Đồng giá* |
| A-03: lưới không có cột ĐVT/Giá bán/Giá KM, chỉ file có | Lưới có ba cột này, **file thì bỏ** |
| A-10: một sheet, 6 cột | Một file **3 sheet** (%, Số tiền, Đồng giá), mỗi sheet chỉ `Mã SKU*`, `Tên hàng hóa` và cột giá trị (Đồng giá không có cột giá trị) |

Ngoài ra:
- Dòng chọn qua picker có tên dạng `Giày nam ABA2799-D-38 (38 · D)` vì
  `toPromotionTargets` (`promotion-target.ts:66`) ghép `variantLabel` vào tên.
  Mở lại CTKM thì tên lấy từ DB, không có hậu tố, nên cùng một dòng hiện hai tên
  khác nhau. Bỏ hậu tố ở **mọi lưới CTKM** (A-02 mới).
- Ở *Đồng giá*, lưới vẫn hiện cột `% giảm giá` bị khoá, không dùng được.
- Dialog Nhập khẩu không có đường tải file mẫu. Hiện chỉ có cách xoá hết dòng rồi
  bấm Xuất khẩu, và người dùng không biết cách đó.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Nhân viên tạo CTKM (backoffice) | Tên hàng có hậu tố `(38 · D)` khi chọn qua picker; không thấy ĐVT, giá bán, giá sau KM trên lưới | Tên đúng như danh mục; lưới *Hàng hóa* có ĐVT, Giá bán, Giá khuyến mại tính ngay khi gõ |
| Nhân viên tạo CTKM (backoffice) | *Đồng giá*: cột % bị khoá, không Nhập/Xuất được | *Đồng giá*: không có cột %; Nhập/Xuất danh sách hàng như hai phương thức kia |
| Nhân viên tạo CTKM (backoffice) | Không biết lấy file mẫu ở đâu; file xuất có cột thừa | Dialog Nhập khẩu có **Tải file mẫu**; file 3 sheet như MISA, chỉ có cột cần nhập |

## Success signal

1. Một file mẫu dùng được cho cả 3 phương thức: nhập khẩu đọc đúng sheet của phương thức đang chọn. Kiểm bằng e2e.
2. Xuất rồi nhập lại **không sửa gì** vẫn giữ đúng tập SKU và giá trị (round-trip, AC-20 cũ) cho cả 3 phương thức.
3. File xuất theo mẫu cũ (một sheet, 6 cột) vẫn nhập được.
4. Trên trình duyệt, lưới *Hàng hóa* hiện ĐVT / Giá bán / Giá KM đúng với dữ liệu danh mục, và tên hàng không có hậu tố biến thể ở mọi lưới CTKM.
5. Mọi AC trong `02-requirements.md` đều có test hoặc ảnh chụp chứng minh.

## Out of scope

- Nhập/Xuất khẩu cho phạm vi **Nhóm hàng hóa** (vẫn ẩn, như A-02 cũ).
- Cột ĐVT/Giá bán/Giá KM cho phạm vi **Nhóm hàng hóa** (nhóm không có giá).
- ĐVT/Giá bán cho dòng **mẫu mã chọn trọn** (`PRODUCT`): để trống (A-04).
- Sửa dữ liệu CTKM đã lưu. Không có migration.
- Thêm cột ĐVT/Giá vào các lưới CTKM khác (tặng hàng, theo mức, mua m tặng n).

## Constraints

| Kind | Detail |
| --- | --- |
| Đa tổ chức | Tra mã và đọc ĐVT/giá theo `actor.organizationId`, như hai endpoint hiện có |
| Không lưu gì | Nhập/Xuất khẩu vẫn không ghi DB |
| Tương thích | File 1 sheet đã xuất trước đây vẫn nhập được (A-05) |
| Domain thuần | Không đụng `modules/promotion/domain/**` |
| Ngôn ngữ | Tên sheet, tên cột, thông báo bằng tiếng Việt; enum giữ tiếng Anh |
| Kiểm chứng web | `backoffice-web` có `"test": "echo test"`, nên AC giao diện chứng minh bằng ảnh chụp trình duyệt |

## Existing surface touched

**Tái sử dụng:**
- `GoodsDiscountGrid.tsx` + `LineItemGrid` (`@erp/ui`): thêm cột, không viết lưới mới.
- `promoPrice()` (`promotion-target.ts:131`): đã có quy tắc làm tròn khớp domain cho cả 3 phương thức.
- `item-discount-workbook.ts`, hai handler `export/import-item-discount-lines`, `item-discount-excel.api.ts`, `ItemDiscountImportDialog.tsx`: sửa tại chỗ.
- `GetPromotionHandler` đã trả `unit` / `sellingPrice` cho dòng `ITEM` (`promotion-program.response.dto.ts:43-60`).

**Lối vào:** không thêm route, không thêm endpoint. Link **Tải file mẫu** trong dialog Nhập khẩu gọi endpoint xuất khẩu với `lines: []`.
