---
feature: 2026090802-pos-catalog-search-perf
environment: local-pos
viewports: [desktop]
date: 2026-09-08
verified_by: Claude
---

# Verification — POS checkout gõ một lần, một request

Chạy thủ công qua Chrome (không qua `aidlc-verify`: kịch bản này phải **đếm request**
trên network panel, mà runner không phơi ra được).

- POS `http://localhost:3001/pos/` — vite dev từ checkout này
- API `http://localhost:4000` — `DB_NAME=erp_dev_3008`, 0 dòng `EADDRINUSE`
- Tài khoản `admin@erp.local`, org `f1000000…`, chi nhánh **Cà Mau**
  (`0905fbc6-5746-417c-afe6-8c6265c4ddd6`) — phiên khôi phục sẵn từ localStorage

## Kết quả

| # | Bước | Kỳ vọng | Thực tế |
|---|---|---|---|
| 1 | Gõ `2` vào ô F3 | 0 request | **0** ✔ |
| 2 | Gõ tiếp thành `23` | 0 request | **0** ✔ |
| 3 | Gõ tiếp thành `235` | đúng 1 request `/catalog/search` | **1 GET** `…/catalog/search?q=235&mode=full&view=suggest&limit=20` → 200 ✔ |
| 4 | — | 0 request `/catalog/lookup` | **0** ✔ |
| 5 | — | 0 request `/catalog?search=` | **0** ✔ |
| 6 | Dropdown | tên + `mã · đơn vị`, ≤8 dòng | ✔ ảnh `01` |
| 7 | Nhập mã vạch `MY556-25-V-38` | auto-add đúng 1 lần, dropdown đóng, ô xoá | **SL = 1**, tổng 780.000 ✔ ảnh `02` |
| 8 | Cảnh báo bán vượt tồn | hiện (item này `sellableQuantity = 0`) | **hiện** — chấm đỏ trên dòng ✔ ảnh `02` |
| 9 | Nhập lại chính mã đó | SL lên 2, vẫn 1 dòng | **SL = 2**, tổng 1.560.000 ✔ ảnh `03` |
| 10 | Gõ `2` rồi Enter | 1 request `mode=exact`, không bị `minChars` chặn | **1 GET** `…?q=2&mode=exact&view=full` → 200 ✔ |
| 11 | Enter không khớp | rơi về `addProductByQuery()` như cũ | dialog "Nhiều kết quả — chọn hàng bên dưới hoặc thu hẹp từ khóa." ✔ |
| 12 | Ô thứ hai (Shift+F3), gõ `AB` | 0 request | **0** ✔ |
| 13 | Ô thứ hai, gõ tiếp `ABA` | 1 request | **1 GET** `…?q=ABA&mode=full&view=suggest&limit=20` ✔ ảnh `04` |

`OPTIONS` preflight của CORS không tính là request ứng dụng; mỗi lượt gõ sinh đúng
1 `OPTIONS` + 1 `GET`.

## Ảnh

| File | Nội dung |
|---|---|
| `evidence/01-dropdown-235-one-request.jpg` | Dropdown sau khi gõ `235` — 1 request |
| `evidence/02-barcode-autoadd-qty1-oversell-warning.jpg` | Auto-add mã vạch, SL=1, chấm đỏ cảnh báo vượt tồn |
| `evidence/03-rescan-qty2.jpg` | Quét lại → SL=2, vẫn 1 dòng |
| `evidence/04-second-input-shift-f3.jpg` | Ô Shift+F3 cũng 1 request, cũng minChars 3 |

## Quan sát ngoài phạm vi

Network panel còn cho thấy `GET /catalog` (**không** `search`) và
`GET /catalog/products?page=1&pageSize=30` — đường tải catalog lúc mở trang
(`useCatalogQuery` / `useCatalogProductsQuery`). Đây **đúng** là mục đã ghi
"Out of scope" trong `00-intent.md`, không phải thứ feature này tạo ra, và là
ứng viên rõ ràng cho feature kế tiếp.

## Chưa làm được

Không chụp được màn Chuyển kho nhanh ở chi nhánh có tồn: tài khoản đăng nhập được
thuộc org `f1000000…`, và không chi nhánh nào của nó có tồn ở kho chính. Không-hồi-quy
của đường đó đã chứng minh ở T-02-03 (`EXCEPT` hai chiều, 3 term, 0 lệch) và T-02-04
(response API còn nguyên `locations[]`).

## Bộ test toàn workspace (2026-09-08)

| Suite | Kết quả |
|---|---|
| `@erp/api` (jest) | **331/332 suite pass, 4 036/4 039 test pass** |
| `apps/pos-web` (vitest) | 169 tổng, **166 pass, 3 fail** |

Hai test đỏ ở API là `AuthService › token TTL › login() honors a JWT_ACCESS_TTL override`
và `… switchBranch() mints tokens carrying the configured TTL`. **Đỏ sẵn từ trước**,
không phải do feature này: `git stash` toàn bộ thay đổi `modules/pos` + migration rồi
chạy lại vẫn đỏ đúng hai ca đó. Hai file `auth.service.ts` / `auth.service.spec.ts` vốn
đã nằm trong working tree ở trạng thái sửa dở trước khi phiên này bắt đầu.

Ba test đỏ ở pos-web đều trong `src/lib/common/api-axios.test.ts` (refresh-token 401),
cũng đỏ sẵn — số ca đỏ không đổi trước và sau (3 → 3).

**Cảnh báo cho lần sau:** `pnpm --filter @erp/api test` qua rtk báo "7 failed suites,
3 995 tests" — **sai**. Con số thật lấy từ JSON trong log tee của rtk
(`~/Library/Application Support/rtk/tee/*_jest_run.log`): 1 suite / 2 test. Đừng tin
dòng tóm tắt mà rtk in ra cho jest.
