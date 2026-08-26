---
id: UOW-02
slug: restore-return-draft
title: Mở lại phiếu nháp đổi/trả đúng thành tab đổi trả
demoable: true
duration: 1d
depends_on: []
requirements: [US-02]
verifies: [AC-06, AC-07, AC-08]
risk: medium
status: todo
rollback: revert 1 commit — chỉ code pos-web, không đụng API hay DB
---

# UOW-02 — Mở lại phiếu nháp đổi/trả đúng thành tab đổi trả

## Demo script

1. Tạo một phiếu nháp EXCHANGE còn dở: mở tab đổi trả nhanh, quét 1 dòng trả + 1 dòng mua
   có KM, bấm Thanh toán rồi ngắt mạng ở bước `checkout-return` (DevTools → Offline)
2. Bấm "HĐ lưu tạm" → phiếu vừa tạo có trong danh sách
3. Chọn phiếu → tab mới mở ra ở **chế độ đổi trả**: dòng trả nằm bên Trả hàng, dòng mua
   nằm bên Mua thêm, KM 30% hiển thị lại đúng
4. Bật mạng lại, bấm Thanh toán → hoá đơn phát hành qua `checkout-return`
5. Mở lại "HĐ lưu tạm" → phiếu nháp nguồn đã biến mất

## In scope

- `mapInvoiceRowToDraftInvoice` chuyển tiếp `direction` từng dòng + `type` của phiếu
- `openDraftInNewSession` dựng tab theo `checkoutVariant` suy từ `type`
- Xoá phiếu nháp nguồn sau khi tất toán lại thành công (ADR-03)

## Not in scope

- Tái sử dụng chính phiếu nháp cũ làm chứng từ phát hành (cần endpoint sửa phiếu đổi — epic sau)
- Thay đổi dialog "HĐ lưu tạm" về mặt hiển thị/lọc

## Risks

| Risk | Mitigation |
| --- | --- |
| `DELETE /invoices/:id` lỗi sau khi đã phát hành hoá đơn thật | Chỉ log, không chặn; hậu quả xấu nhất là một phiếu nháp thừa (ADR-03) |
| Draft cũ trong localStorage không có `checkoutVariant` | `coerceCheckoutVariant` giữ nguyên fallback SALE cho snapshot cũ; chỉ nhánh phiếu từ server mới đọc `type` |

## Definition of done

- [x] AC-06..AC-08 pass
- [x] `npx vitest run` trong `apps/pos-web` xanh
- [x] Không dựng trang/route mới — chỉ sửa mapper + store hiện có
- [x] Demo ở trên chạy được trên máy dev
