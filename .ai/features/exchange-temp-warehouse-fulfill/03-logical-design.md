---
feature: exchange-temp-warehouse-fulfill
adr_count: 3
---

# Logical design — exchange-temp-warehouse-fulfill

## Approach

Thêm đúng một lượt phát sự kiện vào fan-out sẵn có của `CheckoutReturnService`. Khối
`STOCK_DEDUCTION` cho các dòng OUT (`checkout-return.service.ts:986-999`) đã có sẵn guard
`outLines.length > 0` và đã gộp đúng tập dòng cần quan tâm; ngay sau nó, gộp lại `outLines`
theo `itemId` và gọi `TempWarehouseFulfillPublisher.publish(...)` với đúng hình dạng payload
mà `CheckoutInvoiceService` đang dùng (`checkout-invoice.service.ts:355-377`).

Không có gì khác phải sửa. Consumer, service kho tạm, materializer, phía FE — tất cả đã xử lý
đúng khi sự kiện tới; chúng chưa bao giờ nhận được sự kiện, đó mới là lỗi. `fulfillInvoiceFromTempWarehouse`
đọc đúng `{itemId, quantity}` + `branchId` + `invoiceId/invoiceNumber` và không hề phân biệt
loại hóa đơn (A-05), nên nó phục vụ đơn đổi trả không cần sửa một dòng nào.

Phía dữ liệu, `direction` chứ không phải dấu của `quantity` mới là thứ phân biệt hai chân
(A-06), nên `Number(it.quantity)` luôn dương và đi thẳng vào payload.

## Alternatives rejected

| Option | Why not |
|---|---|
| Đưa lượt phát vào trong transaction qua outbox, như saga v2 | Fan-out của đổi trả là publisher trực tiếp sau commit cho **cả** `STOCK_DEDUCTION` lẫn `STOCK_RETURN_IN`. Chuyển riêng một sự kiện sang outbox tạo hai cơ chế giao trong cùng một hàm mà không giảm được rủi ro mất sự kiện của hai cái kia. Chuyển cả cụm sang outbox là một feature riêng. |
| Đưa việc phát vào `StockDeductionPublisher` để mọi đường trừ kho tự động kèm | `StockDeductionPublisher` còn phục vụ các đường không phải bán (kiểm kê, điều chỉnh). Ghép hai nghiệp vụ vào một publisher biến một sửa lỗi 15 dòng thành thay đổi hành vi toàn hệ thống. |
| Sửa `fulfillInvoiceFromTempWarehouse` để nó tự quét hóa đơn đổi trả | Đảo ngược hướng phụ thuộc: module kho tạm sẽ phải biết về lược đồ hóa đơn POS. Cơ chế đẩy hiện tại đã đúng. |
| Trừ thẳng kho tạm đồng bộ trong transaction của đổi trả | Phá tương đương với đường bán, và `createAndPost` của phiếu chuyển mở transaction riêng — lồng vào sẽ khóa chéo. |
| Tính gộp theo net (OUT trừ IN) mỗi mặt hàng | Thêm một luật không nơi nào khác trong repo áp dụng, và làm đổi trả lệch khỏi đường bán. Chủ sở hữu chọn gross (A-01). |

## Domain model

Không có thực thể mới. Các bản ghi liên quan:

| Entity | Vai trò trong luồng này | Notes |
|---|---|---|
| `InvoiceItemEntity` | Nguồn của payload: lọc `direction = OUT`, gộp `quantity` theo `itemId` | `quantity` dương; `locationId` đã được ép về showroom từ lúc dựng nháp |
| `TempWarehouseLineEntity` | Đích bị tiêu thụ: `ACTIVE` → `TRANSFERRED` kèm `invoiceId`, `invoiceNumber`, `transferId` | Tiêu thụ một phần sinh dòng dư mới qua `supersededById` |
| `TempWarehouseSessionEntity` | Phiên `warehouse_to_showroom` ACTIVE của chi nhánh | Không có phiên → consumer no-op |

## Contracts

### Sự kiện `erp.temp-warehouse.invoice-fulfill`

Không đổi. Đơn đổi trả phát đúng payload mà đơn bán đang phát:

```json
{
  "organizationId": "...",
  "branchId": "...",
  "invoiceId": "<id hóa đơn đổi trả>",
  "invoiceNumber": "<mã hóa đơn đổi trả>",
  "actor": { "userId": "...", "organizationId": "...", "branchId": "...", "roles": [] },
  "lines": [{ "itemId": "...", "quantity": 1 }]
}
```

- `eventId` = `invoiceId` (do `TempWarehouseFulfillPublisher` đặt). Hóa đơn đổi trả là bản ghi
  `invoices` riêng với UUID riêng nên không đụng `processed_events` của hóa đơn bán gốc (A-04).
- `lines[].quantity` luôn > 0.
- Không có endpoint HTTP nào thay đổi; không cần chạy lại `pnpm openapi:generate`.

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| Trạng thái dòng kho tạm | `TempWarehouseService` | Tới khi phiên đóng |
| Phiếu chuyển Kho→Showroom | `StockTransferService.createAndPost` | Vĩnh viễn, bất biến sau khi ghi sổ |
| Dedupe sự kiện | bảng `processed_events` (do `EventConsumerManager` quản) | Vĩnh viễn |

## Error taxonomy

| Condition | Hành vi | Vì sao chấp nhận được |
|---|---|---|
| Chi nhánh không có phiên kho tạm ACTIVE | `fulfillInvoiceFromTempWarehouse` return sớm, no-op | Đúng như đường bán; đây là trường hợp phổ biến nhất |
| Không có dòng ACTIVE khớp SKU | `plan.length === 0` → return, không lập phiếu chuyển | Hàng bán trực tiếp từ showroom, không đi qua kho tạm |
| Số lượng bán > số lượng đang chờ | Tiêu thụ tối đa phần đang chờ; phần dư vẫn là tồn âm showroom | Hành vi sẵn có của đường bán; không mở rộng ở feature này |
| Sự kiện được giao lại | `processed_events` chặn; thêm guard phòng thủ theo `invoiceId` trong service | Không bao giờ có phiếu chuyển thứ hai (AC-07) |
| Publish lỗi sau khi hóa đơn đã commit | Hóa đơn vẫn đứng; sự kiện mất | Đúng bằng rủi ro sẵn có của `STOCK_DEDUCTION` trên cùng đường (A-08) |
| Consumer ném lỗi | Retry rồi vào DLQ do `EventConsumerManager` | Hạ tầng sẵn có, không thêm gì |

## Observability

- Sự kiện phát ra ghi log ở `TempWarehouseFulfillPublisher.publish` (`Published temp-warehouse fulfill event for invoice ... (N line(s))`).
- Tiêu thụ thành công ghi log ở `fulfillInvoiceFromTempWarehouse` (`Invoice ... fulfilled from temp warehouse: transfer ..., N line(s) consumed`).
- Dấu hiệu quan sát được rằng lỗi đã hết: dòng kho tạm mang `invoice_id` của một hóa đơn loại
  `EXCHANGE`, thứ chưa từng tồn tại trước feature này.

## ADRs

### ADR-01 — Đổi trả phát sự kiện tiêu thụ kho tạm, chỉ cho các dòng OUT
**Context:** Chân "Mua thêm" của đơn đổi trả trừ showroom giống hệt một lượt bán nhưng không
có nhịp bù từ kho tạm, làm tồn showroom âm.
**Decision:** Phát `TEMP_WAREHOUSE_INVOICE_FULFILL` từ `CheckoutReturnService.fanOutEvents`,
gộp theo `itemId` **chỉ trên các dòng `direction = OUT`**, dùng đúng `TempWarehouseFulfillPublisher`
và đúng hình dạng payload của đường bán v1.
**Consequences:** Một đơn đổi trả cùng SKU cả hai chiều có thể tiêu thụ một dòng kho tạm dù
tồn showroom net bằng không — chấp nhận, đổi lại là một hình dạng mã duy nhất giữa bán và đổi trả.
**Status:** accepted

### ADR-02 — Không vá dữ liệu quá khứ
**Context:** Các đơn đổi trả đã lập để lại dòng kho tạm ACTIVE và tồn showroom âm.
**Decision:** Chỉ sửa xuôi. Tồn âm cũ tự lành khi nhân viên xử lý phiên kho tạm bình thường;
liên kết hóa đơn và nhãn báo cáo của quá khứ chấp nhận mất.
**Consequences:** Báo cáo `inventory-temp-warehouse-out` vẫn thiếu các lượt bán đổi trả cũ.
Dựng lại FIFO ở một thời điểm quá khứ là phỏng đoán và có thể chuyển kho hai lần, nên rủi ro
của việc vá lớn hơn giá trị nó mang lại.
**Status:** accepted

### ADR-03 — Giữ publisher trực tiếp sau commit, không dùng outbox
**Context:** Đường bán v2 phát sự kiện này qua outbox trong transaction; đường đổi trả fan-out
bằng publisher trực tiếp sau commit.
**Decision:** Theo đúng hình dạng sẵn có của chính hàm đó — publisher trực tiếp, sau commit,
đặt ngay sau khối `STOCK_DEDUCTION`.
**Consequences:** Sự kiện có thể mất nếu process chết đúng khoảng giữa commit và publish. Rủi
ro này đã tồn tại y hệt cho `STOCK_DEDUCTION` và `STOCK_RETURN_IN` của cùng hóa đơn, nên feature
này không làm xấu đi độ bền vốn có. Chuyển cả cụm fan-out của đổi trả sang outbox là việc riêng.
**Status:** accepted
