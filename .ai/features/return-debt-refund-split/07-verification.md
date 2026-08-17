---
feature: return-debt-refund-split
environments: [local-pos]
viewports: [desktop]
---

# Verification — Trả hàng trên hoá đơn còn nợ

Dữ liệu thật trên `erp_dev`, không dựng fixture riêng:

- `INV-202608-00005` — bán chịu một phần: phải thu 5.460.000, đã thu 3.822.000, **dư nợ
  1.638.000**. Đúng hình dạng ca QA (`INV-202608-00022`), chỉ khác con số.
- `INV-202608-00013` — thu đủ 750.000, không có dòng công nợ.

Trả toàn bộ `INV-202608-00005` phải tách thành **1.638.000 trừ công nợ + 3.822.000 chi trả
khách**. Chính hai con số đó là thứ các bước dưới đây khẳng định — không phải "trang có mở
được không".

## Steps

Bộ lọc ngày của trang mặc định là **Hôm nay**, còn hai hoá đơn fixture nằm ở 12/08 và 15/08 —
nên mỗi bước tự mở lại "Toàn bộ" thay vì dựa vào trạng thái bước trước. Dài hơn một chút,
đổi lại một bước đỏ không kéo theo các bước sau đỏ vì lý do không liên quan.

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Trang Đổi trả hàng liệt kê hoá đơn bán chịu còn nợ | `/return-goods` | `click button:has-text("Hôm nay"); click [role="option"]:has-text("Toàn bộ"); click button:has-text("Áp dụng")` | AC-14 | text=INV-202608-00005 |
| S2 | Hộp chọn hàng trả của hoá đơn còn nợ mở đúng | `/return-goods` | `click button:has-text("Hôm nay"); click [role="option"]:has-text("Toàn bộ"); click button:has-text("Áp dụng"); click tr:has-text("INV-202608-00005") button:has-text("Đổi trả")` | AC-14 | text=SL trả |
| S3 | Màn hình thanh toán tách 1.638.000 công nợ / 3.822.000 tiền chi | `/return-goods` | `click button:has-text("Hôm nay"); click [role="option"]:has-text("Toàn bộ"); click button:has-text("Áp dụng"); click tr:has-text("INV-202608-00005") button:has-text("Đổi trả"); click label:has(input[aria-label="Chọn tất cả hàng trả"]); click button:has-text("Đồng ý")` | AC-14, AC-15 | text=Trừ công nợ; text=1.638.000; text=3.822.000; no-text=Tính vào công nợ |
| S4 | Hoá đơn đã thu đủ không hiện dòng trừ công nợ | `/return-goods` | `click button:has-text("Hôm nay"); click [role="option"]:has-text("Toàn bộ"); click button:has-text("Áp dụng"); click tr:has-text("INV-202608-00013") button:has-text("Đổi trả"); click label:has(input[aria-label="Chọn tất cả hàng trả"]); click button:has-text("Đồng ý")` | AC-15, AC-16 | no-text=Trừ công nợ; no-text=Tính vào công nợ |

## Not verified here

- **AC-01..AC-13, AC-17, AC-18** — số tiền, công nợ và bút toán không có bề mặt UI nào chụp
  được. Phủ bằng 68 test đơn vị ở `checkout-return.service.spec.ts` (gồm property test 200
  mẫu), 16 test ở `journal-return.consumer.spec.ts`, 31 test ở `cancel-return.service.spec.ts`,
  và một lần chạy thật qua API ngày 16/08/2026: `RTN-202608-00001` cấn trừ 1.638.000, phiếu chi
  `PC000051` = 3.822.000, hai bút toán `JNL-19 RETURN` + `JNL-20 CASH_MOVEMENT` không trùng
  chân; huỷ phiếu mở lại nợ 1.638.000 và thu về `PT000046` = 3.822.000.
- **Vế thứ hai của AC-16** — ô "Tính vào công nợ" của đơn ĐỔI `netAmount > 0` phải còn nguyên.
  Đây là ô `DebtCheckRow` (cờ `debt`), khác hẳn ô đã gỡ (`refundToDebt`), và nằm ở nhánh render
  đối lập trong `PaymentSection`. Phủ bằng `checkoutValidation.test.ts` +
  `returnInvoicePayloadMapper.test.ts`; dựng được nó qua UI đòi một giỏ đổi hàng lệch giá
  dương, dài hơn ba thao tác nên tách khỏi bộ bước này.

## Notes

Mỗi lần bấm "Đồng ý" ở hộp chọn hàng trả sinh một **phiên checkout mới**
(`enterInvoiceReturnWithLines`), nên S4 không kế thừa giỏ của S3 — hai bước độc lập dù dùng
chung browser context.

S3 và S4 cố ý đi lại từ `/return-goods` thay vì nối tiếp trạng thái của bước trước: một bước
phải tự dựng được cảnh của nó, nếu không thì đỏ ở S2 sẽ làm S3 đỏ theo vì lý do không liên quan.
