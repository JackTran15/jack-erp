# Logical design — report-sticky-header-footer

## Approach

Bảng đã có sẵn mọi điều kiện để sticky: một vùng cuộn duy nhất
(`ReportPageTableView.tsx:273`), `border-separate border-spacing-0` với viền đặt trên từng
ô, nền đục ở cả ba vùng, và sticky **ngang** cho cột ghim qua `pinPosition()` /
`groupPinPosition()`. Thiếu duy nhất `top` / `bottom` theo chiều dọc và một thang z-index
đúng. Vì vậy hướng làm là **bọc thêm**, không viết lại:

1. Hai hàm thuần trong `lib/table/report-table-pinning.ts` nhận kết quả của
   `pinPosition()` / `groupPinPosition()` rồi cộng thêm `position: sticky` + `top` (hoặc
   `bottom: 0`) + `zIndex`. `pinPosition()` giữ nguyên, mọi nơi khác đang gọi nó không đổi.
2. Ba hàng header lấy `top` lần lượt là `0`, `h1`, `h1 + h2`; `h1`/`h2` **đo trên DOM thật**
   bằng `useLayoutEffect` + `ResizeObserver` gắn vào hai `<tr>` đầu, vì chiều cao header ở
   bảng này không cố định (dòng mã công thức, nhãn xuống dòng, cột kéo giãn được).
3. `<tfoot>` lấy `bottom: 0`.
4. `<tfoot>` chỉ dính đáy khi bảng cao hơn vùng cuộn — sticky không đẩy phần tử ra ngoài
   containing block của nó. Bảng ngắn (đo được: dưới 13 dòng ở 1440×900) và bảng rỗng phải
   được **lấp đầy chiều cao** thì `bottom: 0` mới có chỗ bám: `<table>` cao `100%` cộng một
   `<tr>` đệm `aria-hidden` cao `100%` ở cuối `<tbody>` để nuốt phần thừa. Đây đúng thủ thuật
   `PosDataTable` đang dùng (`PosDataTable.tsx:48,119-123`), không phải phát minh mới.

Điều kiện tiên quyết cho phép đo: khi báo cáo **không** có group, hiện tại mọi ô tầng 1 đều
`rowSpan={2}` còn `<tr>` tầng 2 render rỗng — chiều cao của ô spanning bị trình duyệt phân
bổ cho hai hàng theo cách không xác định. Bỏ `rowSpan` và không render `<tr>` tầng 2 trong
nhánh đó khiến `h1` luôn là chiều cao thật của hàng tiêu đề (A-01).

## Alternatives rejected

| Option | Why not |
|---|---|
| `position: sticky` đặt thẳng trên `<thead>` / `<tfoot>` | Thuần CSS, không cần đo — nhưng phải lồng sticky trong sticky với các ô ghim ngang bên trong, mà containing block của ô lúc đó là thứ khác nhau giữa các engine. Đổi lấy rủi ro tương thích để tiết kiệm ~25 dòng đo đạc là không đáng, và nó lệch khỏi bản mẫu `BaseDataTable` mà ~40 trang đang chạy |
| Ép chiều cao header cố định rồi tính `top` bằng hằng số, như `BaseDataTable` (`HEADER_ROW_HEIGHT = 32`) | Đơn giản hơn thật, nhưng cắt mất dòng mã công thức (`getReportColumnCode`) và nhãn cột dài — vi phạm AC-06 |
| Tách thành hai bảng: một bảng header, một bảng thân | Phá đồng bộ chiều rộng cột với `columnResizeMode: "onChange"` và với `<colgroup>` sinh theo `column.getSize()`; phải tự đồng bộ scrollLeft giữa hai bảng |
| Thêm class Tailwind `sticky top-0` cho ô header | Không chạy: xem ADR-01 |

## Contracts

Không có contract API nào đổi. Không đụng backend, không đụng `@erp/api-client`, không
migration. Bề mặt thay đổi là hai export mới trong
`apps/backoffice-web/src/lib/table/report-table-pinning.ts` (tái xuất qua `lib/table/index.ts`)
và style nội bộ của `ReportPageTableView`. Prop `pinned` của `FilterHeaderCell` bị bỏ vì
nhiệm vụ duy nhất của nó là gắn class `z-20`, thứ nay đến từ inline style.

## Error taxonomy

| Chế độ hỏng | Biểu hiện | Chặn bằng |
|---|---|---|
| Vòng lặp `ResizeObserver` | Console spam `ResizeObserver loop completed with undelivered notifications`, trang giật | So sánh giá trị trước khi `setState`; observer chỉ gắn vào hai `<tr>`, còn `setState` chỉ đổi `top` chứ không đổi chiều cao |
| Đo ra 0 ở frame đầu | Hàng ô lọc chồng lên tiêu đề ngay khi mở trang, rồi tự nhảy về đúng | `useLayoutEffect` (đo trước khi trình duyệt vẽ), không phải `useEffect` |
| Sai thứ tự chồng lớp khi cuộn ngang | Chữ của cột thường lộ lên trên cột ghim | Bất biến ở ADR-02, kiểm bằng AC-03 |
| Đo sai vì `rowSpan` mơ hồ | Hàng ô lọc hở hoặc chồng ở đúng những báo cáo không có group | Bỏ `rowSpan` khi `!hasGroups` (A-01) |
| Mất viền ô sticky | Header sticky nhưng không còn đường kẻ | Không đụng `border-separate border-spacing-0`; viền vẫn nằm trên từng ô qua `cellBorder` |

## ADRs

### ADR-01 — Sticky dọc đặt bằng inline style, không bằng class Tailwind
**Status:** accepted

`pinPosition()` trả về `{ position: "sticky", left }` và giá trị này được gắn qua thuộc tính
`style` của ô. Inline style luôn thắng class ở cùng một property, nên nếu thêm class
`sticky top-0` thì nó sẽ vô hiệu **đúng trên các cột ghim** — tức là đúng chỗ hỏng lại là
chỗ khó phát hiện nhất, vì các cột không ghim vẫn dính bình thường và bug chỉ lộ ra khi cuộn
ngang. Vì vậy sticky dọc phải merge vào cùng object style, và `zIndex` cũng đi cùng đường đó
để chỉ có một nguồn sự thật (kéo theo việc phải gỡ các class `z-*` cũ, nếu không chúng thành
code chết gây hiểu nhầm).

Cùng lý do này đã được ghi lại một lần trong repo, ở hai chỗ khác nhau:
`SortableHeaderCell.tsx:22-23` (không áp `transform` của dnd-kit vì phá sticky) và
`ReportPageTableView.tsx:414-418` (`--row-bg` phải đặt bằng class chứ không inline, để
`:hover` còn ghi đè được).

### ADR-02 — Thang z-index giữ bất biến "mọi ô ghim cao hơn mọi ô không ghim"
**Status:** accepted

| Hàng | không ghim | ghim |
|---|---|---|
| header tầng 1 (group / cột đơn) | 25 | 35 |
| header tầng 2 (cột con của group) | 24 | 34 |
| hàng ô lọc | 20 | 30 |
| `<tfoot>` Tổng | 15 | 18 |
| thân bảng | – | 10 (giữ nguyên class `z-10` sẵn có) |

Thang này copy nguyên tắc của `BaseDataTable.tsx:355-458` chứ không nghĩ mới. Bất biến cần
giữ là `min(z ghim) = 30 > max(z không ghim) = 25` trong nhóm header. Nó **không** phải chi
tiết trang trí: ô tầng 1 của cột không thuộc group có `rowSpan={2}` nên phủ cả hàng 2, và khi
cuộn ngang, một ô tầng 2 đã ghim sẽ trượt vào đúng vùng nó phủ. Nếu xếp z theo tầng (tầng 1
luôn cao hơn tầng 2) thì ô ghim đó chui xuống dưới — đây là lý do thang có 4 mức chứ không
phải 2.

Ba mức thấp nhất chỉ cần thỏa: hàng ô lọc (20) và `<tfoot>` (15) đều phải cao hơn ô ghim của
thân bảng (10), vì khi cuộn ngang ô ghim của thân bảng trượt vào vùng nằm ngay dưới hàng ô
lọc và ngay trên hàng Tổng.
