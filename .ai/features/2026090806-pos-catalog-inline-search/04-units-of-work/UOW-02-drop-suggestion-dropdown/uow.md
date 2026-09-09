---
id: UOW-02
slug: drop-suggestion-dropdown
title: Bỏ dropdown gợi ý SKU, giữ nguyên quét mã vạch
demoable: true
duration: 1d
depends_on: []
requirements: [US-02, US-03]
verifies: [AC-06, AC-07, AC-08, AC-09]
risk: medium
status: todo
rollback: một commit revert; prop mới mặc định tắt nên revert không ảnh hưởng nơi khác
---

# UOW-02 — Bỏ dropdown, giữ máy quét

## Demo script

1. Mở POS, gõ `112` vào ô tìm sản phẩm → **không** có danh sách thả xuống, cũng không
   khung "Không có kết quả." (AC-06).
2. Cùng hàng đó, mở ô "Lọc theo nhóm hàng hóa" → dropdown nhóm hàng vẫn hiện bình thường (AC-07).
3. Ô F3 ở thanh dưới (`POSToolbar`) → dropdown gợi ý vẫn hiện bình thường (AC-07).
4. Màn "Chuyển kho nhanh" → ô tìm sản phẩm ở đó vẫn có dropdown (AC-07).
5. **Quét một mã vạch thật** (hoặc dán đúng mã SKU rồi chờ 150 ms) vào ô tìm sản phẩm →
   mặt hàng vào thẳng giỏ, ô tìm tự xoá, **không** dialog nào mở (AC-08).
6. Quét lại đúng mã đó lần nữa → số lượng dòng đó tăng thêm 1, không nhân đôi dòng (AC-09).

## In scope

- `suppressSuggestions?: boolean` (mặc định `false`) trên `PosSearchPopover`.
- Bật prop đó ở ô tìm sản phẩm của `ProductCatalogHeader`.
- Dọn các prop chỉ phục vụ dropdown ở call-site đó nếu chúng thành vô nghĩa.

## Not in scope

- `use-checkout-barcode-auto-add.ts` — không sửa dòng nào. Guard `claimRef`,
  `tryAutoAdd`, `searchWithAutoAdd` giữ nguyên.
- Ba nơi dùng `PosSearchPopover` còn lại.
- `openForQuery()` / đường Enter.

## Risks

| Risk | Mitigation |
|---|---|
| **Quét mã vạch ngừng thêm hàng** — rủi ro lớn nhất của cả feature | ADR-01 chọn thêm prop thay vì tháo popover chính vì lý do này: `search` callback (nơi auto-add sống) không bị chạm. Bước 5–6 Demo script kiểm trực tiếp |
| Prop mới làm hỏng 3 nơi dùng khác | Mặc định `false`; bước 2–4 Demo script kiểm cả ba |
| Dọn quá tay `addProductByItem` | A-09: hàm này còn caller ở ô F3, chỉ bỏ *lời gọi* ở header chứ không xoá hàm |

## Definition of done

- [x] Bước 1 Demo script chạy thật: gõ `AK59` rồi `ABA2777` vào ô tìm sản phẩm →
      **không** danh sách thả xuống, **không** khung "Không có kết quả." (AC-06)
- [x] `pnpm --filter @erp/pos-web exec tsc --noEmit` sạch
- [x] `use-checkout-barcode-auto-add.ts` không có dòng nào trong diff
- [x] `suppressSuggestions` mặc định `false` và chỉ được truyền ở đúng một call-site

## Còn lại (cần bạn chạy)

**Bước 2–4** (ba ô tìm còn lại vẫn có dropdown): chưa bấm thử. Lập luận là prop mặc định
`false` và không nơi nào khác truyền nó — kiểm được bằng grep — nhưng đó không phải là
nhìn thấy dropdown mở ra.

**Bước 5–6 (AC-08, AC-09) — quan trọng nhất, và tôi cố ý dừng.** Quét một mã vạch thật,
hoặc gõ đúng `ABA2777-D-38`, sẽ **thêm một dòng vào hoá đơn nháp đang mở của bạn**
(`DRAFT-1788847068706`, đang có 2 dòng, 2.095.000đ). Tôi không tự ý ghi vào dữ liệu đang
làm dở của bạn. Đây cũng là rủi ro lớn nhất của cả feature — xin bạn quét thử một mã
trong một hoá đơn nháp trống.
