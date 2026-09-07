---
feature: transfer-import-line-mismatch
adr_count: 4
---

# Logical design — Nhập phiếu điều chuyển sau khi sửa phiếu xuất

## Approach

Giữ nguyên kiến trúc hai chân của ADR-07 ([[project_warehouse_voucher_edit_delete]]):
sửa một chân phiếu thì `TransferOrderService.applyLegRevision` đẩy delta sang chân kia.
Chỗ hỏng không nằm ở kiến trúc mà nằm ở **một dòng đọc sai kết quả truy vấn**.

Ba việc, theo đúng thứ tự đó:

1. **Sửa chỗ đọc kết quả.** `adjustRequestedQty` phân biệt "UPDATE khớp dòng nào chưa"
   bằng `affected count` thật, chứ không bằng `.length` của thứ TypeORM trả về. Nhánh
   INSERT vốn đã viết đúng từ 24/08 — nó chỉ cần với tới được.
2. **Chứng minh nó chạy.** Bản sửa 24/08 có unit test xanh mà vẫn chết, vì mock trả
   `[]` — đúng thứ TypeORM không bao giờ trả. Nên hồi quy lần này phải chạm Postgres
   thật, không mock lớp truy vấn.
3. **Đối soát dữ liệu tồn đọng**, rồi bù đúng nhóm lệnh còn cứu được.

Cộng thêm một việc phòng thủ: gom cách đọc `RETURNING` về một helper dùng chung và sửa
chỗ dính bẫy còn lại (`StockLedgerService.setTracked`).

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Bỏ kiểm tra `byItem.get(itemId)` ở `buildImportLinesFromInput` | Mất lớp chặn nhận hàng không thuộc lệnh điều chuyển. Người dùng đã chốt giữ hướng "lệnh tự nới", không phải "bỏ kiểm tra" (A-03) |
| Khoá lưới dòng của phiếu xuất điều chuyển ở FE, cấm thêm mặt hàng ngoài lệnh | Đảo hướng nghiệp vụ đã chốt; và vẫn không cứu được dữ liệu đã lệch sẵn |
| Đổi `buildImportLinesFromInput` sang đối chiếu với `goods_issue_lines` thay vì `transfer_order_lines` | Chữa triệu chứng: `transfer_order_lines` vẫn lệch và vẫn sai cho báo cáo hàng đang đi đường, `deriveExportLines`, và lần xuất lại |
| Viết lại `adjustRequestedQty` bằng `INSERT … ON CONFLICT DO UPDATE` | `transfer_order_lines` không có unique index trên `(transfer_order_id, item_id)`; thêm index là một migration + rủi ro trên dữ liệu đang có dòng trùng. Để dành, không cần cho lần sửa này |
| Sửa `applyDeltaToLines` (nhánh đã có phiếu nhập) trong cùng đợt | Ngoài phạm vi: `assertExportIssueCanBeEdited` chặn đường đó từ trước. Ghi nhận là nợ kỹ thuật, không làm ở đây |

## Domain model

Không có thực thể mới. Bảng liên quan:

| Bảng | Vai trò trong lỗi này | Ghi chú |
| --- | --- | --- |
| `transfer_order_lines` | Nguồn sự thật mà `confirmImport` đối chiếu | Chỉ là **kế hoạch**, không mang giá trị tiền, không sinh bút toán (A-06) |
| `goods_issue_lines` | Nguồn sự thật mà màn nhập soi gương theo | Ghi sổ kho thật đi qua đây |
| `goods_receipts` / `goods_receipt_lines` | Chân nhập, tạo bởi `confirmImport` | Không đổi |

## Contracts

Không có thay đổi hợp đồng HTTP. `POST /inventory/transfer-orders/:id/import` giữ
nguyên request/response; chỉ khác là nó thôi trả 400 trong kịch bản AC-02.

Một hợp đồng **nội bộ** được đặt tên lại cho rõ:

```ts
/** Số dòng một câu UPDATE/DELETE thực sự chạm tới. */
affectedRowCount(result: unknown): number

/** Các dòng một câu … RETURNING trả về, bất kể lệnh là SELECT/INSERT hay UPDATE/DELETE. */
returnedRows<T>(result: unknown): T[]
```

Hình dạng phải xử đúng, đo thật trên TypeORM 0.3.28 của repo:

| Lệnh | `manager.query()` trả về | `returnedRows` | `affectedRowCount` |
| --- | --- | --- | --- |
| `SELECT … ` | `[{…}, {…}]` | 2 dòng | — |
| `INSERT … RETURNING` | `[{…}]` | 1 dòng | — |
| `UPDATE … RETURNING`, khớp 0 dòng | `[[], 0]` | 0 dòng | 0 |
| `UPDATE … RETURNING`, khớp 1 dòng | `[[{id}], 1]` | 1 dòng | 1 |

Bẫy nằm ở hai dòng cuối: `.length` của chúng đều là **2**.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| `transfer_order_lines` (kế hoạch điều chuyển) | `TransferOrderService` | Vòng đời lệnh; sửa được qua cascade khi chưa có phiếu nhập |
| `goods_issue_lines` (hàng thật đã xuất) | `GoodsIssueService` | Bất biến sau khi chi nhánh nhận đã nhập |
| Quyền sửa chân xuất | `assertExportIssueCanBeEdited` | Đóng lại ngay khi `importGoodsReceiptId` được đặt |

## Error taxonomy

| Condition | Hành vi hiện tại | Hành vi sau khi sửa |
| --- | --- | --- |
| Phiếu xuất mang mặt hàng lệnh chưa có, cascade chạy được | 400 ở chi nhánh nhận, muộn và ở nhầm chỗ | Lệnh tự thêm dòng; chi nhánh nhận nhập bình thường |
| Delta âm cho mặt hàng lệnh chưa từng có | Im lặng bỏ qua | Vẫn bỏ qua, nhưng `logger.warn` để lệch thật không tàng hình (AC-06) |
| Lệnh đã bị huỷ | `ConflictException` khi sửa chân xuất | Không đổi |
| Chi nhánh nhận đã nhập | `ConflictException` "phải xoá phiếu nhập trước" | Không đổi |

## Observability

- Giữ `logger.log` khi chèn dòng mới — đó cũng là **dấu vết duy nhất** cho biết nhánh
  này có chạy hay không, và chính sự vắng mặt của nó (0 dòng chèn muộn trên toàn prod)
  đã tố cáo bản sửa 24/08 là code chết.
- Truy vấn đối soát trở thành công cụ vận hành lâu dài, không phải script dùng một lần:

  ```sql
  SELECT t.document_number, gi.document_number, t.status, x.item_id
  FROM transfer_orders t
  JOIN goods_issues gi ON gi.id = t.export_goods_issue_id
  CROSS JOIN LATERAL (
    SELECT gil.item_id FROM goods_issue_lines gil WHERE gil.goods_issue_id = gi.id
    EXCEPT
    SELECT tol.item_id FROM transfer_order_lines tol WHERE tol.transfer_order_id = t.id
  ) x
  WHERE t.import_goods_receipt_id IS NULL;
  ```

## ADRs

### ADR-01 — Đọc số dòng bị chạm bằng `affected`, không bằng `.length`

**Context:** `manager.query()` của TypeORM 0.3.28 trả `result.raw = [rows, rowCount]`
cho `UPDATE`/`DELETE` (`PostgresQueryRunner.js:198-203`), và trả thẳng mảng dòng cho
`SELECT`/`INSERT`. Bản sửa 24/08 canh nhánh INSERT bằng `updated.length > 0`, mà giá trị
đó luôn là 2. Repo đã biết bẫy này ở một chỗ (`sync-admin-permissions.seed.ts:86-93`)
nhưng kiến thức đó nằm chết trong một file seed.

**Decision:** Không đọc `.length` của kết quả `query()` để suy ra số dòng bị chạm nữa.
Dùng `queryRunner.query(sql, params, true)` (`useStructuredResult`) lấy `affected`, hoặc
đi qua helper dùng chung nâng từ file seed lên chỗ dùng chung được. Helper là nơi duy
nhất biết về hình dạng của TypeORM.

**Consequences:** Một chỗ duy nhất phải sửa lại khi nâng cấp TypeORM. `setTracked` thôi
trả `updated: 2`. Bù lại là một lớp gián tiếp mỏng ở nơi trước đây gọi thẳng.

**Status:** accepted

### ADR-02 — Hồi quy cho lớp lỗi này phải chạm Postgres thật

**Context:** Bug đã sống 10 ngày **cùng với** một unit test được viết riêng để chặn nó
(`transfer-order.service.spec.ts:1085`). Test xanh vì nó mock `manager.query` trả `[]` —
đúng thứ TypeORM không bao giờ trả. Mock đã mã hoá hiểu lầm, rồi bảo kê cho hiểu lầm đó.

**Decision:** Nhánh insert của `adjustRequestedQty` phải có ít nhất một test chạy trên
Postgres thật (e2e, DB `erp_test`), khẳng định trên dữ liệu chứ không trên lời gọi mock.
Unit test giữ lại cho phần điều phối, nhưng mock phải trả đúng hình dạng thật.

**Consequences:** Suite e2e dài thêm một kịch bản. Đổi lại, hình dạng kết quả truy vấn
không còn là thứ test tự bịa.

**Status:** accepted

### ADR-03 — Bù dữ liệu bằng script vận hành, không bằng migration

**Context:** Dữ liệu lệch nằm ở prod; nhóm còn cứu được là lệnh **chưa** nhập và **chưa**
huỷ. Toàn bộ lệch trong ảnh chụp `prod_3008` đều đã `CANCELLED` (A-07), nhưng ảnh chụp
lúc 09:20 còn ca QA lúc 12:01 — vẫn có thể có lệnh sống đang lệch.

**Decision:** Viết script hai chế độ (`--dry-run` mặc định, `--write` tường minh) chứ
không viết migration. Lý do: phạm vi phụ thuộc trạng thái tại thời điểm chạy, cần người
đọc kế hoạch trước khi ghi, cần chạy lại được, và không được gắn vào lịch sử schema.

**Consequences:** Phải có người bấm nút; đổi lại là chạy được nhiều lần, xem trước được,
và không kẹt trong chuỗi migration. Trùng tinh thần [[feedback_handwrite_migrations]]:
`migration:generate` ở repo này sinh drift, dữ liệu vận hành thì không nên đi đường đó.

**Status:** accepted

### ADR-04 — Dòng bù mang `requested_qty` bằng số lượng phiếu xuất đang mang

**Context:** Khi bù một mặt hàng thiếu, phải chọn số lượng ghi vào `transfer_order_lines`.

**Decision:** Lấy tổng số lượng của mặt hàng đó trên `goods_issue_lines` của chân xuất.
Phiếu xuất là sự thật (A-03); lệnh điều chuyển chỉ là kế hoạch được kéo cho khớp.

**Consequences:** Sau khi bù, kế hoạch bằng đúng thực xuất — mất thông tin "kế hoạch ban
đầu là bao nhiêu", nhưng thông tin đó vốn đã mất từ lần sửa phiếu xuất. Không sinh bút
toán, không đụng tồn (A-06).

**Status:** accepted
