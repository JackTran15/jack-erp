---
feature: footer-grand-totals-standard
adr_count: 4
---

# Logical design — Chuẩn hoá `totals` + ba bảng POS

## Approach

Quy tắc của đợt 1 vẫn chi phối: **tổng và lưới phải sinh ra từ cùng một hàm dựng truy vấn**. Đợt này
thêm một quy tắc thứ hai: **chỉ có một cách nói "tổng toàn tập"**.

Ba tầng công việc:

**Tầng 1 — Contract.** `ReportTotals = Record<string, number>` và
`PaginatedWithTotals<T> extends PaginatedResponse<T>` khai ở `packages/shared-interfaces/src/common`.
Kèm doc comment ghi quy ước (cột dẫn xuất, cột động, ranh giới với họ engine báo cáo). Đây là phần
nhỏ nhất về code nhưng là lý do tồn tại của cả đợt.

**Tầng 2 — Retrofit 12 bảng đợt 1.** Đổi hình dạng, không đổi con số. 8 báo cáo kho chỉ đổi tên kiểu;
Tổng hợp tồn kho cho `StockSummaryTotals` kế thừa `ReportTotals`; 3 phiếu kho chuyển từ `totalAmount`
scalar sang `totals: { totalAmount }`. Cửa chặn là 17 bước verify của đợt 1 chạy lại y nguyên.

**Tầng 3 — Ba bảng POS.** Áp mẫu `buildQuery` gọi hai lần, cộng thêm hai việc riêng của POS: một
biểu thức tiền có dấu dùng chung cho cả filter lẫn `SUM`, và nối phân trang thật cho hai bảng dialog.

## Alternatives rejected

| Phương án | Vì sao bỏ |
| --- | --- |
| Giữ nguyên 4 hình dạng, chỉ viết quy ước | Quy ước không có chỗ bám vào kiểu thì lần sau vẫn lệch; và người viết endpoint mới không có gì để import |
| Ép tất cả về `{ rows, totals: ReportRow \| null, total }` của engine báo cáo | `ReportRow` cho phép `string \| null` vì hàng totals ở đó đi chung bộ render với hàng dữ liệu; lưới CRUD không cần thế, và ép sẽ mất kiểm tra kiểu số. Còn phải sửa lại cả 12 bảng theo hướng rộng hơn chứ không chặt hơn |
| Giữ `totalAmount` scalar cho lưới một cột, `totals` cho lưới nhiều cột | Đúng ranh giới nào là "một cột" là chuyện tranh cãi mỗi lần; và Danh sách hóa đơn hôm nay một cột, mai thêm cột là đổi contract |
| Để retrofit lại sau | Hai hình dạng sống song song càng lâu càng khó gỡ; và đợt 1 vừa có evidence nên chạy lại verify bây giờ là rẻ nhất |
| Nhúng semi-join/`EXISTS` phức tạp vào SQL để tính tổng POS | Không cần: tiền nằm ngay trên dòng hoá đơn, chỉ cần một biểu thức `CASE` |

## Error taxonomy

| Lỗi | Biểu hiện | Xử lý |
| --- | --- | --- |
| Predicate cố định bị bỏ quên ở nhánh totals | Footer **lớn hơn** tổng các dòng đang hiển thị | Spec khẳng định từng predicate có mặt trên builder totals — nặng nhất là `EXISTS` của endpoint đổi trả (AC-09) |
| Filter và footer dùng hai đại lượng khác nhau | Lọc xong footer không khớp cột | Một factory SQL duy nhất nạp cho cả `applyCompare` lẫn `SUM` (ADR-02) |
| Đổi shape mà quên consumer | Footer im lặng thành rỗng | `tsc` toàn workspace + chạy lại 17 bước verify (AC-03, AC-04) |
| Quên reset trang khi đổi bộ lọc | Lưới trống nhưng footer khác 0 | Reset ở **mọi** setter nuôi truy vấn, kể cả `setDateRange` đang trả setter thô (AC-11) |
| `SUM(numeric)` về dạng chuỗi | FE nối chuỗi thay vì cộng | `Number(...)` ở mọi handler, như `search-goods-receipts-v2.handler.ts` đã làm |
| Thêm option cỡ trang > 100 | API trả 400 | Cả ba DTO POS chặn `@Max(100)` |

## ADRs

### ADR-01 — `ReportTotals` là `Record<string, number>`, không phải `ReportRow`

**Status:** accepted
**Context:** Repo đã có `ReportRow = Record<string, string | number | null>` phục vụ engine báo cáo,
nơi hàng totals đi qua đúng bộ render với hàng dữ liệu nên cần chứa cả chuỗi.
**Decision:** Lưới CRUD/tìm kiếm dùng kiểu hẹp hơn `Record<string, number>`; engine báo cáo giữ
`ReportRow`. Ghi ranh giới vào doc comment của cả hai.
**Consequences:** Hai kiểu tồn tại song song một cách có chủ đích, mỗi cái có lý do. Đổi lại, lưới
CRUD giữ được kiểm tra kiểu số và FE không phải phòng thủ với `string | null`.

### ADR-02 — Một factory SQL cho tiền có dấu của hoá đơn

**Status:** accepted
**Context:** Ba bảng POS đều hiển thị `getInvoiceSignedTotal` = `netAmount` cho RETURN/EXCHANGE,
`amountDue` cho phần còn lại. Đơn trả mang dấu âm, nên `SUM(amount_due)` ngây thơ vẫn ra một số
trông hợp lý mà sai (28.927.000 thay vì 26.337.000 trên dữ liệu hiện tại).
**Decision:** `invoiceSignedTotalSql(alias)` trong `modules/pos/services/invoice-amount.util.ts` —
nơi đã giữ "công thức tiền chuẩn". `FilterBuilder.applyCompare` nội suy thẳng biểu thức nên cùng một
factory nạp cho cả vế lọc lẫn vế `SUM`.
**Consequences:** Filter và footer không thể lệch nhau vì chúng là **một** chuỗi. Đổi lại, mảnh SQL
này phải giữ đồng bộ với `pos-web/src/lib/common/invoiceAmount.ts` bằng doc comment trỏ chéo — không
có cách nào ép bằng compiler.

### ADR-03 — Hai bảng dialog POS chuyển sang phân trang server thật

**Status:** accepted
**Context:** Cả hai ghim `page:1, limit:100` và render pager trang trí. Chỉ sửa footer sẽ tạo cảnh
"footer lớn hơn tổng các dòng nhìn thấy" — đúng nhưng người dùng sẽ báo là sai.
**Decision:** Nối `onPageChange`/`onPageSizeChange` (props đã có sẵn), state đặt theo tiền lệ
`use-invoice-list.ts`: trong hook nếu màn đã có page-hook, trong component nếu chưa.
**Consequences:** Sửa nhiều hơn ở FE và phải soát kỹ chỗ reset trang. Đổi lại, hết cảnh dữ liệu quá
100 dòng biến mất không dấu vết.

### ADR-04 — Lịch sử mua hàng: đẩy lọc trạng thái xuống server và đổi đại lượng ô lọc

**Status:** accepted
**Context:** FE loại dòng theo trạng thái **sau khi** fetch, nên "Tổng hóa đơn: N" (số của server) và
tiền ở footer nói về hai tập. Ô lọc "Tổng thanh toán" lại lọc `total_paid` trong khi cột hiển thị
`amountDue`/`netAmount` — đơn ghi nợ có `total_paid = 0` nhưng hiển thị nguyên giá trị.
**Decision:** Đưa whitelist trạng thái vào `buildQuery`; đổi DTO `totalPaid` → `totalAmount` và cho
`applyCompare` dùng factory ở ADR-02. Dòng không map được nhãn thì hiện ô trạng thái trống thay vì
bị bỏ.
**Consequences:** **Hành vi người dùng thấy được thay đổi** — lọc nay theo con số đang nhìn. Phải
ghi vào release note. Hai chỗ cùng loại lỗi ở endpoint đổi trả và danh sách hoá đơn được để lại có
chủ đích, ghi thành việc riêng.
