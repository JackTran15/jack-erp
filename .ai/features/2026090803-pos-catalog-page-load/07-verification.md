---
feature: 2026090803-pos-catalog-page-load
environment: local-pos
viewports: [desktop]
date: 2026-09-08
verified_by: Claude
---

# Verification — trang POS không còn tải toàn bộ catalog

Chạy thủ công qua Chrome: kịch bản là **đếm request và đo byte**, thứ `aidlc-verify`
không phơi ra được.

- POS `http://localhost:3001/pos/` — vite dev từ checkout này
- API `http://localhost:4000` — `apps/api/.env` → `DB_NAME=erp_dev_3008`, 0 `EADDRINUSE`
- Phiên trình duyệt: **org `e60e5f49…` ("MT", bản restore prod)**, chi nhánh **Cà Mau**
  `0905fbc6…` — session khôi phục từ localStorage, **không** phải org của token curl
  (`f1000000…`). Đã kiểm `branchId` trong URL request thật trước khi đối chiếu số liệu.

## Kết quả

| # | Bước | Kỳ vọng | Thực tế |
|---|---|---|---|
| 1 | Mở `/pos/` giỏ trống, đếm request `/pos/branches/*` | 0 × `GET /catalog` | **0** ✔ (AC-01) |
| 2 | — | 0 × `POST /catalog/stock` | **0** ✔ (AC-05, giỏ trống thì hook bail) |
| 3 | — | chỉ còn `/catalog/products?page=1&pageSize=30` | đúng 1 request đó ✔ |
| 4 | Byte payload catalog lúc mở trang | ≤ 100 kB | **8 638 B** ✔ (AC-02) |
| 5 | Ô F3 khi trang vừa vẽ | gõ được ngay | không mờ, gõ được ✔ (AC-03) |
| 6 | Giỏ 1→2→3 dòng | 1 request mỗi lần đổi tập itemId | ✔ (AC-04) |
| 7 | Sửa số lượng | 0 request | ✔ |
| 8 | Để yên 10 s | 0 request | ✔ không có vòng lặp |
| 9 | Khôi phục hoá đơn lưu tạm 3 dòng | tồn được điền, cảnh báo đúng | ✔ (AC-06) |
| 10 | Enter chuỗi khớp mờ đúng 1 | thêm vào giỏ | ✔ (AC-08) |

## Con số trước / sau

| | Trước | Sau |
|---|---|---|
| `GET /catalog` (Cà Mau, 10 400 item) | **~3 835 kB** (ước tính SQL) | **không gọi nữa** |
| `GET /catalog` (Hồ Chí Minh, 1 730 item) | **677 773 B** (đo qua API) | **không gọi nữa** |
| Payload catalog lúc mở trang | 677 773 B + 8 638 B | **8 638 B** |
| Tồn cho giỏ 3 dòng | (nằm trong 3 835 kB) | **1 185 B**, 25 ms |

Payload lúc mở trang giờ **không phụ thuộc kích thước chi nhánh** — `pageSize=30` cố định.

## Chưa kiểm được — nói thẳng

1. **Hai toast của `addProductByQuery`** (0 khớp → "Không tìm thấy hàng hoá";
   nhiều khớp → "Nhiều kết quả"). Đã kiểm ở tầng endpoint (`limit=2` trả 0 và 2 dòng
   đúng như ba nhánh cần), **chưa nhìn lại trên UI**: sau vài lượt Enter, thao tác gõ
   qua công cụ trình duyệt thành chập chờn rồi phiên hỏng hẳn
   (`Cannot access a chrome-extension:// URL`). Dừng thay vì thử lại mù.
2. **`CatalogErrorAlert` khi request lưới hỏng.** Tắt cả API là thí nghiệm sai —
   không có chi nhánh thì query bị `enabled: false`, không có lỗi để hiện. Cần chặn
   riêng một endpoint.
3. **AC-10 (dialog biến thể mở từ chuỗi tìm)** — **không tồn tại trong UI**:
   `openForQuery` không có caller nào. Lỗi lập kế hoạch của tôi, chi tiết ở T-03-02.
4. **Chuyển kho nhanh (AC-11)** — chưa chụp lại. Nó dùng `useSearchPosBranchCatalog`,
   không dùng `useCatalogQuery`, và `grep` xác nhận không file nào của nó bị đụng.

## Bộ test

| | tổng | pass | fail |
|---|---|---|---|
| `apps/pos-web` (vitest) | 183 | 180 | **3** |
| `@erp/api` (jest, các suite catalog) | 113+ | tất cả | 0 |

Ba ca đỏ vẫn đúng `src/lib/common/api-axios.test.ts`, đỏ sẵn từ trước.

**BẪY:** `.vitest/json/output.json` không phải lúc nào cũng được ghi lại — phải `rm`
trước mỗi lần đọc, nếu không sẽ đọc kết quả của lần chạy trước. Đã dính một lần trong
phiên này (báo 1 failed trong khi thực tế 28 passed).
