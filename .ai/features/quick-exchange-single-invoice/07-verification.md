---
feature: quick-exchange-single-invoice
environments: [local-pos]
viewports: [desktop]
---

# Verification — Gộp hoá đơn đổi trả nhanh thành một chứng từ

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Trang đổi trả có nút "Đổi trả nhanh" | `/return-goods` | — | AC-04 | text=Đổi trả nhanh |
| S2 | Đổi trả nhanh mở màn thanh toán với hai giỏ "Trả hàng" / "Mua thêm" | `/return-goods` | `click text=Đổi trả nhanh; wait text=Trả hàng` | AC-01 | text=Trả hàng; text=Mua thêm |
| S3 | Đổi trả nhanh KHÔNG mời ghi công nợ | `/return-goods` | `click text=Đổi trả nhanh; wait text=Mua thêm` | AC-10 | no-text=Tính vào công nợ |
| S4 | Bán hàng thường VẪN có ô ghi công nợ | `/` | `click [aria-label="Thêm hóa đơn"]; wait text=Tổng tiền` | AC-10 | text=Tính vào công nợ; no-text=Mua thêm |
| S5 | Một giỏ mang hàng trả 750.000 và hàng mua thêm 720.000, net −30.000 | `/return-goods` | `click text=Đổi trả nhanh; wait input[placeholder*="F3"]; fill input[placeholder*="F3"] = ABA2777-D-38; wait text=Giày nam ABA2777-D-38; click text="Mua thêm"; fill input[placeholder*="F3"] = ABA2950-D-38; wait text=Giày nam ABA2950-D-38` | AC-01 | text=-30.000 |
| S6 | Chốt đơn đổi trả nhanh, giỏ được dọn | `/` | `click [aria-label="In hóa đơn"]; click [aria-label="Thanh toán"]; wait text=Cảnh báo xuất quá số lượng tồn; click text="Có"` | AC-01, AC-05 | text=Chưa có hàng nào |
| S7 | Danh sách hoá đơn hiện chứng từ mới với số tiền âm 30.000 | `/invoices` | `wait text=Tổng thanh toán` | AC-01 | text=-30.000 |

## Not verified here

- **AC-02 (net > 0), AC-03 (net = 0)** — S5–S7 mới chạy nhánh net < 0. Hai dấu còn lại chỉ
  cần đổi cặp SKU trong S5 (chọn hàng mua đắt hơn / bằng giá) và thêm bước nhập tiền cho
  net > 0. Tạm thời phủ bởi `checkout-return.service.spec.ts` (T-01-02).
- **AC-06** — không đụng `returned_quantity`. Không có mặt UI để chụp; kiểm bằng SQL sau khi
  chạy S6 (`original_invoice_item_id` của cả hai dòng đều NULL) và bởi T-01-02.
- **AC-11, AC-12** — nút Thanh toán khoá khi thu thiếu, và chọn quỹ hoàn ở "Hình thức đổi
  trả". Nay đã chạy được (giỏ dựng bằng `fill` mã SKU), chưa viết thành bước.
- **AC-07** — lỗi 400 ở tầng API, không có mặt UI. Phủ bởi `create-exchange-invoice.service.spec.ts` (T-01-01).
- **AC-08, AC-09** — không hồi quy `returned_quantity` và OFFSET công nợ. Phủ bởi
  `checkout-return.service.spec.ts` (T-01-02), khối "returned_quantity guard on invoice-backed returns".
- **AC-11** — nút Thanh toán khoá khi thu thiếu: cần giỏ hàng có tiền, cùng lý do như AC-02.
- **AC-12** — chọn quỹ hoàn ở "Hình thức đổi trả": chỉ hiện khi net < 0, cần giỏ hàng thật.
- **AC-13, AC-14** — đối chiếu hai đường in. Phủ bởi bảng đối chiếu tay của T-03-02; biên lai
  in ra một cửa sổ `iframe` rồi gọi `window.print()`, không chụp được bằng screenshot trang.

## Notes

Chỉ chạy trên `local-pos`. `local-backoffice` cấu hình sẵn nhưng feature này không đụng màn
backoffice nào — kiểm sổ quỹ / tồn kho nằm trong demo script chạy tay của UOW-01.

S3 và S4 là một cặp: cùng một component `PaymentSection`, một bên phải ẩn và một bên phải
hiện. Chạy riêng S3 mà không có S4 thì một lỗi làm ẩn ô ở **mọi** luồng vẫn cho màu xanh.

**Tồn kho không phải điều kiện tiên quyết.** Tồn 0 chỉ bật modal "Cảnh báo xuất quá số lượng
tồn", bấm "Có" là chốt được — nên S6 chạy được trên môi trường không có tồn showroom. Ghi
lại vì đây là chỗ dễ kết luận nhầm: dialog chọn biến thể hiển thị tồn **kho**, còn POS trừ
hàng từ **showroom** (`resolveBranchItemLocations`, `showroomOnly: true`), hai con số khác nhau.

**S5 cần `wait` sau mỗi `fill`.** Ô tìm kiếm auto-add theo debounce; không chờ dòng hàng hiện
ra trước khi bấm sang tab "Mua thêm" thì cả hai món cùng rơi vào giỏ mua. Assertion phải là
tổng net (`-30.000`), không phải sự hiện diện của hai mã SKU — assertion theo mã vẫn xanh
trong đúng tình huống hỏng đó.

Các bước dùng chung một phiên trình duyệt và **tab hoá đơn thì persist**: sau S3, tab đang
active là tab đổi trả nhanh do chính S3 tạo ra. Nên S4 phải bấm "Thêm hoá đơn" để mở một tab
BÁN mới thay vì chỉ điều hướng về `/` — lần chạy đầu S4 đỏ đúng vì lý do này, không phải vì
code sai. `no-text=Mua thêm` là chốt chặn: nó khẳng định tab đang xem thật sự là tab bán,
chứ không phải tab đổi trả còn sót lại.
