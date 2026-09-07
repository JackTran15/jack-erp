---
feature: temp-warehouse-fulfill-before-invoice
slug: 2026083001-temp-warehouse-fulfill-before-invoice
owner: Akenzy
created: 2026-08-30
status: draft
---

# Intent — Phiếu chuyển kho tạm phải ghi sổ TRƯỚC hoá đơn bán, để hoá đơn không còn hiện −1

## Problem

Khi bán một mặt hàng mà tồn showroom đang bằng 0 và hàng đang nằm ở **kho tạm**
(phiên `warehouse_to_showroom`), người dùng thấy dòng hoá đơn trên sổ kho hiện
**số lượng/số dư −1**. Phiếu chuyển kho tạm → showroom sinh ra sau đó thì đúng,
nhưng nó đứng **sau** hoá đơn trong sổ, nên đúng dòng hoá đơn vẫn âm.

Khảo sát mã nguồn ngày 2026-08-30 (nhánh `main`, commit `0a9d54bb`) cho thấy đây
là hệ quả trực tiếp của kiến trúc bù trừ **hai nhịp bất đối xứng**:

1. **Nhịp 1 — xuất bán, ghi sổ đồng bộ.** `DeductStockStep`
   (`apps/api/src/modules/pos/checkout-saga/application/steps/deduct-stock.step.ts:80-92`)
   gọi `stockLedgerService.recordBatchMovements(movements, manager)` **ngay trong
   transaction thanh toán**, ghi `SALE_ISSUE` số lượng âm tại showroom.
2. **Nhịp 2 — bù từ kho tạm, ghi sổ bất đồng bộ.** `EnqueueOutboxStep`
   (`enqueue-outbox.step.ts:106-140`) chỉ *xếp hàng* một dòng outbox
   `TEMP_WAREHOUSE_INVOICE_FULFILL`. Dòng này đi qua `OutboxRelayService` → Kafka →
   `TempWarehouseFulfillConsumer`
   (`modules/inventory/temp-warehouse/consumers/temp-warehouse-fulfill.consumer.ts:24`)
   → `TempWarehouseService.fulfillInvoiceFromTempWarehouse`
   (`temp-warehouse.service.ts:1413`) → `stockTransferService.createAndPost(...)`
   (`:1515`). Toàn bộ chặng này chạy **sau khi transaction thanh toán đã commit**.
3. **Sổ kho chỉ biết sắp xếp theo thời gian thực.** `StockLedgerEntryEntity`
   (`modules/inventory/ledger/stock-ledger-entry.entity.ts`) **không có cột thứ tự
   (sequence)** — mọi khung nhìn theo trình tự đều `orderBy('entry.postedAt')`
   (vd `stock-ledger.service.ts:740`). Mà `postedAt` bị **đóng cứng bằng
   `new Date()`** ngay tại thời điểm ghi, ở cả hai đường ghi:
   `recordMovement` (`stock-ledger.service.ts:206`) và `writeBatchMovements`
   (`:819`); `RecordMovementParams` (`:26`) **không hề nhận `postedAt`** từ caller.

Hệ quả: `postedAt` của `SALE_ISSUE` luôn **nhỏ hơn** `postedAt` của hai dòng
chuyển kho tạm, dù về nghiệp vụ hàng đã phải có mặt ở showroom trước khi bán được.
Không có cách nào sắp lại thứ tự ở tầng đọc, vì dữ liệu ghi xuống đã sai thứ tự.

Đây **không phải** lỗi của riêng một báo cáo: mọi khung nhìn đọc `stock_ledger_entries`
theo trình tự đều thừa hưởng cùng một thứ tự sai.

## Affected personas

| Persona | Hiện tại | Mong muốn |
|---|---|---|
| Thu ngân POS | Bán xong, mở lại phiếu thấy dòng hoá đơn âm −1, không biết mình làm sai hay hệ thống sai | Dòng hoá đơn hiện đúng số bán, số dư sau bán ≥ 0 |
| Kế toán kho | Đối chiếu sổ kho thấy số dư luỹ kế tụt âm rồi lại về 0, phải tự giải thích cho từng dòng | Số dư luỹ kế không bao giờ âm vì lý do thứ tự ghi sổ |
| Thủ kho | Không phân biệt được "âm do thứ tự ghi sổ" với "âm do thất thoát thật" | Mỗi lần thấy âm đều là tín hiệu thật, đáng đi tìm |

## Success signal

Trên môi trường local, bán một mặt hàng có **tồn showroom = 0** và đủ hàng trong
phiên kho tạm `warehouse_to_showroom`, sau khi consumer xử lý xong:

- Trong `stock_ledger_entries` của mặt hàng đó, hai dòng chuyển kho tạm
  (`-1` tại kho nguồn, `+1` tại showroom) có `posted_at` **nhỏ hơn hẳn**
  `posted_at` của dòng `SALE_ISSUE` cùng hoá đơn.
- Sắp mọi dòng của mặt hàng theo `posted_at` tăng dần rồi cộng dồn `quantity`:
  **không dòng nào có số dư luỹ kế < 0**.
- Chụp lại màn hình sổ kho / thẻ kho của chính mặt hàng đó: dòng hoá đơn **không
  còn hiện −1** (đây là bằng chứng G4, đo bằng ai-dlc-verify).

Đo bằng một kịch bản e2e cho luồng bù kho tạm, cộng một unit test khẳng định
`postedAt` truyền từ caller được tôn trọng thay vì bị `new Date()` ghi đè.

## Out of scope

- **Không** chuyển nhịp 2 thành đồng bộ trong transaction thanh toán. Đã cân nhắc
  và loại: một lỗi ở kho tạm sẽ làm hỏng cả lần bán tại quầy. Quyết định của
  Akenzy ngày 2026-08-30 là **giữ async, chỉ lùi `posted_at`**.
- **Không** thêm cột sequence vào `stock_ledger_entries`. Đó là thay đổi schema
  của một bảng append-only lớn, ảnh hưởng mọi báo cáo — nếu cần thì mở feature riêng.
- **Không** đụng luồng đổi/trả hàng (`checkout-return.service.ts`). Nhịp 2 ở đó đã
  được sửa trong feature `exchange-temp-warehouse-fulfill` và có bài toán riêng.
- **Không** sửa cảnh báo tồn trên POS (`pos-stock-warning-temp-warehouse`) — cảnh
  báo đó đọc tồn tại thời điểm bán, không đọc trình tự sổ.
- **Không** đảo thứ tự trên các phiếu chuyển kho tạm do người dùng bấm tay
  (`transferLines`) — chúng vốn đã đứng đúng chỗ trong sổ.

## Constraints

- `stock_ledger_entries` là sổ **append-only, bất biến sau khi ghi**
  (CLAUDE.md → Database rules). Không được UPDATE dòng đã ghi để sửa `posted_at`;
  giá trị phải đúng **ngay tại lần ghi đầu tiên**.
- `StockLedgerService.recordBatchMovements` là điểm ghi dùng chung của **toàn bộ**
  miền kho (nhập, xuất, kiểm kê, chuyển kho, bán hàng). Mọi thay đổi phải
  **tương thích ngược**: caller không truyền `postedAt` thì hành vi giữ nguyên
  `new Date()`.
- Consumer phải **idempotent**: `TempWarehouseFulfillConsumer` dedupe qua
  `processed_events` với `eventId` tất định
  (`deterministicCheckoutEventId`, `enqueue-outbox.step.ts:25`), và
  `fulfillInvoiceFromTempWarehouse` còn một chốt replay riêng (`:1427`).
  Mốc thời gian lùi phải **tất định** — hai lần chạy lại cùng event không được
  cho ra hai `posted_at` khác nhau.
- `posted_at` là **ngày ghi sổ**, không phải ngày chứng từ (xem
  `.ai/features/*/` và quy ước sẵn có của repo). Lùi mốc ở đây là để **sắp lại
  trình tự trong cùng một khoảnh khắc bán hàng**, không phải để đổi kỳ kế toán:
  mốc lùi phải nằm trong cùng ngày, cùng kỳ với hoá đơn.
- Backend NestJS source viết bằng **tiếng Anh**; chỉ chuỗi UI mới tiếng Việt.
