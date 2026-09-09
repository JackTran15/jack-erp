---
id: UOW-08
slug: stock-take-footer-totals
title: Kiểm kê — chân lưới cộng theo cả phiếu, không theo trang đã nạp
demoable: true
duration: 3h
depends_on: [UOW-05]
requirements: [US-05]
verifies: [AC-27]
risk: low
status: todo
rollback: revert 1 commit; chân lưới quay lại cộng theo trang đã nạp
---

# UOW-08 — Kiểm kê: chân lưới cộng theo cả phiếu

Lát cắt **sửa hồi quy do chính feature này gây ra**, tách khỏi UOW-05 ngày 8/9/2026 vì hai lý do:
gộp vào làm đường găng nội bộ của UOW-05 lên 2,1d (vượt trần 2,0d), và nó tự demo được — nó là một
hành vi người dùng nhìn thấy, không phải một mảnh của lát phân trang.

Hồi quy: sau khi UOW-05 chuyển panel sang phân trang, ba số ở chân lưới cộng trên **trang đã nạp**
nên lớn dần khi cuộn. Trước đó chúng luôn là tổng cả phiếu. Do agent làm T-05-04 tự phát hiện và
báo lại — nó không nằm trong bất kỳ AC nào cho tới khi AC-27 được thêm.

## Demo script
1. Mở **Kho > Kiểm kê kho**, chọn một phiếu nhiều trang dòng
2. Đọc ba số ở chân lưới khi mới nạp trang đầu
3. Cuộn xuống nạp thêm vài trang → **ba số không đổi**
4. Đối chiếu với tổng tính tay trên toàn bộ dòng của phiếu → khớp

## In scope
- `totals` trả từ `POST /v2/inventory/stock-takes/:id/lines/search`
- Panel đọc `totals` thay vì tự cộng

## Not in scope
- Chân lưới của bốn trang phiếu còn lại — chúng không có ô tổng theo dòng kiểu này; nếu có thì mở
  lát cắt riêng, đừng nhét vào đây

## Risks
| Risk | Mitigation |
| --- | --- |
| Quy ước `varianceTotal` khác giữa SQL và vòng lặp FE cũ (dòng chưa đếm) | Ticket bắt đọc lại `StockTakeDetailPanel.tsx:111-125` trước khi viết SQL, và có spec riêng cho dòng `countedQty` NULL |
| Thêm một round-trip nối tiếp | Truy vấn tổng chạy trong cùng `Promise.all` với truy vấn trang |

## Definition of done
- [x] ~~AC-27 pass~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~Ba số ở chân lưới không đổi khi cuộn thêm trang~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~`openapi.snapshot.json` + `schema.ts` regenerate~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.

## Bằng chứng trình duyệt — G4

- [x] ~~*(từ T-08-01)* Cuộn thêm vài trang trên một phiếu nhiều trang: ba số ở chân lưới KHÔNG đổi,~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
      và bằng tổng tính tay trên toàn bộ dòng (AC-27)
- [x] ~~Demoed và được chấp nhận ở gate G4~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
