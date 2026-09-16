---
feature: 2026091602-pos-catalog-product-images
environments: [local-pos]
viewports: [desktop]
---

# Verification — POS hiển thị ảnh hàng hoá

Chạy trên `erp_dev` (API `DB_NAME=erp_dev`, MinIO local `:9000`, backoffice `:3000` phục vụ
`MEDIA_PUBLIC_BASE_URL=http://localhost:3000/erp-media-public/...`, POS `:3001`), tổ chức
**My Company** (`f1000000-0000-4000-8000-000000000001`), tài khoản `admin@erp.local`, chi nhánh
**Hồ Chí Minh** (`c3bf1922-3a2e-42d9-b00d-a7129efe592c`). Fixture của media-storage:
`AAA-MEDIA-A` (mẫu mã, có ảnh), `AAA-MEDIA-B` (hàng lẻ, 1 ảnh), `AAA-MEDIA-C` (không ảnh);
tìm `AIDLC` trên lưới ra đúng ba card, tên card là tên hàng ("AIDLC media A (có màu/size)"…),
không phải mã.

Phiên `local-pos` phải được chụp bằng `capture-pos-session.py` (cùng thư mục) — recipe `form`
của runner không điền được form 3 ô của POS, và `LOCAL_POS_*` trong `.ai/credentials.env` trỏ
org/chi nhánh không còn tồn tại (A-12); script dùng `LOCAL_BACKOFFICE_*`. Trước mỗi lần chạy:

```bash
python3 .ai/features/2026091301-media-storage/verify-fixtures.py --reset      # fixture A/B/C
~/.venvs/aidlc-verify/bin/python .ai/features/2026091602-pos-catalog-product-images/capture-pos-session.py
aidlc-verify .ai/features/2026091602-pos-catalog-product-images --write
aidlc-evidence .ai/features/2026091602-pos-catalog-product-images
```

Ô tìm của lưới là `input[placeholder="(Shift + F3) Tìm kiếm"]`, nhưng `fill` của runner cắt
selector ở dấu `=` đầu tiên nên selector không được chứa `=`; dùng
`div:has(> :text("TƯ VẤN BÁN HÀNG")) input` (khớp đúng ô đó, kiểm 2026-09-16). `count` không
bị giới hạn này (regex neo `= <số>$`).

Ba mã `AAA-MEDIA-*` xếp đầu bảng nên trang 1 **chưa lọc** cũng đã có A/B/C giữa 17 card khác;
`wait` một ảnh vì thế thoả ngay trước khi bộ lọc (debounce 150 ms) kịp chạy. Mọi bước chờ thêm
`[role="list"] > [role="listitem"]:nth-child(3):last-child` — chỉ khớp khi lưới còn đúng 3 card.
Badge giá là `span.rounded-full` bên trong một `span.absolute`; `span:has-text` khớp cả hai nên
đếm theo `span.rounded-full`.

Runner chỉ có `click/fill/wait/scroll`, không có phím Esc — S5 đóng dialog ảnh bằng nút X
(`DialogPrimitive.Close`, chữ ẩn "Đóng") của đúng dialog đang chứa ảnh lớn; Esc đã được kiểm
bằng Playwright ở T-01-02 (cùng `onClose`).

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Tìm `AIDLC`: 3 card, A và B là ảnh từ bucket công khai, C là túi xám (không có `<img>`) | `/pos/` | `fill div:has(> :text("TƯ VẤN BÁN HÀNG")) input = AIDLC; wait [role="list"] > [role="listitem"]:nth-child(3):last-child; wait [role="listitem"] img[src*="/erp-media-public/"]` | AC-01, AC-02 | count [role="listitem"] = 3;count [role="listitem"] img[src*="/erp-media-public/"] = 2;count [role="listitem"]:has-text("AIDLC media C") img = 0;text=AIDLC media C (không ảnh) |
| S2 | Badge giá vẫn nằm trong ô ảnh của card có ảnh (200.000 của A, 90.000 của B) | `/pos/` | `fill div:has(> :text("TƯ VẤN BÁN HÀNG")) input = AIDLC; wait [role="list"] > [role="listitem"]:nth-child(3):last-child; wait [role="listitem"] img[src*="/erp-media-public/"]` | AC-01 | count [role="listitem"]:has(img) span.rounded-full:has-text("200.000") = 1;count [role="listitem"]:has(img) span.rounded-full:has-text("90.000") = 1;count [role="listitem"]:has-text("AIDLC media C") span.rounded-full:has-text("15.000") = 1 |
| S3 | Bấm card A → header dialog chọn biến thể có thumbnail ảnh và nút "Xem" | `/pos/` | `fill div:has(> :text("TƯ VẤN BÁN HÀNG")) input = AIDLC; wait [role="list"] > [role="listitem"]:nth-child(3):last-child; wait [role="listitem"] img[src*="/erp-media-public/"]; click [role="listitem"]:has-text("AIDLC media A") button; wait [role="dialog"] img[src*="/erp-media-public/"]` | AC-04 | count [role="dialog"] = 1;count [role="dialog"] button[aria-label^="Xem ảnh"] = 1;count [role="dialog"] img[src*="/erp-media-public/"] = 1;text=Xem;text=Mã SKU |
| S4 | Bấm "Xem" → dialog thứ hai hiện ảnh lớn với tên hàng, dialog chọn biến thể vẫn ở dưới | `/pos/` | `fill div:has(> :text("TƯ VẤN BÁN HÀNG")) input = AIDLC; wait [role="list"] > [role="listitem"]:nth-child(3):last-child; wait [role="listitem"] img[src*="/erp-media-public/"]; click [role="listitem"]:has-text("AIDLC media A") button; wait [role="dialog"] button[aria-label^="Xem ảnh"]; click [role="dialog"] button[aria-label^="Xem ảnh"]; wait [role="dialog"] img.object-contain` | AC-05 | count [role="dialog"] = 2;count [role="dialog"] img.object-contain = 1;text=Mã SKU |
| S5 | Đóng dialog ảnh bằng nút X → chỉ còn dialog chọn biến thể, bảng biến thể còn nguyên | `/pos/` | `fill div:has(> :text("TƯ VẤN BÁN HÀNG")) input = AIDLC; wait [role="list"] > [role="listitem"]:nth-child(3):last-child; wait [role="listitem"] img[src*="/erp-media-public/"]; click [role="listitem"]:has-text("AIDLC media A") button; wait [role="dialog"] button[aria-label^="Xem ảnh"]; click [role="dialog"] button[aria-label^="Xem ảnh"]; wait [role="dialog"] img.object-contain; click [role="dialog"]:has(img.object-contain) button:has-text("Đóng")` | AC-05 | count [role="dialog"] = 1;count [role="dialog"] img.object-contain = 0;count [role="dialog"] button[aria-label^="Xem ảnh"] = 1;text=Mã SKU;text=AAAMED-40-Trắng |
| S6 | Bấm card C → header là túi xám + "Xem", không có nút xem ảnh | `/pos/` | `fill div:has(> :text("TƯ VẤN BÁN HÀNG")) input = AIDLC; wait [role="list"] > [role="listitem"]:nth-child(3):last-child; wait [role="listitem"] img[src*="/erp-media-public/"]; click [role="listitem"]:has-text("AIDLC media C") button; wait [role="dialog"] >> text=Mã SKU` | AC-06 | count [role="dialog"] = 1;count [role="dialog"] button[aria-label^="Xem ảnh"] = 0;count [role="dialog"] img = 0;text=Xem;text=AIDLC media C (không ảnh) |

## Not verified here

- **AC-03** (ảnh tải lỗi → placeholder, không toast): DSL của runner không chặn được request.
  Kiểm bằng Playwright 2026-09-16 (T-01-01, `page.route('**/erp-media-public/**', abort)` rồi
  tải lại, tìm `AIDLC`): 3 card, 0 `<img>`, 0 toast lỗi; console chỉ có 2 dòng
  `Failed to load resource: net::ERR_FAILED` của trình duyệt cho request bị chặn, không có log
  từ app. Screenshot `t0101-blocked.png` trong scratchpad của phiên thi công.
- **Esc đóng đúng lớp trên cùng + focus trả về nút "Xem"** (phần của S5 mà runner không bấm
  được — S4/S5 ở trên đã chứng minh mở/đóng bằng nút X): Playwright
  2026-09-16 (T-01-02) — sau Esc `count([role=dialog]) = 1`, checkbox biến thể vẫn checked,
  `document.activeElement.aria-label = "Xem ảnh AIDLC media A (có màu/size)"`.
