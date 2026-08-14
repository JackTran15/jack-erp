---
id: UOW-04
slug: pos-return-goods
title: POS Đổi trả hàng — footer tổng toàn tập + phân trang thật
demoable: true
duration: 1d
depends_on: [UOW-03]
requirements: [US-03, US-04]
verifies: [AC-07, AC-09, AC-10, AC-11, AC-12]
risk: high
status: todo
rollback: revert; pager quay lại trạng thái trang trí như cũ
---

# UOW-04 — POS Đổi trả hàng

Handler nhiều predicate cố định nhất, và là một trong hai chỗ đang ghim `limit:100` khiến dữ liệu
quá 100 dòng biến mất không dấu vết.

## Demo script
1. POS → Đổi trả hàng, chi nhánh HCM, đổi bộ lọc thời gian sang "Toàn bộ"
2. Footer = tổng toàn tập do server tính (24.888.000 trên `erp_dev` 14/08/2026 — chạy lại SQL đối
   chiếu trước khi demo, tập này tụt dần mỗi khi có phiếu trả mới)
3. Thanh phân trang đọc `total` thật của server; chọn được cỡ trang
4. Lọc cột "Tổng thanh toán" → lưới **và** footer đổi cùng nhau
5. `pnpm --filter @erp/api test -- search-returnable-invoices-v2`

## In scope
- `search-returnable-invoices-v2.handler.ts`: `buildQuery` mang **đủ** `type/status/isDraft/EXISTS`
- `use-return-goods.ts`: state trang + reset ở mọi setter (kể cả `setDateRange`)
- `ReturnGoodsPage.tsx` nối `onPageChange`/`onPageSizeChange`; `ReturnInvoiceTable` nhận `grandTotal`
- Xoá `sumInvoiceTotals` khi thành mồ côi

## Not in scope
- Ô lọc `inv.totalPaid` khác đại lượng với cột ở endpoint này (việc riêng)

## Risks
| Risk | Mitigation |
| --- | --- |
| Thiếu `EXISTS` ở nhánh totals ⇒ footer gồm cả đơn đã trả hết | Spec khẳng định từng predicate có mặt trên builder totals (AC-09) |
| Quên reset trang ở `setDateRange` (đang trả setter thô) | Ghi rõ trong ticket; AC-11 kiểm |

## Definition of done
- [x] AC-07, AC-09, AC-10, AC-11, AC-12 pass — verify S2–S4 (màn hình), `pos-pagesize1` S1–S4 (lật
      trang + về trang 1), `09-api-probe.md`, spec bất biến `limit`
- [x] Spec khẳng định đủ 4 predicate trên nhánh totals

Với cỡ trang thật (nhỏ nhất 50) và 5 đơn đủ điều kiện thì lưới vừa một trang, nên AC-11/AC-12 chụp
riêng bằng **bản vá tạm đặt cỡ trang = 1, đã revert**:
`.ai/features/footer-grand-totals-pos-pagesize1/` S1–S4. AC-12 còn được probe API xác nhận độc lập
(`09-api-probe.md`, 3 trang cùng `totals`). Sau khi revert đã chạy lại 7 bước code ship — vẫn xanh.
