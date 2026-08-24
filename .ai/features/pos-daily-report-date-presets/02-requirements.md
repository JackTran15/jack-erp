---
feature: pos-daily-report-date-presets
---

# Requirements — POS Báo cáo theo ngày: lọc được các mốc thời gian

Bối cảnh: dropdown khoảng thời gian trên `/daily-report` có 12 lựa chọn nhưng người dùng chỉ áp
dụng được "Khác". Chuỗi `preset → dateRangeToISO → issuedAt → queryKey → API` đã đúng; lỗi nằm ở
widget `PosDateRangeFilter`: chọn radio chỉ ghi vào buffer `pending`, `onChange` chỉ bắn khi bấm
"Áp dụng" ở đáy popover — mà danh sách 12 dòng không kẹp chiều cao, không cuộn, lại nằm trong
page root `overflow-hidden`, nên footer bị đẩy khỏi khung nhìn. "Khác" thoát được vì nó commit
qua dialog riêng có nút "Đồng ý" của chính nó.

## Acceptance criteria

| ID | Given | When | Then |
|---|---|---|---|
| AC-01 | Cửa sổ trình duyệt cao như laptop thực tế | Mở dropdown khoảng thời gian | Nút "Áp dụng" nằm trọn trong khung nhìn; danh sách lựa chọn cuộn được thay vì tràn ra ngoài |
| AC-02 | Kỳ mặc định "Hôm nay" (không có hoá đơn) | Chọn một preset có dữ liệu rồi bấm "Áp dụng" | Tab Tổng hợp đổi số theo đúng khoảng của preset, không còn rỗng |
| AC-03 | Hai preset có độ rộng khác nhau (7 ngày vs 14 ngày) | Áp dụng lần lượt từng preset | Số liệu khác nhau giữa hai preset — chứng minh lọc theo đúng mốc, không phải "có lọc là được" |
| AC-04 | Đã áp dụng một preset | Đọc dải ngày trên toolbar | `(dd/mm/yyyy HH:mm - dd/mm/yyyy HH:mm)` khớp đúng khoảng của preset vừa chọn |
| AC-05 | Đang ở tab Doanh thu theo mặt hàng | Áp dụng một preset | Bảng doanh thu theo mặt hàng cũng lọc theo cùng khoảng (dùng chung `issuedAt`) |
| AC-06 | Bất kỳ | Chọn "Khác" | Giữ nguyên hành vi cũ: mở dialog Từ/Đến, commit bằng "Đồng ý" |
