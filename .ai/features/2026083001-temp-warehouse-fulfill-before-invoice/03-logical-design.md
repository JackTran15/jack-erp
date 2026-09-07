---
feature: temp-warehouse-fulfill-before-invoice
adr_count: 4
---

# Logical design — Phiếu chuyển kho tạm ghi sổ trước hoá đơn bán

## Approach

Giữ nguyên kiến trúc hai nhịp bất đối xứng, chỉ sửa **giá trị `posted_at` mà nhịp 2
ghi xuống sổ**, để trình tự trong sổ phản ánh đúng trình tự nghiệp vụ.

Ba thay đổi, xếp theo tầng:

1. **Mở `postedAt` cho caller ở tầng ghi sổ.** `RecordMovementParams`
   (`stock-ledger.service.ts:26`) nhận thêm `postedAt?: Date`. Hai chỗ đang đóng cứng
   `new Date()` — `recordMovement` (`:206`) và `writeBatchMovements` (`:819`) — đổi
   thành `params.postedAt ?? now`. Không truyền thì hành vi y hệt hôm nay.
2. **Cho phiếu chuyển kho mang mốc ghi sổ theo yêu cầu.** `StockTransferService.post`
   (`:687`) và `createAndPost` (`:420`) nhận thêm `postedAt?: Date` trong `opts`, đưa
   vào mọi movement `buildMovements()` dựng ra. Luồng kho tạm đi qua **nhánh legacy**
   (`:816-821`, `validateOnHand: false`) nên chỉ nhánh đó cần đúng; nhánh
   `validateOnHand: true` cũng nhận cùng tham số để hai nhánh không lệch nhau.
3. **Consumer bù kho tạm neo mốc theo chính hoá đơn.**
   `fulfillInvoiceFromTempWarehouse` (`temp-warehouse.service.ts:1413`), trước khi gọi
   `createAndPost` (`:1515`), đọc `MIN(posted_at)` của các dòng `SALE_ISSUE` thuộc hoá
   đơn đó trong `stock_ledger_entries` (`reference_type = 'INVOICE'`,
   `reference_id = invoiceId`), rồi tính:

   ```
   anchor    = MIN(posted_at) của SALE_ISSUE thuộc hoá đơn
   dayStart  = businessDayStart(toBusinessDate(anchor))
   postedAt  = max(anchor - 1ms, dayStart)
   ```

   và truyền `postedAt` xuống `createAndPost`.

Neo theo **sổ** chứ không theo `new Date()` của consumer là điểm mấu chốt: dòng
`SALE_ISSUE` bất biến sau khi ghi, nên mọi lần replay đều đọc ra cùng một mốc và cho
ra cùng một `posted_at` (A-06, AC-06).

Không có thay đổi nào ở phía web, không có migration, không có hợp đồng API mới.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Chuyển nhịp 2 vào trong transaction thanh toán | Một lỗi ở kho tạm sẽ làm hỏng cả lần bán tại quầy. Akenzy loại ngày 2026-08-30 (A-02) |
| Thêm cột `sequence` vào `stock_ledger_entries` để sắp thay `posted_at` | Đổi schema một bảng append-only lớn và phải sửa mọi truy vấn báo cáo đang sắp theo `posted_at`. Chi phí lớn hơn hẳn vấn đề đang giải |
| `UPDATE` lại `posted_at` sau khi phiếu chuyển đã ghi | Vi phạm bất biến append-only của sổ kho (A-11) |
| Sắp lại thứ tự ở tầng đọc, ví dụ ưu tiên TRANSFER trước SALE khi trùng mốc | Chỉ vá đúng một khung nhìn. Mọi báo cáo khác vẫn sai, và bản chất dữ liệu ghi xuống vẫn sai thứ tự (A-10) |
| Lùi mốc một khoảng cố định, ví dụ 1 giây | Càng lùi xa càng dễ vượt ranh giới ngày và làm lệch tồn đầu kỳ (A-05). 1ms là khoảng nhỏ nhất đủ để tách thứ tự |
| Neo mốc theo `new Date()` của consumer trừ đi một khoảng | Không tất định: hai lần replay cho hai giá trị khác nhau, sổ kho không tái lập được (A-06) |

## Domain model

Không có thực thể mới. Một trường tuỳ chọn được thêm vào một kiểu tham số sẵn có:

| Kiểu | Thay đổi | Ghi chú |
| --- | --- | --- |
| `RecordMovementParams` | thêm `postedAt?: Date` | Không truyền thì giữ `new Date()` |
| `StockTransferService.post` opts | thêm `postedAt?: Date` | Áp cho movement, không áp cho cột `posted_at` của chính phiếu |
| `StockTransferService.createAndPost` opts | thêm `postedAt?: Date` | Chuyển tiếp xuống `post` |

## Contracts

Không có endpoint HTTP nào thay đổi. Hợp đồng duy nhất bị đụng là **nội bộ**, giữa
`TempWarehouseService` và `StockTransferService`:

```ts
createAndPost(
  input: BranchScopedTransferInput,
  actor: ActorContext,
  opts: { validateOnHand?: boolean; postedAt?: Date } = {},
): Promise<StockTransferEntity>
```

Không cần chạy `pnpm openapi:generate`.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| `posted_at` của dòng sổ kho | `StockLedgerService`, tại lần ghi đầu tiên | Vĩnh viễn, bất biến |
| Mốc neo của một lần bù kho tạm | `TempWarehouseService.fulfillInvoiceFromTempWarehouse` | Trong một lần xử lý event |
| `posted_at` của chính phiếu chuyển | `StockTransferService.post` statusPatch (`:752`) | Giữ nguyên thời gian thực, xem ADR-03 |

## Error taxonomy

| Condition | Failure subtype | Xử lý |
| --- | --- | --- |
| Không tìm thấy dòng `SALE_ISSUE` nào của hoá đơn khi neo mốc | không có mốc neo | Ghi cảnh báo rồi ghi phiếu chuyển với `posted_at` mặc định như hôm nay. Không được làm hỏng việc bù kho tạm chỉ vì không sắp được thứ tự |
| Phiên kho tạm không ACTIVE hoặc không còn dòng | không phải lỗi | `fulfillInvoiceFromTempWarehouse` return sớm như hiện tại (`:1424`, `:1476`) |
| Hoá đơn đã bù rồi (replay) | không phải lỗi | Chốt replay sẵn có return sớm (`:1427`); không sinh phiếu thứ hai |
| `createAndPost` ném lỗi trong consumer | lỗi hạ tầng | Retry rồi DLQ do `EventConsumerManager` lo, không lan ngược vào lần bán (AC-09) |
| Mốc lùi rơi sang ngày trước | đã chặn từ thiết kế | Kẹp về `businessDayStart` (AC-05) |
| Sale rơi đúng mili giây đầu tiên của ngày | dư lượng đã biết | Hai mốc bằng nhau, thứ tự khi trùng là tuỳ ý. Xem ADR-02, Consequences |

## Cache and offline

Không liên quan. Không có tầng cache nào giữa consumer và sổ kho.

## Observability

- `fulfillInvoiceFromTempWarehouse` đã log kết quả (`:1565`). Bổ sung vào cùng dòng log
  mốc neo đã dùng và mốc đã tính, để đọc log là dựng lại được thứ tự.
- Khi không neo được mốc (ca đầu trong bảng lỗi), log ở mức `warn` kèm `invoiceId`,
  vì đó là ca duy nhất người dùng vẫn có thể thấy −1.

## ADRs

### ADR-01 — Mốc ghi sổ do caller truyền vào, không sửa dòng đã ghi
**Context:** `stock_ledger_entries` là sổ append-only bất biến, mà giá trị `posted_at`
lại đang bị đóng cứng `new Date()` ở tầng ghi, không caller nào can thiệp được.
**Decision:** Mở `postedAt?: Date` trên `RecordMovementParams` và tôn trọng nó tại cả
hai đường ghi. Giá trị phải đúng ngay tại lần ghi đầu tiên; không bao giờ `UPDATE`.
**Consequences:** Một tham số tuỳ chọn trên đường ghi dùng chung của toàn miền kho, nên
tương thích ngược là điều kiện bắt buộc và được khẳng định bằng AC-03. Đổi lại, mọi
luồng bù trừ về sau đều có sẵn cách đặt dòng của mình vào đúng chỗ trong trình tự.
**Status:** accepted

### ADR-02 — Lùi 1 mili giây, neo theo hoá đơn, kẹp trong ngày làm việc
**Context:** Cần một mốc vừa nhỏ hơn mốc của hoá đơn, vừa tất định qua replay, vừa
không rơi sang kỳ báo cáo trước.
**Decision:** `postedAt = max(MIN(posted_at của SALE_ISSUE thuộc hoá đơn) - 1ms,
businessDayStart(toBusinessDate(cùng mốc đó)))`, dùng
`common/utils/business-timezone.util.ts` để hai bên cùng một định nghĩa ngày làm việc
với các báo cáo cắt kỳ.
**Consequences:** Tất định vì neo vào một dòng bất biến. An toàn với kỳ vì đã kẹp. Dư
lượng đã biết: nếu một lần bán rơi đúng mili giây đầu tiên của ngày làm việc thì mốc
kẹp bằng đúng mốc hoá đơn, thứ tự khi trùng là tuỳ ý và khung nhìn vẫn có thể hiện −1
cho riêng lần bán đó. Chấp nhận: nhiều nhất một lần bán mỗi ngày, vào thời điểm không
cửa hàng nào mở, và luôn tự khỏi ở dòng kế tiếp.
**Status:** accepted

### ADR-03 — Chỉ lùi mốc của dòng sổ kho, không lùi `posted_at` của chính phiếu chuyển
**Context:** `StockTransferService.post` đặt `statusPatch.postedAt = new Date()`
(`:752`) cho bản thân phiếu, tách biệt với `posted_at` của dòng sổ.
**Decision:** Giữ nguyên `posted_at` của phiếu là thời gian thực.
**Consequences:** Hai giá trị sẽ lệch nhau khoảng vài trăm mili giây tới vài giây, và
một người đọc kỹ sẽ hỏi tại sao. Câu trả lời nằm ở vai trò khác nhau: `posted_at` của
dòng sổ là **khoá sắp thứ tự** của sổ kho, còn `posted_at` của phiếu là **dấu vết kiểm
toán** ghi lại việc đó thực sự xảy ra lúc nào. Bóp méo dấu vết kiểm toán để làm đẹp một
khung nhìn là cái giá không đáng trả. Đổi lại phải ghi chú rõ trong mã, nếu không lần
sau sẽ có người "sửa" cho hai giá trị bằng nhau.
**Status:** accepted

### ADR-04 — Không neo được mốc thì vẫn bù kho tạm, chỉ bỏ phần sắp thứ tự
**Context:** Nếu vì lý do nào đó không đọc được dòng `SALE_ISSUE` của hoá đơn, consumer
phải chọn: dừng lại hay đi tiếp.
**Decision:** Đi tiếp với `posted_at` mặc định, ghi log mức `warn`.
**Consequences:** Bù kho tạm là việc chỉnh tồn thật, quan trọng hơn hẳn việc sắp thứ tự
hiển thị. Ném lỗi ở đây sẽ đẩy một việc chỉnh tồn đúng vào DLQ chỉ vì không làm đẹp
được một khung nhìn. Cái giá là ca này sẽ im lặng hiện −1 như cũ, nên nó phải kêu trong
log chứ không được lặng lẽ.
**Status:** accepted
