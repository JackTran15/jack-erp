---
feature: exchange-revenue-transfer-stock
slug: exchange-revenue-transfer-stock
owner: Akenzy
created: 2026-08-20
status: draft
---

# Intent — Đổi trả vào doanh số & Điều chuyển trừ kho xuất

Two QA defects reported together. They share no code, but both are "a number the
shop reads every day is wrong", and both are cheap to ship in one pass.

## Problem

**D1 — Hoá đơn đổi trả: phần mua thêm chưa cộng vào doanh số.**
On an EXCHANGE invoice the customer returns goods *and* buys more. The "mua thêm"
side is not visible in the sales figures the shop reads. Today an exchange
contributes `netAmount` (= newSubtotal − returnSubtotal) as a single netted number
(`report-core/report-query.util.ts:31`), so a 500k buy against a 500k return shows
as zero sales — the shop cannot tell "no business happened" from "an even swap
happened". Reported on three surfaces: POS › Báo cáo cuối ngày › Tổng hợp,
Doanh thu theo mặt hàng, and Backoffice › Kết quả kinh doanh.

**D2 — Điều chuyển kho: chưa trừ số lượng kho xuất.**
After a transfer, the sending warehouse's on-hand does not drop. Reported against
all three transfer flows (Chuyển kho cùng chi nhánh, Lệnh điều chuyển liên chi
nhánh, Điều chuyển từ cửa hàng khác) and observed on three read surfaces (Tổng hợp
tồn kho, Vị trí hàng hoá/chi tiết kệ, Báo cáo nhập xuất tồn). Stock that never
leaves the source is stock the shop will try to sell twice.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| Chủ cửa hàng / kế toán | Đọc doanh số cuối ngày, hoá đơn đổi trả hiện ra 0 hoặc số âm — không biết đã bán thêm bao nhiêu | Cột doanh số bán hiện đủ phần mua thêm; hàng trả nằm ở cột riêng, tổng vẫn net |
| Nhân viên kho | Chuyển hàng đi rồi nhưng tồn kho xuất vẫn nguyên → bán trùng, kiểm kê lệch | Kho xuất trừ đúng ngay khi phiếu được ghi sổ, thấy được ở cả 3 màn tồn kho |

## Success signal

Đối chiếu một kỳ có phát sinh đổi trả và điều chuyển:
1. **D1** — với mỗi hoá đơn EXCHANGE trong kỳ, `doanh số bán` của báo cáo tăng đúng
   `newSubtotal` và `hàng trả` tăng đúng `returnSubtotal`; tổng cuối vẫn bằng
   `netAmount` như hôm nay (không được đổi số tổng, chỉ tách được thành phần).
2. **D2** — với mỗi phiếu điều chuyển đã ghi sổ, `tồn kho xuất(sau) = tồn kho xuất(trước) − Σ số lượng`
   trên cả ba màn (Tổng hợp tồn kho, Vị trí hàng hoá, Báo cáo nhập xuất tồn), và
   Σ ledger toàn tổ chức của phiếu đó bằng 0.

## Out of scope

- Sửa số liệu lịch sử (backfill các hoá đơn/phiếu đã phát sinh) — chỉ sửa cách
  đọc/ghi từ nay; backfill là quyết định riêng của người dùng.
- Đổi công thức tổng doanh thu (net vẫn là net) — chỉ tách thành phần để nhìn thấy.
- Kho tạm / POS Chuyển kho nhanh — người dùng đã loại khỏi phạm vi khi chọn luồng.
- Hạch toán kế toán (bút toán GL) của đổi trả và điều chuyển — không đụng.

## Constraints

| Kind | Detail |
|---|---|
| Bất biến | Ledger là immutable sau khi ghi sổ; sai thì bù bằng bút toán đảo, không sửa dòng cũ |
| Bất biến | Σ quantity toàn tổ chức của một phiếu điều chuyển phải bằng 0 (mỗi chân OUT có chân IN đối ứng) |
| Dữ liệu | Dev DB không tái hiện được D2: chỉ có 1 lệnh điều chuyển (LDC000001) và nó trừ kho đúng — cần một ca tái hiện thật từ QA |
| Nền tảng | Không đổi `netAmount` trên bảng `invoices`; phần tách phải tính được từ dữ liệu đã có |
| Deadline | Chưa nêu |

## Existing surface touched

- **D1:** `modules/reporting/report-core/report-query.util.ts` (`signedGoods`,
  `invoiceTypeSign`), `modules/reporting/pos-daily-report/queries/get-pos-daily-summary.handler.ts`,
  `modules/reporting/profit-report/reports/business-results.report.ts`,
  `modules/reporting/invoice-report/revenue-by-item.aggregator.ts` (đã xử lý đúng
  theo `direction` — là mẫu để đối chiếu, có thể không phải sửa).
- **D2:** `modules/inventory/transfer/stock-transfer.service.ts` (`createAndPost`/`post`),
  `modules/inventory/transfer-order/transfer-order.service.ts`,
  `modules/inventory/goods-receipt/goods-receipt.service.ts` (purpose `TRANSFER_IN`),
  `modules/inventory/ledger/stock-summary.service.ts` + `stock-summary-detail.service.ts`.
- **Adjacent features:** `revenue-by-item-misa-parity` (đã chuẩn hoá cột/nhãn theo MISA),
  `goods-issue-source-warehouse`, `transfer-warehouse-fill` (EPIC-21062026).
- **Entry points:** không có route mới; chỉ sửa hành vi các màn đang có.

## What discovery already settled

Ghi lại để G2 không phải đào lại — và để không nhận nhầm là đã tìm ra nguyên nhân:

- `revenue-by-item.aggregator.ts:193` đã cộng/trừ theo `direction` của từng dòng
  (OUT cộng, IN trừ), khác hẳn `report-query.util.ts:31` vốn nét bằng `netAmount`.
  Hai cách nét cùng tồn tại trong repo — phải chốt một cách ở G2.
- `POST /inventory/stock/transfers` gọi `createAndPost`, có `validateOnHand`, và
  ghi `TRANSFER_OUT` âm tại kho nguồn. Luồng cùng chi nhánh **có** trừ kho.
- Trên erp_dev, cặp `TRANSFER_OUT/TRANSFER_IN` với `reference_type = TRANSFER`
  cân đúng 14/14 dòng, −33/+33. Ba dòng `TRANSFER_IN` lẻ (`reference_type =
  GOODS_RECEIPT`, +9) **không phải lỗi**: chân xuất của LDC000001 được ghi bằng
  `GOODS_ISSUE −9` ở chi nhánh nguồn, chỉ là khác movement type nên nhìn qua tưởng lệch.
- `goods-receipt.service.ts:1236` cố ý nới lỏng: phiếu nhập điều chuyển được ghi sổ
  **không cần** phiếu xuất đối ứng ("warn-but-allow"). Đây là chỗ duy nhất tìm được
  cho phép nhập mà không trừ kho xuất — ứng viên số một cho D2, chưa được xác nhận.
