---
id: UOW-01
slug: goods-receipt-select-row
title: Nhập kho — chọn phiếu không còn tải dòng hàng
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04]
risk: medium
status: todo
rollback: revert 1 commit phía backoffice-web; không có thay đổi BE, không có migration
---

# UOW-01 — Nhập kho: chọn phiếu không còn tải dòng hàng

Lát cắt rẻ nhất và làm **trước tiên**, vì hạ tầng BE đã đủ từ `2026083002`: chỉ sửa client.
Nó cũng là lát cắt cho ra **số đo** để quyết định các lát sau có đáng làm không — bài học
`2026083002` là payload giảm mà wall-clock lại tăng.

## Demo script
1. Đăng nhập backoffice, vào **Kho > Nhập kho**, chọn kỳ có phiếu ≥ 200 dòng
2. Mở DevTools > Network, xoá log, rồi click chọn phiếu đó trên lưới
3. Chỉ thấy **một** request `GET /goods-receipts/:id?includeLines=false`; mở Preview,
   không có trường `lines`. So sánh cột Size với số đo đã ghi ở bước trước khi sửa
4. Panel "Chi tiết" bên dưới vẫn hiện dòng và cuộn xuống vẫn nạp tiếp
5. Bấm **Sửa** → nút khoá kèm spinner, rồi dialog mở ra với đủ dòng
6. Bấm **Nhân bản** và **In tem mã** (khi chưa tick phiếu nào) → cùng hành vi, đủ dòng
7. Tắt mạng rồi bấm **Sửa** → toast lỗi, dialog **không** mở, nút bấm lại được

## In scope
- `PurchaseOrdersPage.tsx`: query chọn-dòng, ba nút cần dòng, trạng thái khoá nút
- Số đo trước/sau (bytes + wall-clock) trên phiếu ≥ 200 dòng và trên phiếu ~5 000 dòng

## Not in scope
- Bất kỳ thay đổi nào phía API (ADR-01)
- Panel "Chi tiết" và dialog Xem — đã phân trang xong ở `2026083002`

## Risks
| Risk | Mitigation |
| --- | --- |
| `selectedOrder` được đọc ở 9 chỗ; bỏ sót một chỗ cần `lines` là lỗi im lặng | T-01-02 liệt kê đủ 9 chỗ trong done-when, đối chiếu từng chỗ |
| Wall-clock không giảm như intent hứa | T-01-03 đo và **ghi đúng số đo**, kể cả khi số xấu; đó là dữ liệu quyết định UOW-03..05 |


## Bằng chứng trình duyệt — G4

Chuyển xuống đây ngày 8/9/2026 (reopen G3). Trước đó chúng nằm trong done-when của ticket,
khiến ticket không bao giờ `submit` được vì agent CLI không có trình duyệt. Chúng là bằng
chứng mức demo và thuộc về gate G4.

- [x] ~~*(từ T-01-02)* Nút bị khoá + có chỉ báo đang tải trong lúc chờ; nút khác không bị khoá lây —~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
      **CHỈ CHỨNG MINH ĐƯỢC MỘT NỬA.** Logic có mặt và được test tĩnh khẳng định (`pendingAction`
      đặt/xoá trong `try`/`finally`, `disabled`/`tooltip` theo từng action). Trạng thái tạm thời
      thì **không quan sát được**: lượt nạp mất vài chục ms nên không chụp kịp khung có spinner.
      Không tick, và không đổi lời tiêu chí cho dễ qua. Đóng được bằng cách bóp băng thông
      (DevTools throttling) hoặc thêm test có RTL — cả hai đều ngoài phạm vi ticket này.
## Definition of done
- [x] ~~AC-01..AC-04 pass~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] Không có chỗ nào còn đọc `selectedOrder.lines` mà chưa qua đường nạp-khi-bấm — grep 8/9:
      các chỗ còn lại là `full.lines` (kết quả nạp-khi-bấm), `order.lines` trong đường in hàng loạt
      (tự gọi `GET /:id` cho từng phiếu) và `o.lines ?? []` phòng thủ trong hàm tính tổng
- [x] ~~Số đo trước/sau được ghi vào `08-evidence.md`~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~Mọi mục trong "Bằng chứng trình duyệt — G4" ở trên đã được kiểm~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~Demoed và được chấp nhận ở gate G4~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
