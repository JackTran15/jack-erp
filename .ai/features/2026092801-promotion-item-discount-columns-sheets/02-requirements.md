---
feature: promotion-item-discount-columns-sheets
stories: 4
acceptance_criteria: 19
---

# Requirements — CTKM Giảm giá hàng hóa: cột ĐVT/Giá bán/Giá KM, Đồng giá, file Excel 3 sheet

Fixture: `apps/api/test/e2e/setup/promotion-seed.ts` (`SKU-685` = 685.000,
`SKU-100` = 100.000, `SKU-200` = 200.000, `SKU-300` = 300.000).
**[UI]** = chứng minh bằng ảnh chụp trình duyệt.
Tên sheet: `S%` = `Giảm giá theo %`, `S$` = `Giảm giá theo số tiền`, `SĐG` = `Đồng giá` (A-06).

---

## US-01 — Tên hàng không có hậu tố biến thể

- **AC-01** — *Given* picker trả một mẫu mã lẻ có `name = "Giày nam ABA2799-D-38"`, `variantLabel = "38 · D"`, *When* `toPromotionTargets`, *Then* `draft.name = "Giày nam ABA2799-D-38"` (spec `promotion-target.spec.ts`).
- **AC-02** — *Given* lưới *Giảm giá hàng hóa* và một lưới CTKM khác (vd *Tặng hàng*), *When* chọn mẫu mã có biến thể qua picker, *Then* cột *Tên hàng hóa* không có `(… · …)` **[UI]**.

## US-02 — Cột ĐVT / Giá bán / Giá khuyến mại trên lưới

- **AC-03** — *Given* phạm vi *Hàng hóa*, *Then* lưới có các cột theo thứ tự `Mã hàng | Tên hàng hóa | ĐVT | Giá bán | <cột giá trị> | Giá khuyến mại` (+ copy xuống, xoá) **[UI]**.
- **AC-04** — *Given* *%*, `SKU-685` chọn bằng ô tra cứu, giá trị 30, *Then* ĐVT là đơn vị của item, Giá bán `685.000`, Giá khuyến mại `479.500`. Đổi giá trị thành 10 thì Giá KM thành `616.500` ngay, không cần lưu **[UI]**.
- **AC-05** — *Given* *Số tiền*, `SKU-100` giảm 150.000, *Then* Giá khuyến mại `0` **[UI]**.
- **AC-06** — *Given* dòng được thêm bằng **picker** (mẫu mã lẻ), bằng **nhập khẩu**, hoặc **mở lại** CTKM đã lưu, *Then* ĐVT và Giá bán đều có giá trị như dòng chọn bằng ô tra cứu **[UI]**.
- **AC-07** — *Given* dòng mẫu mã chọn trọn (`PRODUCT`), *Then* ĐVT và Giá bán trống; ở *%*/*Số tiền* Giá KM trống (A-04) **[UI]**.
- **AC-08** — *Given* phạm vi *Nhóm hàng hóa*, *Then* không có cột ĐVT / Giá bán / Giá KM **[UI]**.

## US-03 — Đồng giá

- **AC-09** — *Given* phương thức *Đồng giá* (cả hai phạm vi), *Then* không có cột `% giảm giá` và không có cột copy xuống **[UI]**.
- **AC-10** — *Given* *Đồng giá* 50.000, phạm vi *Hàng hóa*, *Then* cột Giá khuyến mại của mọi dòng đã chọn hàng là `50.000`; đổi ô Đồng giá thì cột đổi theo (A-11) **[UI]**.
- **AC-11** — *Given* *Đồng giá* + phạm vi *Hàng hóa*, *Then* hai nút **Nhập khẩu / Xuất khẩu** hiển thị. *Given* phạm vi *Nhóm hàng hóa*, *Then* vẫn ẩn **[UI]**.

## US-04 — File Excel 3 sheet + file mẫu

- **AC-12** — *Given* *%* với `SKU-685`=30, `SKU-100`=10, *When* xuất khẩu, *Then* file có đúng 3 sheet theo thứ tự `S%`, `S$`, `SĐG`. `S%` có tiêu đề `Mã SKU* | Tên hàng hóa | % giảm giá` và 2 dòng theo thứ tự lưới. `S$` tiêu đề `Mã SKU* | Tên hàng hóa | Số tiền giảm`, `SĐG` tiêu đề `Mã SKU* | Tên hàng hóa`; hai sheet này không có dòng dữ liệu. Không sheet nào có cột ĐVT / Giá bán / Giá khuyến mại.
- **AC-13** — *Given* *Đồng giá* với `SKU-685`, `SKU-200`, *When* xuất khẩu (`method=FIXED_PRICE`), *Then* dữ liệu nằm ở `SĐG` (mã + tên), `S%` và `S$` chỉ có tiêu đề.
- **AC-14** — *Given* request xuất khẩu với `lines: []`, *Then* file mẫu có 3 sheet, mỗi sheet chỉ có hàng tiêu đề. *And* dialog Nhập khẩu có link **Tải file mẫu** tải đúng file này **[UI]**.
- **AC-15** — *Given* một file 3 sheet có `S%`: `SKU-685`=30 và `S$`: `SKU-200`=20000, *When* nhập với `method=AMOUNT`, *Then* chỉ trả `SKU-200` (value 20000), không đọc `S%`. *When* nhập với `method=PERCENT`, *Then* chỉ trả `SKU-685`.
- **AC-16** — *Given* `method=FIXED_PRICE` và `SĐG` có `SKU-685`, `SKU-200`, một dòng mã trống, một mã không tồn tại, và `SKU-685` lặp lại, *Then* dòng mã trống bị bỏ qua, mã không tồn tại lỗi *"Không tìm thấy hàng hóa có mã …"*, hai dòng `SKU-685` lỗi trùng mã, `SKU-200` hợp lệ không có `value` (A-09). *And* trên giao diện, áp dụng chỉ thêm dòng mới, dòng đã có không đổi **[UI]**.
- **AC-17** — *Given* file nhiều sheet không có sheet của phương thức đang chọn, *Then* 400 *"File không có sheet '{tên}'"* (A-08).
- **AC-18** — **Tương thích**: *Given* file một sheet theo mẫu cũ (`Sheet1`, 6 cột, có `% giảm giá`), *When* nhập với `PERCENT`, *Then* kết quả như trước (AC-14 cũ). *When* nhập với `FIXED_PRICE`, *Then* đọc mã, bỏ qua cột giá trị (A-10). *When* nhập với `AMOUNT`, *Then* vẫn 400 cột không khớp phương thức (AC-16 cũ).
- **AC-19** — **Round-trip** cho cả 3 phương thức: *Given* file xuất ở AC-12 / AC-13, *When* nhập lại với cùng phương thức, *Then* đúng tập `targetId` (và `value` với *%* / *Số tiền*), 0 lỗi. *And* dòng `ITEM` trong kết quả nhập có `unit` và `sellingPrice` (A-14).
