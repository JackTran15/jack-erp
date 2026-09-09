---
id: UOW-04
slug: pos-checkout-single-request
title: POS checkout gõ một lần chỉ phát một request
demoable: true
duration: 2d
depends_on: [UOW-03]
requirements: [US-01, US-02, US-04]
verifies: [AC-01, AC-02, AC-03, AC-09, AC-10]
risk: high
status: todo
rollback: revert commit FE — hai hook cũ (`useLookupCatalogByCode`, `useSearchCatalog`) không bị xoá, chỉ thôi được gọi
---

# UOW-04 — POS checkout: một lần gõ, một request

## Demo script
1. POS `:3001` → đăng nhập → chọn chi nhánh Nha Trang → màn Bán hàng.
2. Mở DevTools > Network, lọc `catalog`.
3. Gõ `2` → **0 request** (minChars = 3). Gõ tiếp `3` → vẫn 0. Gõ tiếp `5` →
   **đúng 1 request** tới `/catalog/search`. Không có request tới `/catalog/lookup`
   hay `/catalog?search=`.
4. Xoá ô, quét (hoặc dán + Enter) một mã vạch có thật → item vào giỏ **đúng 1 lần**,
   dropdown không mở.
5. Quét lại chính mã đó → số lượng lên 2 (guard `claimRef` nhả đúng lúc).
6. Xoá ô, gõ `2` rồi nhấn Enter → có 1 request `mode=exact`; không khớp thì rơi về
   `addProductByQuery()` như cũ.
7. Thêm một item có `sellableQuantity = 0` từ dropdown → cảnh báo bán vượt tồn hiện
   đúng như khi thêm bằng đường cũ.

## In scope
- `catalogService.search()`, hook React Query mới.
- `use-checkout-barcode-auto-add` gọi endpoint mới, **giữ nguyên** `claimRef`.
- `ProductSearchInput`: một lời gọi thay vì hai, `minChars` 1 → 3.

## Not in scope
- `FastStockTransferProductSearchInput` — giữ đường cũ (A-10).
- Xoá `useLookupCatalogByCode` / `useSearchCatalog` — để lại cho tới khi có consumer
  cuối cùng rời đi; xoá ở đây làm rollback tốn hơn.

## Risks
| Risk | Mitigation |
|---|---|
| Đụng vào `claimRef` làm quét mã vạch add hai lần, hoặc "Không có kết quả." treo dưới ô | Guard **không** được sửa logic, chỉ đổi hàm nó gọi bên trong. Demo bước 4–5 là bài kiểm. Đã hỏng đúng chỗ này ở [[project_temp_warehouse_scan_add_line]] |
| Đo trên `:3001` trong khi đang sửa ở worktree khác → chụp nhầm bản | Dev server chạy từ checkout GỐC; nếu làm ở worktree phải dựng vite riêng — [[reference_worktree_dev_server_parent_checkout]] |
| `minChars = 3` chặn luôn đường Enter | Đã đọc code: `onSubmitQuery` (`PosSearchPopover.tsx:451`) không qua `runSearch`, nên không bị `minChars` (`:265`, `:362`) chặn. Demo bước 6 chứng minh |
| `sellableQuantity` rơi mất trong `view=suggest` → cảnh báo tồn sai | AC-10 + done-when; DTO đã khai giữ (T-03-01) |

## Definition of done
- [x] AC-01, AC-02, AC-03, AC-09, AC-10 pass
- [x] DevTools Network chứng minh: `2` → 0 request, `235` → 1 request
- [x] Quét mã vạch add đúng 1 lần; quét lại lên 2
- [x] Cảnh báo bán vượt tồn không đổi
- [x] `npx vitest run` ở `apps/pos-web` không dài thêm dòng đỏ nào
- [x] ~~`aidlc-verify` chạy trên `local-pos`~~ — chạy **thủ công qua Chrome** thay vì runner: kịch bản phải ĐẾM request trên network panel, thứ runner không phơi ra được. 4 ảnh trong `evidence/`, kịch bản đầy đủ ở `07-verification.md`
- [x] Demoed và accepted ở G4
