---
id: UOW-03
slug: in-lai-bien-lai
title: In lại biên lai đổi trả từ danh sách hoá đơn đúng dấu
demoable: true
duration: 0.5d
depends_on: [UOW-01]
requirements: [US-04]
verifies: [AC-13, AC-14]
risk: low
status: todo
rollback: Revert một commit FE; biên lai in lại quay về hình dạng sai như hôm nay
---

# UOW-03 — In lại biên lai đổi trả đúng dấu

Đây là lỗ hổng **đã có sẵn** với đơn EXCHANGE theo hoá đơn: `invoiceRowPrintPayload.ts`
dựng payload in mà không đọc `item.direction`, nên biên lai in lại từ `/invoices` khác hẳn
biên lai in lúc thanh toán — số lượng dương, thành tiền dương, khối "Tiền hàng trả lại"
biến mất, "Tổng thanh toán" lấy từ `amountDue` mà BE đã clamp về 0 với đơn trả thuần.

Trước UOW-01, đổi trả nhanh không lộ lỗi này vì chân "mua thêm" là một hoá đơn SALE bình
thường. Sau UOW-01 thì lộ. Đó là lý do lát cắt này nằm trong epic thay vì là việc riêng.

**Có thể cắt bỏ** nếu muốn thu hẹp phạm vi — UOW-01 và UOW-02 vẫn đứng độc lập.

## Demo script

1. Chạy lại bước 1–5 của demo script UOW-01 (trả A 500.000₫, mua B 300.000₫, hoàn 200.000₫).
   **Giữ lại tờ biên lai in ra lúc thanh toán.**
2. Mở `/invoices`, bấm vào mã `RTN-…` vừa tạo.
3. Bấm **In**.
4. So hai tờ: dòng món A phải mang số lượng âm và thành tiền âm ở cả hai; khối
   "Tiền hàng trả lại / Giá trị trả lại" phải có ở cả hai; "Tổng thanh toán" phải bằng nhau
   và bằng −200.000₫.
5. **Không hồi quy:** mở một hoá đơn `type=SALE` bất kỳ, in lại → mọi con số giống hệt trước
   thay đổi này (chụp màn hình trước khi sửa để so).
6. Mở một hoá đơn `RETURN` trả thuần (không mua thêm), in lại → "Tổng thanh toán" là số âm
   đúng bằng tiền hoàn, không phải 0.

## In scope

- `invoiceRowPrintPayload.ts`: ký dấu theo `direction`, `subtotal` chỉ tính dòng OUT,
  nạp khối `returnGross`/`returnDiscount`/`returnNet`, `grandTotal` lấy từ `getInvoiceSignedTotal`

## Not in scope

- `renderInvoiceHtml.ts` — nó in đúng những gì payload đưa, không cần biết `direction`
- `InvoiceReceiptDialog.tsx` — đã đúng sẵn (nó đọc `it.direction`)
- Backoffice → chi tiết hoá đơn (`get-invoice-detail.handler.ts` không project `direction`)
  — cũng sai sẵn, nhưng thuộc màn hình khác và không phải biên lai giao cho khách

## Risks

| Risk | Mitigation |
|---|---|
| Sửa nhầm làm hỏng biên lai in lại của hoá đơn bán — đường in dùng nhiều nhất | Bước 5 của demo script; mọi thay đổi đều nằm sau một nhánh theo `direction`, dòng OUT đi đúng đường cũ |
| Không có test tự động nào bắt được hồi quy (A-03) | T-03-02 là đối chiếu tay có ghi lại số liệu, không phải "nhìn qua thấy ổn" |

## Definition of done

- [ ] AC-13, AC-14 pass
- [ ] Demo script chạy hết 6 bước, có chụp cả hai tờ biên lai để đối chiếu
- [ ] Bảng đối chiếu số liệu của T-03-02 được đính vào PR
- [ ] `pnpm --filter @erp/pos-web build` xanh
- [ ] Demoed và accepted ở gate G4
