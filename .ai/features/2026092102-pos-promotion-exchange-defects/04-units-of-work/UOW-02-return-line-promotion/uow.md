---
id: UOW-02
slug: return-line-promotion
title: Dòng trả theo hóa đơn hiện CTKM của hóa đơn gốc và Thành tiền / Tổng tiền âm sau KM
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-05, AC-06, AC-07, AC-08, AC-09]
risk: medium
status: todo
rollback: revert 2 commit (API eligible-returns, POS); `promotions[]` là field thêm, client cũ bỏ qua; không ghi dữ liệu
---

# UOW-02 — Dòng trả hiện CTKM và số âm

## Demo script
1. POS tab bán: quét `SKU-685` (CTKM-A 10% tự áp → 68.500), *Thu tiền* tiền mặt → hóa đơn S.
2. Menu *Đổi trả hàng* → chọn S → hộp thoại trả hàng → tick SKU-685, SL 1 → *Đồng ý* → tab *Hóa đơn 2* mở với dòng trả.
3. Dòng trả: nền hồng, SL `-1`, dưới tên có nhãn đỏ nghiêng `CTKM-A … (68.500)`, cột *Thành tiền* in ~~-685.000~~ **-616.500** (ảnh 3 hôm nay in **0**, không nhãn).
4. Panel phải: *Tổng tiền* **-616.500** (hôm nay **0**), *Trả lại khách* **616.500**, ô *Tiền mặt* 616.500 — hai số sau y hệt hôm nay.
5. Tăng SL trả lên 2 (nếu S bán 2) → nhãn `(137.000)`, *Thành tiền* ~~-1.370.000~~ **-1.233.000**.
6. Đổi trả nhanh (không HĐ gốc) 1 × SKU-100 → không nhãn, *Thành tiền* **-100.000** một dòng.
7. `curl GET /invoices/S/eligible-returns` → dòng SKU-685 có `promotions: [{ name: "CTKM-A …", type: "ITEM_DISCOUNT", unitDiscount: 68500 }]`.

## In scope
- `EligibleLine.promotions[]` từ snapshot HĐ gốc.
- POS: `ReturnableItem.promotions` → `CartLine.returnPromotions` → nhãn trên dòng trả.
- Bỏ kẹp `Math.max(0, …)` cho dòng trả và cho *Tổng tiền* (ADR-04).

## Not in scope
- Nhãn CTKM cho dòng trả trên bản in (A-04).
- Hộp thoại trả hàng (`ReturnItemsDialog`) hiện cột CTKM — chỉ tab checkout.
- Thay đổi `refundableUnitPrice` hay bất kỳ số tiền nào.

## Risks
| Risk | Mitigation |
| --- | --- |
| Bỏ kẹp làm dòng **bán** có CTKM > tiền dòng in âm | Kẹp giữ nguyên cho dòng bán, chỉ dòng trả không kẹp (ADR-04); engine cũng cap theo tiền dòng |
| `line_discounts[].lineId` của snapshot khớp `invoice_items.id` — HĐ EXCHANGE làm HĐ gốc có dòng IN lẫn OUT | `getEligibleLines` chỉ gắn cho dòng OUT (đã lọc), lineId dòng IN không bao giờ có trong snapshot |
| Draft đổi trả cũ trong localStorage không có `returnPromotions` | Field optional; không nhãn, không lỗi |

## Definition of done
- [x] AC-05/06: `return-eligibility.service.spec` 17/17 + e2e `eligible-returns-promotions` 3/3; AC-07/08/09 `evidence/R-01..R-03` + 11 assert DOM (`capture-uow02.py`)
- [x] *Trả lại khách* / ô Tiền mặt không đổi: chạy cùng kịch bản trên base commit (git stash) và sau feature — trả theo HĐ có CTKM-A: 616.500 / 0 ở cả hai; trả nhanh 1 × SKU-100: 100.000 (chỉ *Thành tiền*/*Tổng tiền* đổi từ 0 → số âm — đúng mục tiêu ADR-04); `deriveSettlement` không bị đụng
- [x] `tsc --noEmit` api + pos-web xanh
- [x] Không file nào ngoài `touches:` của T-02-01..T-02-03 bị đụng (scope 0 drift; `checkout-return.service.spec.ts` thêm vào touches T-02-01 qua reopen G3)
- [ ] Demo script chạy trước Akenzy
