# Logical design — warehouse-list-multiselect

## Approach

Gốc rễ của cả hai triệu chứng là **một biến gánh hai vai**: `selectedId` từ
`useDocumentListSelection` vừa là con trỏ "dòng đang xem" (nuôi panel chi tiết và
các nút Xem/Sửa/Xóa/Nhân bản), vừa là nguồn của `checked` trên ô tick. Tick là fetch
vì tick chính là đổi con trỏ. Không tick được nhiều vì con trỏ chỉ có một.

Cách sửa là tách hai vai đó, chứ không phải chặn fetch ở chỗ tick:

- **Vai 1 — con trỏ dòng đang xem.** Giữ nguyên `useDocumentListSelection`. Chỉ
  `onRowClick` (và các nút trong ô, ví dụ số phiếu) mới đổi nó. Auto-select dòng đầu
  giữ nguyên.
- **Vai 2 — tập phiếu đã tick.** State mới, `Set<string>`, do hook mới
  `useRowMultiSelect` giữ. Ô tick đọc/ghi duy nhất vào đây, và không chạm gì tới
  `selectedId` nên không kích hoạt query nào.

Ba mảnh dùng chung, đặt cạnh `useDocumentListSelection` để 4 trang không chép lại logic:

1. `components/document/useRowMultiSelect.ts` — state `Set<string>`, các phép
   `toggle` / `toggleAll` / `clear`, và cờ `allChecked` / `someChecked` tính theo
   **các dòng đang hiển thị** (`rows`), không theo toàn bộ Set. Đây là chỗ hiện thực
   A-03: "Chọn tất cả" chỉ áp lên trang hiện tại, còn Set vẫn giữ id của trang khác
   nên lật trang không mất tick (AC-09).
2. `components/document/RowSelectCheckbox.tsx` — hai ô tick: ô dòng và ô header.
   Ô header cần `indeterminate`, thuộc tính chỉ đặt được qua DOM ref chứ không qua
   JSX prop, nên nó phải là component chứ không phải một `<input>` viết thẳng tại
   chỗ như hiện tại.
3. `lib/barcode-prefill-merge.ts` — gộp `BarcodePrefillItem[]` theo
   `itemId|storageId|locationId`, cộng dồn `quantity` (AC-14). Trang In tem mã đổ
   prefill 1:1 (`InventoryItemBarcodesPage.tsx:103`), không tự gộp, nên phải gộp ở nguồn.

Thay đổi ở tầng bảng: `BaseDataTable` chưa có cách nào tô dòng đang chọn — ô tick
là dấu hiệu trực quan duy nhất, và ta vừa lấy nó đi. Thêm một prop tùy chọn
`rowClassName?: (row, index) => string | undefined`, hợp nhất bằng `cn()` sau class
kẻ sọc; `cn()` chạy `twMerge` nên `bg-*` do người gọi truyền vào ghi đè
`bg-background`/`bg-muted/20`.

Luồng in tem hàng loạt (chỉ Nhập kho và Xuất kho — A-01):

```
bấm "In tem mã"
  ├─ checkedIds rỗng ──► giữ nguyên đường cũ: đọc selectedOrder.lines
  └─ có tick ──► Promise.all(checkedIds.map(id => GET /:id))
                  ├─ một cái reject ──► toast lỗi, KHÔNG điều hướng (AC-16)
                  └─ tất cả ok ──► flatMap(lines→BarcodePrefillItem)
                                   ──► mergeBarcodePrefillItems
                                   ──► navigateToBarcodePrint
```

Dùng `GET /:id` (trả `lines` đầy đủ, không phân trang) chứ không phải `GET /:id/lines`
(phân trang, dựng cho panel cuộn vô hạn) — xem A-05. Trong lúc `Promise.all` chạy,
nút giữ `disabled` (AC-15), nên không có đường bấm hai lần.

Phạm vi từng trang:

| Trang | Multi-select | In tem hàng loạt | Ghi chú |
|---|---|---|---|
| Nhập kho `PurchaseOrdersPage` | có | có | `GET /goods-receipts/{id}` |
| Xuất kho `GoodsIssuePage` | có | có | `GET /inventory/goods-issues/{id}` |
| Chuyển kho `StockTransferPage` | có | không (A-01) | panel chi tiết vốn không fetch (A-07) |
| Lệnh điều chuyển `TransferOrdersPage` | có | không (A-01) | |

Xóa tick: mỗi trang gắn một `useEffect` phụ thuộc đúng state bộ lọc của nó
(`columnFilters`, `period`, …) — **không** phụ thuộc `pagination`, đó chính là điều
làm nên "đổi trang giữ tick, đổi lọc xóa tick" (AC-09/AC-10). Nút "Nạp" gọi thêm
`clearChecked()` (AC-11).

## Alternatives rejected

| Option | Why not |
|---|---|
| Giữ `selectedId` làm ô tick, chỉ hoãn fetch (debounce / `enabled` theo cờ) | Không giải quyết được yêu cầu chính là tick nhiều dòng. Và fetch vẫn xảy ra, chỉ là muộn hơn — AC-01 nói "không request nào", không phải "request chậm hơn" |
| Đổi `useDocumentListSelection` thành đa chọn (`selectedIds: string[]`) | Hook đang được 4+ trang khác dùng (TransferIn, StockTakes, Treasury…). Đổi chữ ký hook kéo theo sửa những trang ngoài phạm vi. Thêm hook riêng thì diff khoanh đúng 4 trang |
| Thêm endpoint BE gom lines nhiều phiếu (`POST /goods-receipts/lines/bulk`) | Yêu cầu nói rõ đây là việc của UI. Số phiếu tick một lượt ở mức chục (A-06), N lần `GET /:id` chấp nhận được. Thêm endpoint là thêm migration bề mặt API, thêm test e2e, cho một bài toán chưa chứng minh là nghẽn |
| "Chọn tất cả" theo toàn bộ kết quả lọc | Đã hỏi, người dùng loại. Muốn làm phải fetch id toàn bộ kết quả rồi fetch lines hàng trăm phiếu |
| Gộp trùng ở `InventoryItemBarcodesPage` thay vì ở nguồn | Trang đó cũng nhận prefill từ Chi tiết vị trí và Hàng hóa, nơi trùng lặp là dữ liệu thật người dùng cố ý nhập. Gộp ở đó là đổi hành vi của những nguồn ngoài phạm vi |
| Tô dòng đang xem bằng class trên `leadingColumn.cellClassName` | Chỉ tô được đúng ô tick, không tô được cả dòng. `cellClassName` lại là hằng, không nhận theo dòng |

## Contracts

Không có hợp đồng API nào đổi. Toàn bộ đổi thay nằm trong `apps/backoffice-web`.

```ts
// components/document/useRowMultiSelect.ts
interface UseRowMultiSelectProps<T> {
  rows: T[];
  getRowId: (row: T) => string;
}
interface RowMultiSelect {
  checkedIds: Set<string>;
  checkedCount: number;
  isChecked: (id: string) => boolean;
  toggle: (id: string) => void;
  /** Tick/bỏ tick toàn bộ dòng đang hiển thị, giữ nguyên id của trang khác. */
  toggleAllOnPage: () => void;
  clear: () => void;
  /** Mọi dòng đang hiển thị đều đã tick (và có ít nhất một dòng). */
  allOnPageChecked: boolean;
  /** Đã tick một phần các dòng đang hiển thị → ô header ở trạng thái indeterminate. */
  someOnPageChecked: boolean;
}

// components/document/RowSelectCheckbox.tsx
interface RowSelectCheckboxProps { checked: boolean; onToggle: () => void; }
interface SelectAllCheckboxProps { checked: boolean; indeterminate: boolean; disabled: boolean; onToggle: () => void; }

// lib/barcode-prefill-merge.ts
function mergeBarcodePrefillItems(items: BarcodePrefillItem[]): BarcodePrefillItem[];

// components/table/BaseDataTable.tsx — prop mới, tùy chọn
rowClassName?: (row: T, index: number) => string | undefined;
```

## Error taxonomy

| Tình huống | Xử lý | AC |
|---|---|---|
| Một `GET /:id` lỗi khi gom lines | `toast.error(getUserFacingApiErrorMessage(err))`, không điều hướng, nút trở lại enabled | AC-16 |
| Tick 0 phiếu, bấm "In tem mã" | Không phải lỗi — rơi về đường cũ, in theo dòng đang xem | AC-13 |
| Phiếu đã tick rồi bị xóa/hoãn ở tab khác, `GET /:id` trả 404 | Cùng nhánh lỗi trên: toast, không điều hướng | AC-16 |
| Danh sách rỗng | Ô header `disabled`; `toggleAllOnPage` là no-op | AC-08 |
| Phiếu đã tick nhưng không còn trong kết quả sau khi đổi lọc | Không xảy ra: đổi lọc xóa sạch tick | AC-10 |

## ADRs

### ADR-01 — Tách "dòng đang xem" khỏi "dòng đã tick" bằng hook thứ hai, không mở rộng hook cũ
**Status:** accepted

`useDocumentListSelection` đang phục vụ hơn chục trang (`TransferInPage`,
`StockTakesPage`, các trang Treasury, `EmployeesPage`…). Mở rộng nó thành đa chọn
buộc phải sửa cả những trang ngoài phạm vi, và trộn hai khái niệm khác nhau vào
cùng một hook — đúng cái nhầm lẫn đang gây ra bug này.

Thêm `useRowMultiSelect` độc lập, đặt cạnh, dùng chung cả hai. Diff khoanh gọn trong
4 trang trong phạm vi, hook cũ không đổi một dòng.

**Đánh đổi:** hai hook cùng nhận `rows` + `getRowId`, hơi lặp ở chỗ gọi. Chấp nhận
được: đó là hai câu hỏi khác nhau về cùng một tập dòng.

### ADR-02 — Gom lines bằng N lần `GET /:id` ở client, không thêm endpoint gom
**Status:** accepted

Yêu cầu là sửa hành vi UI. Endpoint hiện có `GET /:id` đã trả `lines` đầy đủ và
đang được chính nút "In tem mã" dùng cho một phiếu. Với số phiếu ở mức chục (A-06),
`Promise.all` là đủ, và `Promise.all` reject-trên-lỗi-đầu-tiên cho đúng hành vi
AC-16 mà không cần viết thêm gì.

**Đánh đổi:** tick nhiều phiếu qua nhiều trang rồi in sẽ bắn N request đồng thời.
Nếu về sau số phiếu lên hàng trăm, chỗ này là nơi cần giới hạn đồng thời hoặc một
endpoint gom — nhưng thêm ngay bây giờ là tối ưu cho một tải chưa tồn tại.

### ADR-03 — Gộp trùng ở nguồn, không ở trang In tem mã
**Status:** accepted

Cùng một mặt hàng nằm ở nhiều phiếu là chuyện thường khi in tem cả lô. Đổ ra hai
dòng riêng cho cùng một SKU/vị trí là rác với người dùng (AC-14).

Nhưng gộp phải nằm ở nguồn, không nằm ở `InventoryItemBarcodesPage`: trang đó còn
nhận prefill từ Chi tiết vị trí hàng hóa và Hàng hóa, và còn cho người dùng gõ tay,
nơi hai dòng cùng SKU có thể là cố ý. Gộp ở nguồn chỉ đổi đúng hành vi của nút vừa
thêm.

**Khóa gộp:** `itemId|storageId|locationId`. Không gộp theo mỗi `itemId` vì cùng
mặt hàng ở hai vị trí kho là hai tem khác nhau về nội dung vị trí.

### ADR-04 — Dấu hiệu dòng đang xem chuyển từ ô tick sang tô nền cả dòng
**Status:** accepted

Trước thay đổi này, ô tick chính là dấu hiệu "panel chi tiết đang hiển thị phiếu
này". Tách hai vai làm dòng đang xem mất hoàn toàn dấu hiệu trực quan (A-08) —
người dùng bấm Sửa mà không biết đang sửa phiếu nào.

`BaseDataTable` nhận prop tùy chọn `rowClassName`. Mặc định `undefined` nên hơn
hai chục trang đang dùng bảng này không đổi hành vi; chỉ 4 trang trong phạm vi
truyền vào.

**Token:** `bg-info/15`, không phải `bg-info-subtle`. Lần chạy verify đầu tiên chọn
`bg-info-subtle` và ảnh S2 cho thấy dòng đang xem vẫn không phân biệt được với các
dòng khác — token đó là `226 85% 98%`, dựng cho nền badge có chữ đè lên, gần như trắng.
Cùng lý do với `hover:bg-info-subtle/70` sẵn có: hiệu ứng hover của bảng này cũng gần
như không thấy, nhưng sửa nó là việc ngoài phạm vi.

**Đánh đổi:** prop nhận hàm, gọi mỗi lần render mỗi dòng. Với bảng cỡ pageSize
(20–100 dòng) chi phí không đáng kể, và nó theo đúng khuôn `cell`/`render` mà
`BaseDataTable` đã dùng sẵn.

### ADR-05 — Giá bán đi theo dữ liệu đổ sẵn, không để trang đích tự tra
**Status:** accepted

Bản đầu của UOW-02 chép nguyên `sellingPrice: 0` từ code cũ, coi đó là "không đổi hành
vi". Nó đúng ở đường một phiếu và sai hẳn ở đường hàng loạt: trang In tem mã đọc giá 0
là "nguồn không biết giá" và tra lại **từng dòng một**. Chọn tất cả rồi in ra hơn 3.000
request và trình duyệt đứng hình.

Bài học không phải "quên tối ưu" mà là: một hằng số vô hại ở quy mô chục dòng trở thành
lỗi hạng nặng khi tính năng mới nhân quy mô lên trăm lần. Chỗ cần nhìn khi thêm chọn
hàng loạt là mọi đoạn code chạy-mỗi-dòng nằm phía sau nó.

Giá vốn đã có trong payload (`item` eager-loaded, không `select`), nên sửa gốc chỉ là
đọc nó ra. Kèm theo là hàng rào ở trang đích: gộp theo `itemId`, trần đồng thời 6 —
để nguồn prefill nào thiếu giá thật cũng không dựng lại được sự cố.

**Đánh đổi:** hàng hóa có giá bán thật bằng 0 vẫn rơi vào nhánh tra lại. Chấp nhận:
6/19.971 hàng hóa trong DB, và nhánh đó nay đã có trần.
