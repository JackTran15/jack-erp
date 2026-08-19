---
feature: exchange-temp-warehouse-fulfill
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | Chân "Mua thêm" của đơn đổi trả phải tiêu thụ kho tạm **theo gộp (gross)** — chỉ nhìn dòng OUT, bỏ qua dòng IN — y hệt đường bán thường | high | yes | Đổi trả cùng SKU cả hai chiều sẽ kéo thêm 1 đơn vị Kho→Showroom; đổi lại là một dạng mã duy nhất với `checkout-invoice.service.ts:355-377` | confirmed | Chủ sở hữu chọn "Gross — OUT lines only", 2026-08-19 |
| A-02 | Không vá dữ liệu quá khứ; tồn âm cũ tự lành khi nhân viên xử lý phiên kho tạm | high | yes | Nếu sai thì cần thêm script/migration dựng lại FIFO quá khứ — một UoW nữa | confirmed | Chủ sở hữu chọn "Fix-forward only", 2026-08-19 |
| A-03 | `TempWarehouseFulfillPublisher` đã nằm sẵn trong phạm vi DI của `PosModule` nên `CheckoutReturnService` inject được mà không phải sửa module | high | yes | Phải thêm import/provider vào `PosModule` | confirmed | Đã kiểm: `stock-ledger.module.ts:65,73` provide + export, và `CheckoutInvoiceService` (cùng `PosModule`) đã inject nó ở `checkout-invoice.service.ts:78`, 2026-08-19 |
| A-04 | `eventId = invoiceId` của đơn đổi trả không đụng `processed_events` của đơn bán gốc | high | yes | Sự kiện bị coi là trùng và bị nuốt → lỗi y như cũ nhưng khó thấy hơn | confirmed | Đã kiểm: `TempWarehouseFulfillPublisher` đặt `eventId: payload.invoiceId`; hóa đơn đổi trả là bản ghi `invoices` riêng với UUID riêng (`create-exchange-invoice.service.ts`), 2026-08-19 |
| A-05 | `fulfillInvoiceFromTempWarehouse` không cần sửa: nó chỉ nhận `{itemId, quantity}` và tự khớp FIFO, không quan tâm loại hóa đơn | high | yes | Phải sửa cả service kho tạm → phạm vi rộng gấp đôi | confirmed | Đã đọc `temp-warehouse.service.ts:1260-1400`: chỉ dùng `p.lines[].itemId/quantity`, `p.branchId`, `p.invoiceId`, `p.invoiceNumber`; không đọc `invoice.type`, 2026-08-19 |
| A-06 | Dòng OUT của đơn đổi trả lưu `quantity` **dương** (dấu âm trên hóa đơn giấy là do `direction`, không phải do dấu số) | high | yes | Payload gửi số âm → `fulfillInvoiceFromTempWarehouse` tính `take = Math.min(need, qty)` ≤ 0 và bỏ qua, sửa xong vẫn hỏng | confirmed | Đã đọc `create-exchange-invoice.service.ts:216-240`: `quantity: line.quantity` với `direction: ItemDirection.OUT`, và `lineTotal = quantity * unitPrice` dương, 2026-08-19 |
| A-07 | Hóa đơn RETURN thuần không có dòng OUT nên tự nhiên không phát sự kiện — không cần guard riêng theo `invoice.type` | high | no | Phát một sự kiện rỗng vô hại (consumer no-op khi `plan.length === 0`) | confirmed | `outLines = items.filter(direction === OUT)`; guard `outLines.length > 0` đã có sẵn ở `checkout-return.service.ts:987`, 2026-08-19 |
| A-08 | Fan-out sau commit bằng publisher trực tiếp là đúng chỗ đặt lượt phát này (không cần outbox) | medium | no | Sự kiện có thể mất nếu process chết giữa commit và publish — nhưng cả `STOCK_DEDUCTION` lẫn `STOCK_RETURN_IN` của chính đơn này đã chịu cùng rủi ro | confirmed | Tương đương đường bán v1 (`checkout-invoice.service.ts:363`), cũng publish sau commit. Chuyển đổi trả sang outbox là việc khác, 2026-08-19 |
| A-09 | Hủy đơn đổi trả không cần đảo phiếu chuyển kho tạm | medium | no | Hủy một đơn đổi trả để lại một phiếu chuyển Kho→Showroom mồ côi | confirmed | Đường bán thường cũng vậy: `cancel-invoice.service.ts` không nhắc gì tới kho tạm (grep 0 hit). Giữ tương đương, 2026-08-19 |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
|----|----------------|----------------------|-------------|
| A-10 | Chân "Mua thêm" trừ nhầm vào kho thay vì showroom, nên chỉ cần sửa chỗ giải vị trí | Trừ showroom là **cố ý** và đã đúng: `create-exchange-invoice.service.ts:209-227` ép `showroomOnly: true` kèm comment nói rõ ý đồ | Không đụng gì tới `resolveBranchItemLocations`; toàn bộ sửa chữa dồn vào lượt phát sự kiện còn thiếu |
