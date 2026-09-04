---
feature: transfer-import-line-mismatch
slug: 2026090301-transfer-import-line-mismatch
owner: Akenzy
created: 2026-09-03
status: draft
---

# Intent — Nhập phiếu điều chuyển lỗi 400 sau khi sửa phiếu xuất

## Problem

QA #8 (03/09/2026): sau khi chi nhánh gửi **sửa phiếu xuất điều chuyển** (thêm mặt
hàng mới, sửa số lượng, xoá bớt dòng), chi nhánh nhận mở "Nhập kho → Điều chuyển từ
cửa hàng khác", chọn đúng chứng từ, lưới hiện đầy đủ và hợp lệ — nhưng bấm Lưu thì
API trả **400 `Line item is not part of the transfer order`**. Chi nhánh nhận không
nhập được hàng; cách duy nhất họ đang dùng là huỷ lệnh điều chuyển rồi làm lại.

Bằng chứng dữ liệu: trong `prod_3008`, **mọi** lệnh điều chuyển bị lệch dòng
(`goods_issue_lines` có mặt hàng mà `transfer_order_lines` không có) đều ở trạng thái
`CANCELLED` — LDC000327 (33 mặt hàng thiếu), LDC000243 (11), LDC000240 (86),
LDC000144 (24), LDC000241 (11)… Đó là dấu vết người dùng đâm vào lỗi rồi huỷ phiếu.

**Đây là lần tái phát.** Cùng lỗi này đã được chẩn đoán ngày 24/08
(`.ai/debug/transfer-order-import-line-mismatch.md`) và "sửa" bằng commit `609b2922`,
đã nằm trên `main` và đã lên prod. Bản sửa đó **không chạy**: nó là code chết.

### Nguyên nhân gốc (đã xác minh, không phải suy đoán)

Ba lớp bằng chứng độc lập:

1. **Cơ chế lệch dữ liệu** (`transfer-order.service.ts` → `adjustRequestedQty`).
   Khi phiếu xuất là chân xuất của một lệnh điều chuyển và chi nhánh nhận **chưa**
   nhập, `GoodsIssueService.update()` đẩy delta sang `TransferOrderService.applyLegRevision`
   → `adjustRequestedQty`. Với mặt hàng **mới thêm vào phiếu xuất**, lệnh điều chuyển
   chưa có dòng nào khớp `item_id`, nên `UPDATE` không khớp dòng nào. Commit `609b2922`
   thêm nhánh INSERT để bù đúng trường hợp này.

2. **Vì sao nhánh INSERT không bao giờ chạy.** Nó được canh bằng:

   ```ts
   const updated = await this.dataSource.manager.query(`UPDATE … RETURNING id`, […]);
   if (updated.length > 0) continue;   // ← luôn đúng
   ```

   TypeORM 0.3.28 (`driver/postgres/PostgresQueryRunner.js:198-203`) trả về
   `result.raw = [raw.rows, raw.rowCount]` cho lệnh `UPDATE`/`DELETE` — **một mảng 2
   phần tử**, không phải mảng dòng. `SELECT` mới trả thẳng mảng dòng. Nên `updated.length`
   **luôn bằng 2**, `continue` luôn nổ, INSERT là code không thể với tới.

   Đo thật bằng chính TypeORM của repo trên Postgres thật (bảng TEMP):

   ```
   zero-match result  = [[],0]     .length = 2 | length > 0 ? true
   one-match  result  = [[{id:…}],1]  .length = 2
   select     .length = 1
   ```

3. **Dữ liệu prod xác nhận nhánh INSERT chưa từng chạy.** Đếm số dòng
   `transfer_order_lines` được tạo muộn hơn lệnh điều chuyển của nó (dấu vết duy nhất
   một lần upsert để lại, vì cột `created_at` mặc định `now()`): **0 dòng, trên toàn bộ
   `prod_3008`** — dù prod đã chạy code sau 24/08 và vẫn còn lệch dòng ngày 28–29/08.

Hệ quả: sau lần sửa phiếu xuất, `transfer_order_lines` vĩnh viễn thiếu mặt hàng mà
phiếu xuất đang mang. Màn nhập soi gương theo **phiếu xuất** (`listImportable` mirror
`goods_issue_lines`, và `GoodsReceiptFormDialog.prefillFromTransferOrder` cũng lấy từ
phiếu xuất), còn `confirmImport` → `buildImportLinesFromInput` lại đối chiếu với
**`transfer_order_lines`**. Hai bên lệch nhau → 400.

## Affected personas

| Persona | Hành vi hiện tại | Hành vi mong muốn |
| --- | --- | --- |
| Nhân viên kho chi nhánh nhận | Bấm Lưu phiếu nhập → 400, không nhập được; phải huỷ lệnh điều chuyển và làm lại từ đầu | Lưu được phiếu nhập đúng theo phiếu xuất, kể cả khi chi nhánh gửi đã sửa phiếu xuất |
| Nhân viên kho chi nhánh gửi | Sửa phiếu xuất thành công, không có dấu hiệu gì bất thường — hỏng chỉ lộ ra ở chi nhánh khác | Sửa phiếu xuất đồng bộ luôn lệnh điều chuyển, hoặc báo lỗi ngay tại chỗ |
| Kế toán kho | Lệnh điều chuyển bị huỷ hàng loạt để né lỗi, sổ sách đầy phiếu huỷ | Không phải huỷ phiếu vì lý do kỹ thuật |

## Success signal

Sửa phiếu xuất điều chuyển (thêm mặt hàng / sửa số lượng / xoá dòng) rồi nhập ở chi
nhánh nhận **thành công 100%**, không còn 400 `Line item is not part of the transfer
order`; và truy vấn đối soát `goods_issue_lines EXCEPT transfer_order_lines` trên các
lệnh chưa nhập trả về **0 mặt hàng lệch** cho mọi phiếu tạo/sửa sau khi triển khai.

## Out of scope

- **Không đổi hướng nghiệp vụ.** Người dùng đã chốt: phiếu xuất là sự thật, sửa phiếu
  xuất thì lệnh điều chuyển tự nới theo. Không khoá lưới phiếu xuất, không bỏ kiểm tra
  ở `confirmImport`.
- **Không sửa luồng khi chi nhánh nhận đã nhập** (`importGoodsReceiptId` khác null) —
  đường đó đi qua `applyDeltaToLines`, đã bị `assertExportIssueCanBeEdited` chặn từ trước.
- **Không đụng POS, đơn bán, hay các loại phiếu nhập/xuất khác** ngoài chân điều chuyển.
- **Không tự huỷ/dọn các lệnh điều chuyển đã CANCELLED** trong quá khứ — chúng đã chết,
  người dùng đã làm lại phiếu khác.

## Constraints

| Kind | Detail |
| --- | --- |
| Dữ liệu | Prod đang có dòng lệch tồn đọng trên lệnh **chưa** nhập; cần đối soát và bù trước khi người dùng chạm lại |
| Bất biến | Không được đổi số lượng đã ghi sổ kho: bù `transfer_order_lines` là dữ liệu kế hoạch, không phải bút toán |
| Kỹ thuật | `manager.query()` trả `[rows, rowCount]` cho UPDATE/DELETE — bẫy này có thể còn ở chỗ khác trong repo, phải rà |
| Nguồn | Đã có sẵn `.ai/debug/transfer-order-import-line-mismatch.md` (phân tích 24/08) và unit test `transfer-order.service.spec.ts` mock đúng nhánh insert — test xanh giả vì mock trả mảng rỗng |

## Existing surface touched

- `apps/api/src/modules/inventory/transfer-order/transfer-order.service.ts` —
  `adjustRequestedQty`, `applyLegRevision`, `buildImportLinesFromInput`, `confirmImport`
- `apps/api/src/modules/inventory/goods-issue/goods-issue.service.ts` — `update()`, chỗ gọi cascade
- `apps/api/src/modules/inventory/voucher-delta.util.ts` — `computeVoucherDelta` (khoá theo `(itemId, locationId)`)
- `apps/api/src/modules/inventory/transfer-order/transfer-order.service.spec.ts` — test mock đang bảo kê cho bug
- Adjacent: [[project_warehouse_voucher_edit_delete]] (ADR-07 dựng ra `applyLegRevision`),
  [[project_stock_transfer_edit_manual_only]], [[project_transfer_return_stock_fixes]]
- Không có route/màn hình mới; FE không đổi.
