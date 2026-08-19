---
feature: temp-warehouse-scan-add-line
slug: temp-warehouse-scan-add-line
owner: Akenzy
created: 2026-08-19
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Sửa luồng quét mã ở màn "Kho tạm" (Chuyển kho nhanh)

Nguồn: báo lỗi QA mục **5. Kho tạm** ngày 2026-08-19, kèm 2 ảnh chụp màn
`/fast-stock-transfer` tab **Xuất đi**, chi nhánh Huế.

> Nguyên văn: *"Scan lâu lâu ko nhận vị trí, ko nhấn enter được. Phải nhấn chọn sp ở
> option dưới select, sau đó mới enter được."*
> Chú thích trên ảnh: *"Hiện lên đôi này mà k có kho"* và *"Vẫn hiện thêm 1 dòng dưới đây.
> Khi k nhận k bên vị trí"*.

## Problem

Thủ kho quét mã vạch liên tục để đẩy hàng từ kho ra showroom. Luồng thiết kế là:
quét → hệ thống tự chọn hàng → focus nhảy sang nút **Thêm** → Enter là xong dòng.
Trên thực tế luồng này đứt ở ba chỗ, mỗi chỗ đều buộc người dùng bỏ máy quét xuống
và dùng chuột:

1. **Enter "không ăn".** Ô *Hàng hóa* chỉ tự chọn hàng khi `GET /catalog/lookup`
   (khớp **tuyệt đối** mã vạch/SKU) trả về **đúng 1 dòng**. Khi mã quét không khớp
   tuyệt đối (chưa gán mã vạch, mã có tiền tố/số kiểm tra khác) hoặc khớp nhiều biến
   thể, code rơi về tìm ILIKE: danh sách gợi ý hiện ra nhưng **không dòng nào được
   highlight sẵn** (`highlightIdx = -1`), nên Enter không chọn gì và focus vẫn nằm
   trong ô. Người dùng buộc phải bấm chuột vào option — đúng như báo lỗi.
   *(`use-fast-stock-transfer-product-picker.ts` → `productHybridAdapter`;
   `PosSearchPopover.tsx` → `handleKeyDown`)*

2. **Dropdown "Không có kết quả." dính lại.** Đường tự-chọn gọi thẳng `selectProduct`
   từ trong hàm search, **không đi qua** `selectItem` của `PosSearchPopover` — thứ duy
   nhất đóng popover. Sau khi tự chọn, `open` vẫn `true`, `suggestions` đã bị làm rỗng,
   input mang tên hàng → popover render dòng "Không có kết quả." treo dưới ô.
   Đây là "1 dòng dưới đây" trong ảnh 2.
   *(`PosSearchPopover.tsx` → `selectItem` vs `FastStockTransferProductSearchInput.tsx`)*

3. **Vị trí sai hoặc trống, và không sửa được bằng tay.** `applyPreferredShelf` chạy
   **bất đồng bộ** và **không xóa vị trí cũ trước khi gọi**: từ lúc chọn hàng đến lúc
   `batchPreferredShelf` trả về, ô *Vị trí* vẫn giữ kệ của **mặt hàng quét trước đó**.
   Với nhịp quét nhanh, dòng có thể được Thêm kèm kệ sai. Nếu mặt hàng chưa có kệ ưu
   tiên thì vị trí về rỗng; nếu chưa chọn được kho nguồn thì hàm `return` sớm và vị trí
   **không bao giờ** được cập nhật. Ô *Vị trí* đang bị `disabled` cứng nên người dùng
   không có đường sửa tay.
   *(`use-fast-stock-transfer-actions.ts` → `applyPreferredShelf`;
   `AddLineRow.tsx` → `<PosSelect ... disabled />`)*

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| Thủ kho / nhân viên quét hàng | Quét xong phải nhìn màn, thấy Enter không ăn thì rê chuột chọn hàng trong dropdown; thỉnh thoảng dòng được thêm với vị trí của mặt hàng trước | Quét → Enter → dòng vào bảng, tay không rời máy quét |
| Người kiểm phiếu (đối chiếu kho) | Phải tin cột Vị trí mà cột này có thể mang kệ của mặt hàng khác | Cột Vị trí luôn là kệ của đúng mặt hàng đó, hoặc trống rõ ràng |

## Success signal

Quét liên tiếp 20 mã (gồm ít nhất 3 mã **không** khớp tuyệt đối) trên tab *Xuất đi*:
20/20 dòng vào bảng chỉ bằng máy quét + phím Enter, **0 lần chạm chuột**, và
20/20 dòng có cột *Vị trí* đúng kệ của chính mặt hàng đó (hoặc trống — không bao giờ
mang kệ của mặt hàng liền trước).

## Out of scope

- Backend `temp-warehouse` (entity, service, endpoint) — cả 3 lỗi đều nằm ở `pos-web`.
- Thuật toán chọn kệ ưu tiên (`batchPreferredShelf`) — sửa cách **dùng** kết quả,
  không đụng cách **tính** kết quả.
- Gán mã vạch cho mặt hàng chưa có (việc dữ liệu, không phải việc code).
- **Hành vi của các màn POS khác** dùng chung `PosSearchPopover` (Checkout, Đổi trả hàng)
  — chốt 2026-08-19: giữ nguyên tuyệt đối. Mọi thay đổi ở component dùng chung phải đi
  qua prop mới có **mặc định = hành vi hiện tại**.

## Constraints

| Kind | Detail |
|---|---|
| Deadline | Không có; đây là 1 mục trong danh sách QA đang chạy |
| Platform | `pos-web` (React 19 + Zustand + TanStack Query), desktop, tiếng Việt |
| Shared surface | `PosSearchPopover` là component dùng chung của POS — sửa nó ảnh hưởng Checkout, Đổi trả hàng |
| Không có test | `apps/pos-web` chưa có test nào cho màn này; `npx vitest run` chạy được (xem memory `pos_web_vitest_works`) |

## Existing surface touched

- Trang: `apps/pos-web/src/pages/FastStockTransferPage.tsx` (route `/fast-stock-transfer`)
- Ô nhập: `components/page-components/FastStockTransfer/FastStockTransferToolbar/AddLineRow/`
  (`AddLineRow.tsx`, `FastStockTransferProductSearchInput/`)
- Component dùng chung: `components/common/PosSearchPopover/PosSearchPopover.tsx`
- Logic: `hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-actions.ts`
  (`applyPreferredShelf`, `handleAddRow`),
  `use-fast-stock-transfer-product-picker.ts` (`productHybridAdapter`, `claimRef`)
- Tính năng liền kề: `temp-warehouse-sale-status` (cùng miền Kho tạm, khác lớp — báo cáo)
