---
id: UOW-04
slug: promotion-in-saga
title: Khuyến mại chạy trong chính transaction thanh toán, số tiền do máy chủ quyết
demoable: true
duration: 2d
depends_on: [UOW-03]
requirements: [US-04]
verifies: [AC-19, AC-20]
risk: medium
status: todo
rollback: trả `evaluate-promotion` về stub trả 0 là hết tác dụng; hai cột thêm vào `invoice_items` là nullable nên bỏ lại không ảnh hưởng dữ liệu cũ
---

# UOW-04 — Ghép khuyến mại

Engine khuyến mại đã xong ở feature `promotion-programs-engine` nhưng chưa ai gọi nó khi bán hàng —
`00-intent.md` của feature đó ghi rõ "Tích hợp POS checkout" là ngoài phạm vi, vì đụng
`checkout-invoice.service.ts` và vì `invoice_items` không có cột `isGift`/`promotionId`. Lát này làm
đúng phần còn thiếu đó, nhưng trên luồng mới nên không phải đụng file cũ.

Lát này cũng đóng giả định **A-20** của feature kia: hàng tặng nay bị trừ kho thật.

## Demo script

1. Tạo CTKM `ITEM_DISCOUNT` giảm 30% cho một SKU. Bán SKU đó qua `/v2`, và **cố tình gửi kèm một
   `discountAmount` bịa trong body** → chiết khấu ghi trên hóa đơn là số máy chủ tính, không phải số
   client gửi (AC-19).
2. Mở `invoice_checkout_promotions` → thấy snapshot đủ `programId`, `code`, `type`, `priority`,
   `discountAmount`, `lineDiscounts`.
3. Tạo CTKM `GIFT_ITEM` tặng hàng. Bán → hóa đơn có thêm dòng `is_gift = true` trỏ đúng
   `promotion_program_id`; `stock_ledger_entries` có dòng `SALE_ISSUE` cho hàng tặng; doanh thu **không**
   tăng vì dòng tặng (AC-20).
4. Dừng CTKM giữa chừng rồi checkout → đơn dùng bản đọc lúc preflight, và `skippedPrograms` giải thích
   vì sao (A-11).
5. Chạy lại toàn bộ spec cũ của `checkout-invoice.service` sau migration → vẫn xanh (A-12).

## In scope

- Migration hai cột `invoice_items.is_gift`, `invoice_items.promotion_program_id` và bảng snapshot
  `invoice_checkout_promotions`.
- Thay stub `evaluate-promotion` bằng `EvaluateCartQuery` qua `QueryBus` (ADR-06).
- Dòng hàng tặng trong `persist-invoice`, trừ kho hàng tặng trong `deduct-stock`, và
  `compute-totals` dùng chiết khấu máy chủ tính.

## Not in scope

- Voucher (UOW-05) — voucher không nằm trong `EvaluateCartResponse`, nó là hệ thống riêng.
- Sửa bảng `invoice_promotions` cũ hay `PromotionApplyService` — không đụng.
- Chọn quà kiểu `ONE_OF` do khách chọn tại quầy: lát này chỉ nhận `selectedProgramIds`; nếu engine trả
  `mode: ONE_OF` thì lấy ứng viên đầu và ghi lại hạn chế đó.

## Risks

| Risk | Mitigation |
|---|---|
| Thêm cột vào `invoice_items` — bảng luồng v1 đang dùng thật (A-12) | Cột nullable, có default, v1 không đọc không ghi. T-04-01 chạy lại toàn bộ spec cũ **trước khi** viết code v2 |
| CTKM đổi giữa preflight và COMMIT (A-11) | Chấp nhận có chủ ý, đã ghi ở ADR-06; `POST /v2/promotions/evaluate` vốn đọc như vậy |
| Dòng hàng tặng làm lệch doanh thu | AC-20 khẳng định bút toán doanh thu không đổi vì dòng tặng; giá bán dòng tặng bằng 0, giá vốn vẫn ghi qua ledger |
| Gọi engine bằng cách import `PromotionResolver` → phải sửa `promotion.module.ts` | ADR-06: đi qua `QueryBus`, handler đã đăng ký sẵn, bus là toàn app |

## Definition of done

- [x] AC-19, AC-20 pass (`checkout-saga-promotion.e2e-spec.ts`, T-04-07)
- [x] Số client gửi bị bỏ qua hoàn toàn — có test gửi số bịa để chứng minh (`discountAmount: 999999` bị whitelist chặn 400, T-04-07; DTO chưa từng khai trường đó, T-04-03)
- [x] Hàng tặng có dòng hóa đơn, có dòng ledger, không làm tăng doanh thu (T-04-04/T-04-05/T-04-07)
- [x] Spec cũ của `checkout-invoice.service` và `invoice-debt.service` vẫn xanh sau migration (A-12, T-04-01; tái xác nhận mỗi lần chạy toàn bộ suite 251/251 trong suốt UOW-04)
- [x] Không import `PromotionResolver`; không sửa `promotion.module.ts` (T-04-03)
- [ ] Demoed và accepted at gate G4

**Phát hiện ngoài kế hoạch, sửa trong UoW này:** A-31 — `InvoiceCheckoutPromotionEntity` chưa từng
đăng ký qua `TypeOrmModule.forFeature()` (kết luận sai của T-04-02), khiến mọi checkout thật có CTKM
áp dụng sẽ 500. Lộ ra và sửa ở T-04-07 khi chạy e2e thật lần đầu qua app boot đầy đủ.
