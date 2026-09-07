---
feature: pos-draft-invoice-fixes
slug: 2026090401-pos-draft-invoice-fixes
owner: Akenzy
created: 2026-09-04
status: draft
---

# Intent — Hoá đơn lưu tạm: khôi phục đúng và không báo sai tồn

## Problem

Hoá đơn lưu tạm ở POS hiện dùng được nhưng ba chỗ sai khiến thu ngân phải làm thêm việc
hoặc bấm qua cảnh báo giả:

1. **Mở lại phiếu lưu tạm thì ô tiền thanh toán về 0.** Thu ngân đã nhập số tiền trước khi
   bấm "Lưu tạm", nhưng tab khôi phục hiện "Còn phải thu 595.000" trong khi dòng "Tiền mặt"
   là 0 và "Trả lại khách" ra −595.000. Phải gõ lại số tiền cho từng phiếu mở lại.
2. **Thanh toán phiếu mở lại luôn bị chặn bằng "Cảnh báo xuất quá số lượng tồn".** Dòng hàng
   khôi phục mang cờ chưa-biết-tồn, nên POS coi mọi dòng là vượt tồn kể cả khi kho còn hàng.
   Thu ngân đọc cảnh báo này thành "hàng đã bị phiếu nháp chiếm chỗ" và mất niềm tin vào con
   số tồn hiển thị.
3. **Màn "DS hoá đơn" liệt kê cả hoá đơn "Nháp".** Phiếu chưa bán nằm lẫn với hoá đơn thật,
   cộng vào dòng "Tổng tiền" cuối bảng, làm số tổng trên màn hình không phải doanh số.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Thu ngân POS | Mở lại phiếu lưu tạm → gõ lại tiền khách đưa, bấm qua cảnh báo vượt tồn giả | Mở lại là dùng được ngay: tiền như lúc lưu, chỉ cảnh báo khi thật sự thiếu hàng |
| Quản lý cửa hàng | Đọc "DS hoá đơn" phải tự nhẩm trừ các dòng Nháp ra khỏi tổng | Bảng chỉ có hoá đơn thật; tổng cuối bảng là số đọc được |

## Success signal

Mở lại một hoá đơn lưu tạm có hàng còn tồn và bấm "Thu tiền" đi thẳng tới hoá đơn — không
phải gõ lại tiền, không gặp dialog cảnh báo tồn. "DS hoá đơn" cùng chi nhánh, cùng khoảng
ngày không còn dòng trạng thái "Nháp" nào, và "Tổng tiền" cuối bảng bằng tổng các dòng đang
hiển thị.

## Out of scope

- Giữ chỗ (reservation) tồn kho cho hoá đơn nháp — đã kiểm chứng backend không ghi sổ kho khi
  tạo nháp; đây là tính năng mới chứ không phải sửa lỗi.
- Khôi phục khuyến mại / điểm thưởng đã chọn trên phiếu lưu tạm — không nằm trong khiếu nại.
- Cảnh báo tồn ở các màn khác (dialog chọn biến thể, chuyển kho tạm) — chỉ chạm đúng đường
  khôi phục nháp.
- Đổi ngưỡng cảnh báo tồn (vẫn là `sellableQuantity`) và đổi cách hiển thị badge trạng thái.

## Constraints

| Kind | Detail |
| --- | --- |
| Contract | `POST /v2/invoices/search` hiện chỉ có một nơi dùng (`useInvoiceList` của pos-web); lọc ở server an toàn nhưng vẫn là đổi hành vi API |
| Schema | Lưu dòng thanh toán của phiếu nháp cần migration; `invoice_payments.account_id` đang NOT NULL và bảng đó chảy vào kế toán — không tái dùng bừa |
| Platform | UI tiếng Việt, mã/enum tiếng Anh; source backend không được có tiếng Việt |
| Compat | Phiếu nháp đã lưu trước thay đổi không có dòng thanh toán → đường khôi phục phải có nhánh dự phòng |

## Existing surface touched

- Reused: `PosDialog`, `PosDataTable`, `FilterBuilder`, `computeFirstLineAuto`, `syncPurchaseCartOnHand`
- Adjacent: `checkout-saga` (đọc nháp khi thanh toán qua `load-draft.step.ts`), dialog "HĐ lưu tạm"
- Entry points: không có route mới; đổi hành vi trên `/pos/` (checkout) và `/pos/invoices`
