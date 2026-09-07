# Intent — warehouse-list-multiselect

## Problem

Bốn trang danh sách chứng từ kho — Nhập kho (`PurchaseOrdersPage`), Xuất kho
(`GoodsIssuePage`), Chuyển kho (`StockTransferPage`), Lệnh điều chuyển
(`TransferOrdersPage`) — đều dựng cột checkbox đầu dòng từ đúng một biến
`selectedId`. Một `selectedId` đang gánh hai việc khác hẳn nhau:

1. **Con trỏ dòng đang xem** — quyết định panel "Chi tiết" hiển thị lines của
   phiếu nào, và quyết định Xem / Sửa / Xóa / Nhân bản thao tác trên phiếu nào.
2. **Ô tick** — `checked={selectedId === row.id}`.

Hai hệ quả:

- **Tick là fetch.** Ở Nhập kho, Xuất kho, Lệnh điều chuyển, đổi `selectedId`
  kích hoạt `GET /:id` (header + lines) cộng `useInfiniteQuery` trên `/:id/lines`
  của panel chi tiết. Người dùng chỉ muốn đánh dấu một phiếu để in tem, nhưng
  mỗi cú tick kéo về toàn bộ dòng hàng của phiếu đó.
- **Không tick được nhiều phiếu.** Vì `selectedId` là `string | null`, tick phiếu
  thứ hai bỏ tick phiếu thứ nhất. Không có ô "Chọn tất cả" trên header. Người
  dùng muốn in tem mã cho nhiều phiếu một lượt phải vào từng phiếu, in từng lần.

## Success signal

- Trên cả 4 trang, tick được nhiều dòng cùng lúc, và ô "Chọn tất cả" trên header
  tick/bỏ tick toàn bộ dòng đang hiển thị.
- Click vào ô checkbox **không** phát sinh request nào tới `/:id` hay `/:id/lines`;
  panel "Chi tiết" giữ nguyên nội dung đang có.
- Click vào phần còn lại của dòng (ngày, số phiếu, đối tượng, tổng tiền…) vẫn đổi
  dòng đang xem và vẫn nạp chi tiết như hiện tại.
- Ở Nhập kho và Xuất kho, "In tem mã" gom lines của **mọi** phiếu đã tick, đổ sang
  trang In tem mã trong một lần điều hướng.
- Chưa tick phiếu nào thì "In tem mã" giữ nguyên hành vi cũ: in theo dòng đang xem.

## Out of scope

- Trang "Điều chuyển từ cửa hàng khác" (`TransferInPage`) và "Kiểm kê kho"
  (`StockTakesPage`) — người dùng không liệt kê trong phạm vi.
- Thêm nút "In tem mã" cho Chuyển kho và Lệnh điều chuyển. Đã hỏi và người dùng
  chốt: hai trang này chỉ nhận multi-select, chưa nối vào luồng in tem.
- Đổi API. Toàn bộ thay đổi nằm ở `apps/backoffice-web`; không thêm endpoint gom
  lines nhiều phiếu, không sửa DTO, không migration.
- "Chọn tất cả" theo toàn bộ kết quả lọc (mọi trang). Đã hỏi và người dùng chốt:
  chỉ trang hiện tại.
- Bỏ chọn / chọn theo khoảng bằng Shift-click.

## Constraints

- **Giữ nguyên `useDocumentListSelection`.** Hook này auto-select dòng đầu để panel
  chi tiết không trống khi vào trang; hành vi đó phải còn nguyên. Trạng thái tick
  là state mới, đặt cạnh nó, không thay nó.
- Tick **không** được auto-set. Vào trang là 0 phiếu được tick, kể cả khi
  `useDocumentListSelection` đã tự trỏ vào dòng đầu.
- `BaseDataTable` hiện không tô đậm dòng đang xem — ô tick là dấu hiệu trực quan
  duy nhất. Tách tick khỏi con trỏ dòng làm dòng đang xem trở nên vô hình, nên
  cần một dấu hiệu thay thế ở tầng bảng.
- Đổi trang **giữ** tick (gom phiếu qua nhiều trang rồi in một lượt). Đổi bộ lọc
  hoặc bấm "Nạp" **xóa** tick.
- React convention của repo: named export, `interface Props` tách riêng, primitives
  từ `@erp/ui`, icon từ `lucide-react`, chuỗi UI tiếng Việt.
