---
feature: promotion-item-discount-columns-sheets
verified: 2026-09-28
by: claude (headless Playwright, `verify_ui.py`)
---

# Verification — CTKM Giảm giá hàng hóa: cột ĐVT/Giá bán/Giá KM, Đồng giá, file Excel 3 sheet

## Môi trường

- Kiểm tra giao diện bằng **Playwright headless** (`~/.venvs/aidlc-verify`), giống feature `2026092701`. Bộ chạy `verify.py` không dùng được ở đây: nó không upload file, không mở picker, không đọc file tải về.
- API của **checkout erp2 này**: `PORT=4199 DB_NAME=erp_dev_3008 KAFKA_CONSUMER_GROUP_PREFIX=verify-erp2 OUTBOX_RELAY_DISABLED=1 node dist/main` (build 19:10, sau thay đổi API cuối cùng). `migration:show` trên `erp_dev_3008`: 208 đã chạy, 0 đang chờ.
- Backoffice erp2: `VITE_API_BASE_URL=http://localhost:4199 vite --port 3010` (env `local-backoffice-erp2`). Không dùng `:3000`/`:4000`.
- Tài khoản `LOCAL_BACKOFFICE_*`, chi nhánh *Main Branch*. Tổ chức này **không** có `ABA2777-*` nên dùng hàng của chính nó: `GELLI-39-DEN`, `GELLI-40-DEN`, `GELLI-43-DEN`, `GELLI-40-NAU` (đôi, 590.000), mẫu mã *Giày Gelli* (6 hàng hóa, không có mã/giá).
- File nhập: `node make_import_files.js` (dựng bằng `exceljs` của `apps/api`). Chạy lại: `~/.venvs/aidlc-verify/bin/python verify_ui.py <grid|picker|reopen|excel>`.
- Viewport desktop 1440×900.

## Kết quả

| AC | Bước | Kết quả | Bằng chứng |
| --- | --- | --- | --- |
| AC-01 | unit `promotion-target.spec.ts` (vitest) | ✅ 8/8 | — |
| AC-02 | picker: chọn lẻ `GELLI-40-NAU`. Dialog hiện `variantLabel` = `40 · Nâu` → code cũ sẽ ra `Giày Gelli (40 · Nâu) (40 · Nâu)` | ✅ lưới hiện đúng `Giày Gelli (40 · Nâu)` (tên lưu trong DB, không ghép thêm) | `evidence/AC-02-picker-variant-row.png`, `AC-02-AC-06-AC-07-picker.png` |
| AC-03 | *Hàng hóa* + *%*: thứ tự cột | ✅ `Mã hàng, Tên hàng hóa, ĐVT, Giá bán, % giảm giá, Giá khuyến mại` | `evidence/AC-04-percent-30.png` |
| AC-04 | `GELLI-39-DEN` 30% → 10% | ✅ ĐVT `đôi`, Giá bán 590.000, Giá KM 413.000 → 531.000 (không lưu) | `evidence/AC-04-percent-30.png` |
| AC-05 | *Số tiền* 800.000 | ✅ Giá KM `0` | `evidence/AC-05-amount-over-price.png` |
| AC-06 | ô tra cứu / picker / nhập khẩu / mở lại | ✅ cả bốn nguồn đều có `đôi` + 590.000. Mở lại: lưu thật (201), mở `/edit`, Giá KM 531.000; sau đó `DELETE /v2/promotions/:id` → 204 | `evidence/AC-04-percent-30.png`, `AC-02-AC-06-AC-07-picker.png`, `AC-06-grid-after-import.png`, `AC-06-reopened.png` |
| AC-07 | picker chọn trọn *Giày Gelli* (`PRODUCT`) | ✅ ĐVT / Giá bán / Giá KM trống | `evidence/AC-02-AC-06-AC-07-picker.png` |
| AC-08 | *Nhóm hàng hóa* (Đồng giá, rồi %) | ✅ không có ĐVT / Giá bán / Giá KM | `evidence/AC-08-AC-09-nhom-dong-gia.png`, `AC-08-nhom-percent.png` |
| AC-09 | *Đồng giá* ở cả hai phạm vi | ✅ không có cột `% giảm giá`, không có copy xuống | `evidence/AC-09-AC-10-dong-gia.png`, `AC-08-AC-09-nhom-dong-gia.png` |
| AC-10 | Đồng giá 50.000 → 60.000 | ✅ Giá KM theo ô Đồng giá | `evidence/AC-09-AC-10-dong-gia.png` |
| AC-11 | nút Nhập/Xuất | ✅ hiện ở *Hàng hóa + Đồng giá*, ẩn ở *Nhóm + Đồng giá* | `evidence/AC-11-dong-gia-buttons.png` |
| AC-12..AC-15, AC-17..AC-19 | unit (78/78) + e2e `promotion-item-discount-export/import` (46/46, T-02-03) | ✅ | — |
| AC-13 (UI) | *Đồng giá* → Xuất khẩu | ✅ mã ở sheet `Đồng giá`, hai sheet kia chỉ tiêu đề | `evidence/AC-13-export-dong-gia.xlsx` |
| AC-14 | dialog → **Tải file mẫu** | ✅ 3 sheet đúng thứ tự, chỉ tiêu đề, không có ĐVT/Giá bán/Giá KM | `evidence/AC-14-dialog-template-link.png`, `AC-14-template.xlsx` |
| AC-16 | *Đồng giá*, lưới có `GELLI-39-DEN`; file: sheet `Đồng giá` = `39-DEN`, `40-DEN`, `KHONG-CO-MA` (+ sheet `%` có `43-DEN`=99 để chứng minh không bị đọc) | ✅ lỗi đúng dòng 4; câu "mã đã có được giữ nguyên"; áp dụng → `39-DEN` giữ, `40-DEN` thêm có `đôi`/590.000/Giá KM 50.000, không có `43-DEN` | `evidence/AC-16-dialog.png`, `AC-16-grid-after-import.png` |
| AC-06 (nhập %) | file sheet `%`: `GELLI-43-DEN`=20 | ✅ dòng mới `đôi` / 590.000 / 20 / 472.000; câu "mã đã có thì cập nhật giá trị" | `evidence/AC-06-grid-after-import.png` |

## Not verified here

- Lưới *Tặng hàng hóa* (vế thứ hai của AC-02): ô mã của lưới đó không có nút mở picker ở dòng trống, nên script không mở được. Tên ở mọi lưới lấy từ cùng hàm `toPromotionTargets`, đã có spec AC-01 và đã kiểm trên lưới *Giảm giá hàng hóa* ở trên.

## Dữ liệu ghi vào DB dev

- Một CTKM `VERIFY 2026092801 reopen` (id `c2c29d5b…`) được lưu rồi **xóa mềm** (204) ngay trong bước `reopen`. Không có ghi nào khác: nhập/xuất khẩu không ghi DB.
