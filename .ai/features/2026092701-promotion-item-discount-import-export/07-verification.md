---
feature: promotion-item-discount-import-export
verified: 2026-09-27, 2026-09-28
by: claude (headless Playwright, `verify_grid_ui.py`, `verify_real_save.py`)
---

# Verification — CTKM Giảm giá hàng hóa: Nhập khẩu / Xuất khẩu + Copy xuống

## Môi trường

- Chrome extension không kết nối được, nên kiểm tra giao diện bằng **Playwright headless** (`~/.venvs/aidlc-verify`), theo lựa chọn của Akenzy.
- `:4000` trên máy này là API của **erp2** (PID có cwd `…/erp2/apps/api`), nên dựng một API erp3 tạm:
  `PORT=4199 DB_NAME=erp_dev_3008 KAFKA_CONSUMER_GROUP_PREFIX=openapi-tmp-erp3 OUTBOX_RELAY_DISABLED=1 NOTIFICATION_*_DISABLED=1 node dist/main`
  (Akenzy cho phép build + chạy). Consumer group riêng, `fromBeginning: false`, nên không lấy event của erp2.
- Frontend erp3: `:3005` (API mặc định :4000 — chỉ dùng cho các bước **thuần frontend**: copy xuống, payload lưu) và `:3006` với `VITE_API_BASE_URL=http://localhost:4199` (Xuất/Nhập khẩu).
- Tài khoản `LOCAL_BACKOFFICE_*`, chi nhánh Hồ Chí Minh; hàng `ABA2777-*` có sẵn trong `erp_dev_3008`.
- Chạy lại: `VERIFY_BASE=<url> ~/.venvs/aidlc-verify/bin/python verify_grid_ui.py <copy|save-payload|picker-payload|export|import>`.
- Bước lưu **chặn request** (`route.abort`), nên không có CTKM nào được ghi vào DB dev.

## Kết quả

| AC | Cách chứng minh | Kết quả | Bằng chứng |
| --- | --- | --- | --- |
| AC-01 | UI :3005 — chọn `ABA2777-D-38` bằng ô tra cứu, Lưu, bắt payload `POST /v2/promotions` | ✅ `[('REWARD','ITEM',10)]` | `evidence/AC-01-save-intercepted.png` |
| AC-01 (DB) | UI :3005 → API erp3 :4000 → `erp_dev_3008`: lưu thật, `SELECT` (xem dưới) | ✅ `ITEM ABA2777-D-38 10.00`; mở lại hiện đúng mã, lưu lại (`PUT 200`) vẫn `ITEM` | `evidence/AC-01-saved.png` |
| AC-02 | UI :3006 — picker: chọn trọn `AAA-AIDLC-MULTI` + mẫu mã `ABA2777-D-38`, bắt payload | ✅ `PRODUCT` + `ITEM` | `evidence/AC-02-picker.png` |
| AC-02 (DB) | như trên, lưu thật | ✅ `PRODUCT AAA-AIDLC-MULTI` + `ITEM ABA2777-D-38` | `evidence/AC-02-saved.png` |
| — | Phạm vi *Nhóm hàng hóa* (form mới) vẫn gửi `CATEGORY` | ✅ `['CATEGORY']` | — |
| — (DB) | *Nhóm hàng hóa* lưu thật | ✅ `CATEGORY QUÀ TẶNG` | `evidence/group-saved.png` |
| AC-03, AC-04 | e2e `promotion-item-discount-target-type.e2e-spec.ts` | ✅ 4/4 | — |
| AC-05 | UI :3005 — `30,10,(trống),5` → copy dòng 1 | ✅ `30,30,30,30` | `evidence/AC-05-before.png`, `AC-05-after.png` |
| AC-06 | copy dòng 2 sau khi đổi thành 10 | ✅ `30,10,10,10` | `evidence/AC-06.png` |
| AC-07 | dòng trống cuối không có icon, không nhận giá trị | ✅ | `evidence/AC-05-after.png` |
| AC-08 | *Đồng giá* không có icon; *Số tiền* có; *Nhóm hàng hóa + Số tiền* chép được `50000` | ✅ | `evidence/AC-08-dong-gia.png`, `AC-08-group-amount.png` |
| AC-09 | UI :3006 — lưới `D-39`=30, `D-38`=10 → Xuất khẩu, đọc file | ✅ đúng thứ tự lưới, giá 750.000 → KM 525.000 / 675.000 | `evidence/AC-09-grid.png`, `AC-09-export.xlsx` |
| AC-09..AC-12 | unit `item-discount-workbook.spec.ts`, `export-item-discount-lines.handler.spec.ts` + e2e `promotion-item-discount-export.e2e-spec.ts` | ✅ 7/7 e2e | — |
| AC-11 | UI :3006 — lưới trống → file mẫu `GiamGiaHangHoa.xlsx` chỉ có tiêu đề | ✅ | `evidence/AC-11-template.xlsx` |
| AC-13 | UI :3006 — nút ẩn ở *Nhóm hàng hóa* và *Đồng giá*, hiện ở *Hàng hóa + %* | ✅ | `evidence/AC-09-grid.png` |
| AC-14..AC-20 | unit `import-item-discount-lines.handler.spec.ts` (24) + e2e `promotion-item-discount-import.e2e-spec.ts` (17) | ✅ | — |
| AC-21 | UI :3006 — lưới `D-38`=30, `D-41`=15; nhập file `D-38`=50, `aba2777-d-40 `=10, mã lạ, `D-39`=120 | ✅ `D-38`=50, `D-41`=15, `D-40`=10, dòng trống cuối | `evidence/AC-21-import.xlsx`, `AC-21-grid-after-import.png` |
| AC-22 | dialog liệt kê dòng 4 (không tìm thấy) + dòng 5 (%>100) trước khi áp dụng; không có request lưu nào | ✅ | `evidence/AC-22-dialog.png` |

## Lưu thật + SELECT (2026-09-28, UOW-01 DoD)

- API erp3 `make dev-api` với `DB_NAME=erp_dev_3008` (cwd `erp3/apps/api`), Vite erp3 `:3005`. Chạy: `~/.venvs/aidlc-verify/bin/python verify_real_save.py`.
- Ba CTKM `VERIFY-UOW01 {lookup,picker,group} 093034` (id `ceb496f2…`, `e8ba1d9a…`, `9486cd85…`), sau đó **xóa mềm** qua `DELETE /v2/promotions/:id` (204) để không ảnh hưởng POS; `promotion_lines` vẫn còn để đối chiếu.

```sql
select l.target_type, coalesce(i.code, p.code, c.name) as target, l.discount_value
from promotion_lines l
left join items i on i.id = l.target_id
left join products p on p.id = l.target_id
left join inventory_item_categories c on c.id = l.target_id
where l.program_id = :id and l.role = 'REWARD' order by l.sort_order;
```

| CTKM | Kết quả |
| --- | --- |
| lookup | `ITEM · ABA2777-D-38 · 10.00` (sau lưu lại không sửa: vẫn `ITEM`) |
| picker | `PRODUCT · AAA-AIDLC-MULTI · 5.00`, `ITEM · ABA2777-D-38 · 5.00` |
| group | `CATEGORY · QUÀ TẶNG · 5.00` |

## Hồi quy

- `pnpm --filter @erp/api test -- promotion`: 35 suites, **378/378** (chạy lại 2026-09-28: 378/378).
- `pnpm --filter @erp/api test:e2e -- promotion-item-discount`: 4 suites, **35/35** (gồm suite cũ `promotion-item-discount.e2e-spec.ts`; chạy lại 2026-09-28: 35/35).
- `tsc --noEmit` sạch cho `apps/api` và `apps/backoffice-web`.
- 22 file thay đổi khớp đúng hợp các `touches:` — không file nào ngoài phạm vi.

## Phát hiện ngoài phạm vi (không sửa)

- **Đổi "Giảm giá theo" không xóa lưới.** Chọn hàng ở *Hàng hóa* rồi chuyển sang *Nhóm hàng hóa* thì các dòng cũ vẫn còn và được lưu thành `CATEGORY` với id hàng hóa/mẫu mã (thấy trong `picker-payload` trước khi tách form). Có từ trước feature này — radio phạm vi nằm ở `GoodsDiscountPromotionSection.tsx`, không thuộc `touches:` nào.
