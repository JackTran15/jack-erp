# Requirements — stock-summary-ending-total

## AC-01 — Footer "Tồn cuối kỳ" ra số thật

**Given** báo cáo Tổng hợp nhập xuất tồn kho đã tải dữ liệu của một kỳ có phát sinh
**When** người dùng nhìn hàng **Tổng** ở footer
**Then** hai ô của cụm "Tồn cuối kỳ" (Số lượng, Giá trị) hiển thị tổng thật, không phải 0.

## AC-02 — Tổng khớp đúng công thức của từng dòng

**Given** footer đã có số
**When** đối chiếu với ba cụm cột còn lại trên cùng hàng Tổng
**Then** `Tồn cuối kỳ = Tồn đầu kỳ + Nhập trong kỳ − Xuất trong kỳ`, cho cả Số lượng lẫn
Giá trị.

## AC-03 — Tổng mô tả toàn tập, không phải trang đang xem

**Given** kết quả trải trên nhiều trang
**When** người dùng chuyển sang trang khác
**Then** hai ô "Tồn cuối kỳ" ở footer không đổi.

## AC-04 — Tổng đi theo bộ lọc

**Given** người dùng thu hẹp kỳ báo cáo hoặc lọc một cột
**When** lưới tải lại
**Then** hai ô "Tồn cuối kỳ" đổi theo đúng tập kết quả mới, vẫn thoả AC-02.

## AC-05 — Hai báo cáo dùng chung engine cũng hết lỗi

**Given** `Chi tiết số lượng nhập xuất tồn kho` và `Tổng hợp nhập xuất tồn kho theo cửa hàng`
cùng ánh xạ `endingQty → closingQty` và cùng gọi `StockPeriodService.aggregate`
**When** chạy cùng kỳ, cùng phạm vi
**Then** tổng "Tồn cuối kỳ" của chúng cũng ra số thật, khớp công thức.

## AC-06 — Đúng ở cả hai nhánh SQL

**Given** "Thống kê theo" đặt ở `Mặt hàng` (nhánh `buildItemSqls`) hoặc `Mẫu mã` / `Nhóm hàng
hóa` (nhánh `buildAggSqls`)
**When** so sánh hàng Tổng giữa các grain trên cùng kỳ và cùng phạm vi
**Then** tổng "Tồn cuối kỳ" bằng nhau — grain chỉ đổi cách gom dòng, không đổi tập.
