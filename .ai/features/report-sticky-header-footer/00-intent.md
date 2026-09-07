# Intent — report-sticky-header-footer

## Problem

Bảng báo cáo chain-store (`ReportPageTableView`) không dính (sticky) gì theo chiều dọc.
Báo cáo "Chi tiết doanh thu theo hóa đơn và mặt hàng" hiển thị 24 cột × 50 dòng/trang trên
1.510 kết quả: cuộn xuống là mất luôn hàng tiêu đề cột và hàng ô lọc, còn hàng **Tổng** ở
`<tfoot>` chỉ nhìn thấy khi đã cuộn tới đáy. Người dùng phải cuộn lên/xuống liên tục để nhớ
một con số thuộc cột nào, và không bao giờ so được một dòng với dòng Tổng trong cùng một
khung hình.

Đây là bảng dùng chung của toàn bộ ~20 báo cáo chain-store, và là bảng **duy nhất** trong
repo còn thiếu hành vi này: `BaseDataTable` (~40 trang backoffice) và `LineItemGrid`
(`@erp/ui`) đều đã sticky header + footer từ trước.

## Success signal

Cuộn tới giữa bảng vẫn đọc được tên cột **và** hàng Tổng trong cùng một khung hình; cuộn
ngang hết cỡ thì cột ghim trái vẫn che đúng phần trượt qua dưới nó ở cả ba vùng (header,
thân bảng, hàng Tổng).

## Out of scope

- `PosDataTable` (pos-web) — `tfoot` đã sticky, `thead` thì chưa, nhưng bảng đó dùng
  `border-collapse` nên phải chuyển sang `border-separate` trước; rủi ro lệch style ở ~10
  màn POS, tách thành việc riêng.
- ~8 dialog table trong backoffice đang dùng `border-collapse` + `sticky thead` (mất viền
  header) — cùng lý do.
- Virtualization cho bảng báo cáo.
- Mọi thay đổi về layout, chiều cao, padding, viền hay màu nền của header.

## Constraints

- Không đổi giao diện hiện tại: chiều cao hàng, padding, viền, màu nền phải giữ nguyên.
- Cột ghim (`enableColumnPinning`, `pinPosition()`) đang chạy bằng `position: sticky` đặt
  qua **inline style**; mọi giải pháp phải cộng sinh với nó chứ không ghi đè.
- Header có chiều cao thay đổi (dòng mã công thức `getReportColumnCode`, label xuống dòng
  khi cột hẹp, `columnResizeMode: "onChange"`) nên không dùng được hằng số chiều cao hàng
  như `BaseDataTable`.
- `border-separate border-spacing-0` phải giữ nguyên — `border-collapse` làm mất viền của
  ô sticky.
