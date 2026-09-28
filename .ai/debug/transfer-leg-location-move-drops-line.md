# Báo cáo gỡ lỗi — XK001375 hiện 11 đôi, NK001415 hiện 13 đôi (lỗi QA #4)

Trạng thái: **đã tìm ra nguyên nhân gốc từ dữ liệu, đã sửa, script sửa dữ liệu đã chạy thử (dry-run) đúng.**
Truy vết trên `erp_dev_2709` (snapshot 2026-09-27).

> **4. Phiếu nhập/xuất điều chuyển — Nhập xuất không khớp số lượng?**
> MT211 Đà Nẵng xuất 13 đôi ngày 21, đến ngày 23 BMT nhập 13. Sau khi nhập xong kiểm
> tra lại phiếu xuất chỉ còn 11 đôi?

---

## 1. Diễn biến (lệnh điều chuyển LDC001260, `b90c94f2-…`)

| Giờ UTC | Sự kiện | Bằng chứng |
|---|---|---|
| 21/09 12:33:49 | Ghi sổ XK001375, **13** dòng, Đà Nẵng | 13 bút toán `GOODS_ISSUE −1` trong `stock_ledger_entries` |
| 23/09 02:53:32 | Ghi sổ NK001415, 13 dòng, kệ `999` của BMT | 13 bút toán `TRANSFER_IN +1` |
| 23/09 03:21:53.117 | Sửa NK001415 → rev 1. Chỉ hai dòng đổi kệ: `HPHMT286-D-37` 999→A09.02, `THU6288-6-K-37` 999→A22.05 | với mỗi mã: `ADJUSTMENT_DECREASE −1 @999` + `ADJUSTMENT_INCREASE +1 @A…` |
| 23/09 03:21:53.864 | Sửa dây chuyền sang XK001375 → rev 1: **cả hai dòng bị xoá** | `ADJUSTMENT_INCREASE +1` cho từng mã tại Q13.02 / Q10.04 (Đà Nẵng), ghi chú `Adjustment for XK001375 rev 1` |

Hiện trạng: XK001375 có 11 dòng; NK001415 và `transfer_order_lines` có 13.
Đà Nẵng đang dư **2 đôi ảo** (+1 tại Q13.02, +1 tại Q10.04). BMT đúng.
Quét toàn bộ lệnh điều chuyển đã hoàn tất để tìm chênh lệch xuất/nhập theo từng mã: chỉ có
đúng hai dòng này.

## 2. Nguyên nhân gốc

`GoodsReceiptService.update()` (`goods-receipt.service.ts:~604`) và hàm đối xứng trong
`GoodsIssueService.update()` tính chênh lệch theo **(mã hàng, vị trí)** bằng
`computeVoucherDelta`, rồi truyền sang `TransferOrderService.applyLegRevision` sau khi đã
bỏ thông tin vị trí. Một lần đổi kệ sinh ra hai chênh lệch cho cùng một mã hàng:

```
[{ itemId: X, quantityDelta: −1 },   // kệ cũ 999
 { itemId: X, quantityDelta: +1 }]   // kệ mới A09.02
```

Sau đó `applyDeltaToLines` làm:

```ts
const remainingByItem = new Map(deltas.map((d) => [d.itemId, d.quantityDelta]));
```

`Map` dựng từ các khoá trùng chỉ giữ giá trị **cuối cùng**. Giá trị −1 được giữ lại, nên
dòng tương ứng ở chiều phiếu bên kia về 0 và bị lọc mất
(`.filter((line) => line.quantity > 0)`). Tiếp đó chính `update()` của phiếu bên kia ghi
bút toán điều chỉnh +1. Chênh lệch thực là 0, nhưng chênh lệch được áp là −1 cho mỗi dòng
đổi kệ.

Docstring vốn đã giả định "mỗi chiều phiếu có tối đa một dòng cho mỗi mã hàng". Điều đó
đúng với phiếu, nhưng không đúng với danh sách chênh lệch: một lần đổi kệ luôn sinh ra hai
phần tử.

Lỗi xảy ra cả theo chiều ngược lại: đổi kệ một dòng trên XK đã ghi sổ thì dòng đó bị xoá
khỏi NK. Đường trước khi nhập (`adjustRequestedQty`) áp từng phần tử một, nên tình cờ vẫn
triệt tiêu đúng; giờ nó cũng nhận chênh lệch đã cộng gộp.

## 3. Cách sửa

`transfer-order.service.ts` → `applyLegRevision`: cộng gộp chênh lệch theo `itemId` và bỏ
các giá trị bằng 0 trước mọi bước khác. Một lần chỉ đổi kệ giờ triệt tiêu về 0 và hàm trả
về luôn mà không đụng tới chiều phiếu bên kia, y như khi danh sách chênh lệch rỗng.

Test (`transfer-order.service.spec.ts`, "deltas across duplicate SKU lines (AC-10)"):
- đổi vị trí triệt tiêu về 0, với cả hai thứ tự `[-1, +1]` và `[+1, -1]` → không gọi
  `update()` của phiếu bên kia
- `[-1, +3]` cho một mã → dòng phiếu bên kia tăng +2

Cả ba test đều đỏ trước khi sửa và xanh sau khi sửa. Các bộ test transfer-order,
goods-issue và goods-receipt đều qua (351/351).

## 4. Sửa dữ liệu

`apps/api/scripts/repair-xk001375-dropped-transfer-lines.sql`. Có điều kiện chặn, chạy
trong một transaction, và sẽ rollback trừ khi chạy với `-v commit=1`:
1. chèn lại hai dòng vào đúng kệ ban đầu (195.000 / 275.000)
2. đánh lại số thứ tự dòng của XK001375 theo thứ tự của NK001415
3. ghi một bút toán đảo `ADJUSTMENT_DECREASE −1` cho mỗi mã. Sổ kho vẫn chỉ ghi thêm,
   không xoá gì.
4. áp cùng mức −1 vào `stock_balances`
5. đặt revision thành 2

Chạy thử trên `erp_dev_2709`: XK 13 / NK 13, tổng 3.250.000, không còn mã nào lệch, và số
dư sổ kho ròng của XK001375 tại mỗi kệ được khôi phục là −1. Nếu điều kiện chặn thấy trạng
thái khác với trạng thái sau lỗi, script sẽ dừng, nên chạy lần hai không thể áp bản sửa
hai lần.

**Trước khi chạy trên production:** Đà Nẵng có thể đã bán hoặc chuyển 2 đôi ảo đó từ sau
ngày 23/09. Khi đó bút toán đảo có thể làm Q13.02 / Q10.04 bị âm. Như vậy là đúng về sổ
sách, nhưng cần xác nhận với chi nhánh trước.
