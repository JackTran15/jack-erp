---
feature: exchange-temp-warehouse-fulfill
slug: exchange-temp-warehouse-fulfill
owner: Akenzy
created: 2026-08-19
status: draft
---

# Intent — Hóa đơn đổi trả phải tiêu thụ kho tạm như hóa đơn bán

Nguồn: báo lỗi production ngày 2026-08-19, chi nhánh MT 211 Lê Duẩn, SKU `YMT25017-D-38`,
hóa đơn đổi trả `2608192351` (14:13) và dòng kho tạm lúc 14:11 (kệ T32.05, người vận chuyển
Mai Thị Hiền). Nguyên văn: *"Không trừ kho tạm, mà âm showroom."*

## Problem

Một lượt bán hàng lấy từ kho đi qua **hai nhịp**:

1. `STOCK_DEDUCTION` trừ hàng khỏi **showroom** — showroom tụt xuống âm trong khoảnh khắc.
2. `TEMP_WAREHOUSE_INVOICE_FULFILL` → `TempWarehouseService.fulfillInvoiceFromTempWarehouse`
   khớp dòng kho tạm `warehouse_to_showroom` đang ACTIVE theo FIFO, phát một phiếu chuyển
   Kho → Showroom, và đánh dấu dòng đó `TRANSFERRED` kèm `invoiceId`.

Kết quả đúng: Kho −1, Showroom 0.

**Hóa đơn đổi trả chỉ chạy nhịp 1.** `CheckoutReturnService.fanOutEvents`
(`apps/api/src/modules/pos/services/checkout-return.service.ts:946`) phát đúng ba sự kiện —
`STOCK_RETURN_IN` (`:974`), `STOCK_DEDUCTION` (`:989`), `JOURNAL_POST_RETURN` (`:1014`) —
và **không hề** phát `TEMP_WAREHOUSE_INVOICE_FULFILL`. Sự kiện này chỉ được phát ở đúng hai
chỗ, cả hai đều là đường bán thường: `checkout-invoice.service.ts:363` (v1) và
`checkout-saga/application/steps/enqueue-outbox.step.ts:130` (v2).

Chân "Mua thêm" của đơn đổi trả **cố ý** trừ vào showroom —
`create-exchange-invoice.service.ts:209-227` gọi `resolveBranchItemLocations(..., { showroomOnly: true })`
để nó hành xử y hệt mọi đường bán khác. Nửa đó đúng; thiếu là nửa đối ứng.

Số liệu production khớp chính xác giả thuyết này:

| SKU | Kho 211DN | Showroom 211DN |
|---|---|---|
| YMT25017-D-38 | nhập 2, tồn **2** (dòng kho tạm chưa bao giờ được vật chất hóa) | nhập **0**, tồn **−1** (trừ mà không có bù) |
| YMT25017-D-39 | tồn 2 | nhập 2, tồn 1 (`STOCK_RETURN_IN` chạy bình thường) |

Bằng chứng độc lập từ màn hình Chuyển kho tạm: ô "Hiển thị dòng cần kiểm tra" đang tích —
tức đang **ẩn** các dòng đã bị hóa đơn tiêu thụ (`lineMatchesTableFilters` → `isLineSaleTransferred`,
`apps/pos-web/src/lib/page-libs/fast-stock-transfer/temp-warehouse-mappers.ts:66`) — vậy mà
dòng D-38 lúc 14:11 vẫn hiện với ô "Chuyển kho" trống. Nó không mang `invoiceId`, trạng thái
vẫn `ACTIVE`. Hóa đơn đổi trả chắc chắn chưa hề đụng tới nó.

Hệ quả nghiệp vụ:

- Báo cáo Tổng hợp tồn kho hiện tồn **âm** ở showroom cho tới khi nhân viên tự xử lý phiên kho tạm.
- Dòng kho tạm không bao giờ mang `invoiceId`, nên báo cáo `inventory-temp-warehouse-out`
  không đếm nó là "Bán hàng kho tạm" (xem `temp-warehouse-sale-status`) — lượt bán biến mất
  khỏi báo cáo xuất kho tạm.
- Nhân viên kho thấy dòng "cần kiểm tra" giả: hàng đã bán rồi mà vẫn nằm chờ xử lý.

## Affected personas

| Persona | Hành vi hiện tại | Hành vi mong muốn |
|---|---|---|
| Thu ngân POS | Bấm đổi trả có "Mua thêm" → showroom âm, không biết vì sao | Đổi trả trừ kho tạm y như bán thường, tồn không âm |
| Nhân viên kho | Dòng kho tạm đã bán vẫn hiện trong "dòng cần kiểm tra" | Dòng đó hiện số hóa đơn đổi trả, biến khỏi danh sách cần kiểm tra |
| Kế toán kho | Báo cáo xuất kho tạm thiếu các lượt bán qua đơn đổi trả | Báo cáo đếm đủ cả hai luồng bán |

## Success signal

Một đơn đổi trả có chân "Mua thêm" trên SKU đang có dòng kho tạm ACTIVE làm dòng đó chuyển
`TRANSFERRED` kèm `invoiceId`/`invoiceNumber` của chính đơn đó, phát một phiếu chuyển
Kho → Showroom, và tồn showroom của SKU **không âm** sau khi hoàn tất — đo bằng chính kịch bản
đã gây lỗi (đổi trả 1 SKU đã stage sẵn ở kho tạm).

## Out of scope

- **Vá dữ liệu quá khứ.** Dòng kho tạm cũ vẫn `ACTIVE`, nên khi nhân viên xử lý phiên kho tạm
  bình thường thì tồn âm tự lành (Kho 2→1, Showroom −1→0); chỉ mất liên kết hóa đơn và nhãn
  báo cáo. Dựng lại FIFO ở một thời điểm quá khứ là phỏng đoán và có thể chuyển kho hai lần.
  Quyết định của chủ sở hữu, 2026-08-19.
- **Chân trả về (IN lines).** Hàng khách trả được ghi có vào showroom — đúng chỗ hàng thật sự
  quay về. Không có khái niệm "stage" cho chiều nhập, nên không phát gì cho kho tạm.
- **Hủy/void đơn đổi trả.** `cancel-return.service.ts` không đảo `TEMP_WAREHOUSE_INVOICE_FULFILL`,
  nhưng `cancel-invoice.service.ts` (hủy đơn bán thường) cũng không — không file nào trong hai
  file đó nhắc tới kho tạm. Giữ nguyên tương đương với đường bán; sửa lệch đó là việc khác.
- **Đường bán thường.** v1 và v2 đều đã phát sự kiện này, không đụng vào.
- **Chiều showroom → kho.** Ngoài phạm vi lỗi được báo.

## Constraints

| Kind | Detail |
|---|---|
| Nghiệp vụ | Không được chuyển kho hai lần: một dòng đã `TRANSFERRED` không bao giờ được tiêu thụ lại |
| Kiến trúc | Fan-out của đổi trả chạy **sau commit** bằng publisher trực tiếp (`checkout-return.service.ts:519`), không phải outbox — khác đường bán v2, giống đường bán v1 |
| Idempotency | `eventId` = `invoiceId` (xem `TempWarehouseFulfillPublisher`); id hóa đơn đổi trả là UUID riêng nên `processed_events` không đụng id hóa đơn bán |
| Ngôn ngữ | Mã nguồn backend viết tiếng Anh; chỉ chuỗi UI mới tiếng Việt |

## Existing surface touched

- Tái sử dụng: `TempWarehouseFulfillPublisher` (`modules/inventory/publishers/`), đã được
  `StockLedgerModule` export và `PosModule` dùng sẵn cho `CheckoutInvoiceService`.
- Tiêu thụ phía sau: `TempWarehouseFulfillConsumer` → `fulfillInvoiceFromTempWarehouse`
  (`temp-warehouse.service.ts:1260`) — **không sửa gì ở đây**.
- Feature liền kề: `temp-warehouse-sale-status` (nhãn báo cáo cho dòng có `invoice_id`) —
  hưởng lợi trực tiếp, không phụ thuộc.
- Entry point: không có route mới; chỉ thêm một lượt phát sự kiện trong fan-out sẵn có.
