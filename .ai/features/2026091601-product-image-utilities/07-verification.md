---
feature: 2026091601-product-image-utilities
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Cập nhật ảnh & Cập nhật ảnh nhanh

Chạy trên `erp_dev` (API `nest start --watch` ở `:4000`, backoffice Vite ở `:3000`), tổ chức
**My Company** (`f1000000-0000-4000-8000-000000000001`), phiên `local-backoffice` đã lưu
(`.ai/.auth/local-backoffice.json`, dựng bằng `.ai/capture-session.py`). Fixture là của
media-storage: mẫu mã **A** `AAA-MEDIA-A` (biến thể `AAAMED-39-Đen`, `AAAMED-40-Đen`,
`AAAMED-40-Trắng`; 2–3 ảnh), hàng lẻ **B** `AAA-MEDIA-B` (1 ảnh), hàng lẻ **C** `AAA-MEDIA-C`
(chưa ảnh). Cả ba **không thuộc nhóm nào**, nên bước nhóm dùng "QUÀ TẶNG" (nhóm gốc, 3 nhóm
đang kinh doanh trực tiếp + 5 trong nhóm con "Phiếu quà tặng" = **8** khi gom nhóm con, A-06).

Số liệu đo 2026-09-16 trên `erp_dev`: 2.448 nhóm đang kinh doanh, 2 có ảnh (A, B), 2.507 kể cả
ngừng kinh doanh (A-13). `PaginationControls` in số theo `vi-VN` ⇒ "2.446".

Runner chỉ có `click/fill/wait/scroll`, không chọn được file: các bước **tải lên** (AC-07/08,
AC-13/14) không nằm ở đây — chúng được chứng minh bằng e2e (`inventory-item-set-images`,
`media-product-images`) và kiểm tay theo done-when của T-01-04 / T-02-03. Các bước ở đây chứng
minh đường đọc, bộ lọc, điều hướng và bố cục.

```bash
~/.venvs/aidlc-verify/bin/python .ai/capture-session.py       # nếu phiên đã hết hạn
aidlc-verify .ai/features/2026091601-product-image-utilities --write
aidlc-evidence .ai/features/2026091601-product-image-utilities
```

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Menu Tiện ích trên lưới hàng hoá có hai mục mới sau hai mục trạng thái | `/admin/inventory-items` | `wait tbody tr; click button:has-text("Tiện ích"); wait [role="menuitem"]:has-text("Cập nhật ảnh nhanh")` | AC-01 | count [role="menuitem"]:has-text("Đang kinh doanh") = 1;count [role="menuitem"]:has-text("Ngừng kinh doanh") = 1;count [role="menuitem"]:has-text("Cập nhật ảnh") = 2;count [role="menuitem"]:has-text("Cập nhật ảnh nhanh") = 1 |
| S2 | Cập nhật ảnh mở với bộ lọc mặc định: 2.446 nhóm chưa có ảnh, 50 dòng, không có A/B, mọi ô Ảnh là placeholder | `/admin/inventory-items/images` | `wait text=Hiển thị 1 - 50 trên 2.446 kết quả` | AC-02 | text=Cập nhật ảnh;text=Hiển thị 1 - 50 trên 2.446 kết quả;count tbody tr = 50;count [aria-label="Chưa có ảnh"] = 50;count img[src*="/erp-media-public/"] = 0;no-text=AAA-MEDIA-A;no-text=AAA-MEDIA-B;count button:has-text("Tải ảnh") = 50 |
| S3 | "Hàng hóa đã cập nhật ảnh" → chỉ A và B, mỗi dòng một thumbnail công khai | `/admin/inventory-items/images` | `wait text=Hiển thị 1 - 50 trên 2.446 kết quả; click [aria-label="Tìm kiếm theo"]; click [role="option"]:has-text("Hàng hóa đã cập nhật ảnh"); click button:has-text("Lấy dữ liệu"); wait text=Hiển thị 1 - 2 trên 2 kết quả` | AC-03 | text=AAA-MEDIA-A;text=AAA-MEDIA-B;count tbody tr = 2;count img[src*="/erp-media-public/"] = 2;count [aria-label="Chưa có ảnh"] = 0 |
| S4 | "Tất cả" → 2.448 nhóm đang kinh doanh (không phải 2.507) | `/admin/inventory-items/images` | `wait text=Hiển thị 1 - 50 trên 2.446 kết quả; click [aria-label="Tìm kiếm theo"]; click [role="option"]:has-text("Tất cả"); click button:has-text("Lấy dữ liệu"); wait text=Hiển thị 1 - 50 trên 2.448 kết quả` | AC-03 | text=Hiển thị 1 - 50 trên 2.448 kết quả;count tbody tr = 50 |
| S5 | Đổi bộ lọc mà chưa bấm Lấy dữ liệu thì bảng không đổi (A-11) | `/admin/inventory-items/images` | `wait text=Hiển thị 1 - 50 trên 2.446 kết quả; click [aria-label="Tìm kiếm theo"]; click [role="option"]:has-text("Tất cả"); wait [aria-label="Tìm kiếm theo"]:has-text("Tất cả")` | AC-02 | text=Hiển thị 1 - 50 trên 2.446 kết quả;no-text=trên 2.448 kết quả |
| S6 | Dropdown Nhóm hàng hóa là cây: "Tất cả" đầu tiên, "QUÀ TẶNG" và con "Phiếu quà tặng" | `/admin/inventory-items/images` | `wait text=Hiển thị 1 - 50 trên 2.446 kết quả; click [aria-label="Nhóm hàng hóa"]; wait [role="option"]:has-text("Phiếu quà tặng")` | AC-04 | count [role="option"] >> text="Tất cả" = 1;count [role="option"] >> text="QUÀ TẶNG" = 1;count [role="option"] >> text="Phiếu quà tặng" = 1;count [role="option"] >> text="Giày nữ" = 1 |
| S7 | Chọn nhóm cha "QUÀ TẶNG" + Tất cả → 8 nhóm (3 trực tiếp + 5 của nhóm con), không phải 3 | `/admin/inventory-items/images` | `wait text=Hiển thị 1 - 50 trên 2.446 kết quả; click [aria-label="Tìm kiếm theo"]; click [role="option"]:has-text("Tất cả"); click [aria-label="Nhóm hàng hóa"]; click [role="option"] >> text="QUÀ TẶNG"; click button:has-text("Lấy dữ liệu"); wait text=Hiển thị 1 - 8 trên 8 kết quả` | AC-04 | text=Hiển thị 1 - 8 trên 8 kết quả;count tbody tr = 8;count td >> text="Phiếu quà tặng" = 5;count td >> text="QUÀ TẶNG" = 3 |
| S8 | Từ khoá là mã biến thể viết thường ("aaamed-39") + Tất cả → tìm ra mẫu mã A, không có B | `/admin/inventory-items/images` | `wait text=Hiển thị 1 - 50 trên 2.446 kết quả; click [aria-label="Tìm kiếm theo"]; click [role="option"]:has-text("Tất cả"); fill form input = aaamed-39; click button:has-text("Lấy dữ liệu"); wait text=Hiển thị 1 - 1 trên 1 kết quả` | AC-05 | text=AAA-MEDIA-A;no-text=AAA-MEDIA-B;count tbody tr = 1 |
| S9 | Quay lại đưa về lưới hàng hoá | `/admin/inventory-items/images` | `wait text=Hiển thị 1 - 50 trên 2.446 kết quả; click button:has-text("Quay lại"); wait button:has-text("In tem mã")` | AC-01 | count button:has-text("In tem mã") = 1;count button:has-text("Tiện ích") = 1;no-text=Lấy dữ liệu |
| S10 | Cập nhật ảnh nhanh mở từ menu Tiện ích: header "Cập nhật 0/0 ảnh", danh sách định dạng, khối Lưu ý ba dòng, vùng thả, nút Cập nhật vô hiệu | `/admin/inventory-items` | `wait tbody tr; click button:has-text("Tiện ích"); click [role="menuitem"]:has-text("Cập nhật ảnh nhanh"); wait text=Kéo thả ảnh vào đây hoặc bấm Chọn ảnh` | AC-01, AC-11 | text=Cập nhật 0/0 ảnh;text=.jpg, .jpeg, .png, .gif, .webp;text=< 2MB;text=Lưu ý;text=Mã SKU (STT);text=AOSOMI (01);text=ghi đè toàn bộ ảnh;count button:has-text("Chọn ảnh") = 1;count button:has-text("Cập nhật"):disabled = 1 |
| S11 | Quay lại từ trang ảnh nhanh về lưới hàng hoá | `/admin/inventory-items/images/quick` | `wait text=Kéo thả ảnh vào đây hoặc bấm Chọn ảnh; click button:has-text("Quay lại"); wait button:has-text("In tem mã")` | AC-01 | count button:has-text("In tem mã") = 1;no-text=Kéo thả ảnh |
| S12 | Sau lượt Cập nhật ảnh nhanh của T-02-03 (A nhận bộ ảnh mới): trang Cập nhật ảnh (đã cập nhật) vẫn đúng 2 nhóm A, B với thumbnail | `/admin/inventory-items/images` | `wait text=Hiển thị 1 - 50 trên 2.446 kết quả; click [aria-label="Tìm kiếm theo"]; click [role="option"]:has-text("Hàng hóa đã cập nhật ảnh"); click button:has-text("Lấy dữ liệu"); wait text=Hiển thị 1 - 2 trên 2 kết quả` | AC-13 | text=AAA-MEDIA-A;text=AAA-MEDIA-B;count img[src*="/erp-media-public/"] = 2 |

## Not verified here

- AC-06 (403 cho `set-images` / `/media/uploads` khi thiếu `inventory.write`; menu ẩn): e2e
  `inventory-item-set-images` ca 4 và `product-image-search`; phần menu ẩn cần phiên tài khoản
  chỉ đọc — không có env riêng, kiểm tay.
- AC-07, AC-08, AC-09, AC-10 (tải ảnh trên dòng, giới hạn file, owner suy từ id, partial
  success): e2e `inventory-item-set-images` + done-when T-01-04 (kiểm tay tab Network).
- AC-11 (phân loại sau khi thả), AC-12 (quy tắc tên), AC-13/AC-14 (tải lên, ghi đè, hạn mức),
  AC-15 (Đổi ảnh / bỏ thẻ / thả thêm), AC-16 (trùng STT), AC-17 (rời trang khi đang tải): runner
  không chọn được file. Chứng minh bằng e2e `resolve-image-names` (AC-12, AC-16 server) và hai
  script Playwright dùng cùng phiên này (`verify-t0202.py`, `verify-t0203.py`, `verify-t0203b.py`,
  kết quả ghi trong done-when của T-02-02 / T-02-03, ảnh chụp trong scratchpad của phiên). S10 chỉ
  phủ bố cục trang; S12 phủ hệ quả của AC-13 trên trang Cập nhật ảnh.
