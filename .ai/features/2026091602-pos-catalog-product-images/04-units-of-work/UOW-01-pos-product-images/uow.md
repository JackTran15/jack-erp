---
id: UOW-01
slug: pos-product-images
title: Màn Bán hàng hiện ảnh hàng hoá — lưới catalog và dialog chọn biến thể
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-02]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06]
risk: low
status: todo
rollback: Revert các commit của UoW — 4 file sửa + 1 file mới trong `apps/pos-web/src`, không migration, không đổi contract API, không feature flag. Sau revert POS trở lại placeholder như hôm nay, API vẫn trả `imageUrl` như trước.
---

# UOW-01 — Màn Bán hàng hiện ảnh hàng hoá

## Demo script

Trên `erp_dev` (`DB_NAME=erp_dev pnpm --filter @erp/api dev`), MinIO local đang chạy, fixture
media-storage đã reset (`python3 .ai/features/2026091301-media-storage/verify-fixtures.py --reset`),
POS `:3001`, tài khoản `admin@erp.local`, chi nhánh **Hồ Chí Minh**.

1. Vào màn Bán hàng, gõ `AIDLC` vào ô tìm hàng → lưới còn 3 card. Card **AAA-MEDIA-A** và
   **AAA-MEDIA-B** hiện ảnh phủ kín ô, badge giá xanh vẫn ở góc dưới-trái; card **AAA-MEDIA-C**
   là túi xám như cũ (AC-01, AC-02).
2. Tab Network (lọc `Img`): hai request ảnh tới `localhost:3000/erp-media-public/...`, **không**
   có header `Authorization`; không có request `GET /pos/...` nào mới so với trước (chỉ tải lại
   trang mới có).
3. Bấm card A → dialog chọn biến thể: ô đầu dialog là thumbnail cùng ảnh, nhãn "Xem" (AC-04).
4. Tick một biến thể, bấm ô "Xem" → dialog thứ hai hiện ảnh lớn với tên hàng ở header. Bấm Esc
   → chỉ dialog ảnh đóng, biến thể vẫn tick, focus nằm trên ô "Xem" (AC-05). Bấm lại, đóng bằng
   nút X → như trên.
5. Đóng dialog, bấm card C → ô đầu dialog là túi xám + "Xem"; bấm không mở gì (AC-06).
6. DevTools → Network → chuột phải request ảnh của A → *Block request URL*; tải lại trang, tìm
   `AIDLC` → card A rơi về túi xám, không toast, console không có lỗi mới (AC-03).
7. `pnpm --filter @erp/pos-web build` xanh; `git diff --stat` chỉ có `apps/pos-web/src/**` và
   `.ai/features/2026091602-*/**`.

## In scope

- `CatalogProduct.imageUrl` + map từ `PosProductCard`
- `ProductImage` (ảnh có fallback, `page-components/Checkout/ProductImage/`) — dùng chung cho card và header dialog
- `ProductCard`: ảnh phủ ô 120px, badge giá đè lên
- `ProductHeaderInfo`: thumbnail 96×96 + nút "Xem" mở `PosDialog` ảnh lớn
- `07-verification.md` + evidence trên env `local-pos`

## Not in scope

- Đổi API / `openapi:generate` (A-01)
- Picker của `FastStockTransferPage`, `ReturnGoodsPage` (A-02)
- Thumbnail theo biến thể trong `VariantTable` (A-03)
- nginx production cho bucket công khai (T-05-02 media-storage, A-04)

## Risks

| Risk | Mitigation |
| --- | --- |
| Ảnh gốc ≤ 2 MB × 20 card làm lưới nặng trên máy POS yếu | `loading="lazy"` + `decoding="async"`; lưới cao tối đa 400px nên chỉ ~12 card trong khung nhìn tải trước; media-storage chưa có thumbnail, ghi nhận để feature sau chỉ cần đổi URL |
| Ảnh có tỉ lệ dọc bị `object-cover` cắt mất phần trên/dưới trên ô 2.5:1 | Chủ sở hữu chọn cover (A-05); dialog "Xem" hiện ảnh `object-contain` trọn vẹn để đối chiếu |
| Lồng hai `PosDialog`: Esc đóng cả hai, hoặc focus trả sai chỗ | Radix chỉ cho lớp trên cùng nhận Esc (A-07); T-01-02 kiểm bằng tay và T-01-03 kiểm bằng runner (S4/S5) |
| `LOCAL_POS_BRANCH_ID` trong `credentials.env` trỏ chi nhánh không tồn tại (A-12) | T-01-03 đặt lại về `c3bf1922-…` trước khi chụp phiên; ghi rõ trong `07-verification.md` |

## Definition of done

- [x] AC-01..AC-06 pass — evidence `aidlc-verify` trên `local-pos` (S1–S6) cho AC-01, AC-02, AC-04, AC-05, AC-06; AC-03 (chặn URL ảnh) làm bằng tay theo Demo script bước 6, ghi kết quả vào T-01-03
  - 2026-09-16: `08-evidence.md` pass 6/6 (commit cd19ec94); AC-03 bằng Playwright `page.route` abort (T-01-01, T-01-03); Esc + focus của AC-05 bằng Playwright ở T-01-02 (runner không có phím Esc, S5 dùng nút X).
- [x] `pnpm --filter @erp/pos-web build` xanh (tsc + vite)
  - 2026-09-16: "✓ built in 2.92s" sau T-01-02 (T-01-01: 2.84s).
- [x] `git diff --stat` so với base của UoW chỉ chạm `apps/pos-web/src/**` và `.ai/features/2026091602-*/**` — không có diff trong `apps/api`, `packages/`
  - 2026-09-16: `git diff --stat a3141048..cd19ec94` = 6 file, tất cả `apps/pos-web/src/**` (xem commit 68b5a3db, cd19ec94); phần `.ai/` commit riêng.
- [x] Không có request mới tới API khi mở màn Bán hàng và khi mở dialog (đếm trong tab Network trước/sau, ghi hai con số vào T-01-03)
  - 2026-09-16: 12 / 1 / 0 request API (mở màn + tìm / mở dialog / mở ảnh lớn), toàn bộ là endpoint có sẵn; ảnh đi thẳng `:3000/erp-media-public` không header — chi tiết ở T-01-03.
- [ ] Demo và nghiệm thu tại gate G4
