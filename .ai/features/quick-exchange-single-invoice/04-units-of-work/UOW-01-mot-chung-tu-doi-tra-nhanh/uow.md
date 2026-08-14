---
id: UOW-01
slug: mot-chung-tu-doi-tra-nhanh
title: Đổi trả nhanh có mua thêm ra một chứng từ EXCHANGE
demoable: true
duration: 1.5d
depends_on: []
requirements: [US-01, US-02]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09]
risk: medium
status: todo
rollback: Revert commit FE (`use-checkout-actions.ts`) là đủ — nhánh quick ở BE chỉ là nới lỏng validation, không client nào bị ép dùng
---

# UOW-01 — Đổi trả nhanh có mua thêm ra một chứng từ EXCHANGE

Lát cắt xương sống: backend học được "đổi hàng không cần hoá đơn gốc", POS bỏ nhánh
hai-chứng-từ, và luồng đổi trả theo hoá đơn được chứng minh không hồi quy.

## Demo script

1. POS → Đổi trả → bấm **"Đổi trả nhanh"**.
2. Tab "Trả hàng": thêm món A đơn giá 500.000₫, số lượng 1.
3. Tab "Mua thêm": thêm món B đơn giá 300.000₫, số lượng 1.
4. Ghi lại số dư quỹ tiền mặt chi nhánh (Backoffice → Sổ quỹ tiền mặt) và tồn kho showroom của A, B.
5. Bấm Thanh toán (F12), chọn hoàn tiền mặt 200.000₫.
6. Mở `/invoices`: **đúng một** dòng mới, mã `RTN-…`. Không có `INV-…` nào sinh ra.
7. Bấm vào mã đó: dòng món A có chip đỏ "Trả lại", dòng món B bình thường.
8. Sổ quỹ tiền mặt: giảm đúng 200.000₫ so với bước 4 — không phải tăng 300.000 rồi giảm 500.000.
9. Tồn kho showroom: A +1, B −1.
10. Lặp với B đắt hơn A (300k trả / 500k mua): thu 200.000₫, một chứng từ, quỹ **tăng** 200.000₫.
11. Lặp với A và B cùng giá: một chứng từ, quỹ không đổi.
12. Lặp chỉ trả A, không mua thêm: vẫn ra chứng từ `type=RETURN` như cũ.
13. **Không hồi quy:** làm một lượt đổi trả **theo hoá đơn** (trả 2/5 món + mua thêm) → `returned_quantity` của hoá đơn gốc tăng đúng 2; trả tiếp quá 5 bị chặn 409.

## In scope

- `originalInvoiceId` thành tuỳ chọn ở `POST /invoices/exchanges` + nhánh quick trong service
- Bỏ nhánh `QUICK_EXCHANGE` hai-chứng-từ ở `finalizeCheckoutAndPrint`
- Test chứng minh `CheckoutReturnService` đúng với `originalInvoice === null`
- Regenerate hợp đồng API

## Not in scope

- Ẩn checkbox công nợ (UOW-02)
- Biên lai in lại từ danh sách hoá đơn (UOW-03)
- Sửa bất cứ dòng nào của `checkout-return.service.ts` (ADR-04)

## Risks

| Risk | Mitigation |
|---|---|
| Hồi quy luồng đổi trả theo hoá đơn — hai variant giờ dùng chung code path, mà luồng cũ không có e2e phủ | Bước 13 của demo script là bắt buộc; T-01-02 khoá hành vi `returned_quantity` bằng unit test |
| `costPrice` dòng IN sai ⇒ COGS/lợi nhuận lệch âm thầm, không ai thấy cho tới báo cáo cuối tháng | T-01-01 dùng đúng `ItemCostSnapshotService` mà nhánh QUICK của return đang dùng, và có case assert `costPrice` |
| Panel thanh toán hoá ra có nhánh riêng cho `QUICK_EXCHANGE` mà đọc code chưa thấy (A-06) | Bước 10–11 của demo script chạm cả net>0 lẫn net=0; nếu panel sai thì lộ ngay |

## Definition of done

- [ ] AC-01 … AC-09 pass
- [ ] Demo script chạy hết 13 bước trên môi trường dev
- [ ] `pnpm --filter @erp/api test -- create-exchange-invoice checkout-return` xanh
- [ ] Không file nào trong `apps/api/src/database/migrations/` bị thêm hoặc sửa
- [ ] `openapi.snapshot.json` + `packages/api-client` đã regenerate và commit
- [ ] Không còn tham chiếu nào tới `buildQuickExchangeSalePayment` trong repo
- [ ] Demoed và accepted ở gate G4
