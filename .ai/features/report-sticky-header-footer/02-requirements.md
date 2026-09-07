# Requirements — report-sticky-header-footer

## US-01 — Đọc được tên cột và dòng Tổng ở bất kỳ vị trí cuộn nào

Là người xem báo cáo, tôi muốn hàng tiêu đề và hàng Tổng luôn nằm trong khung nhìn khi
cuộn bảng, để không phải cuộn ngược lên chỉ để biết một con số thuộc cột nào.

**AC-01** — Ba hàng header dính đỉnh vùng cuộn
```gherkin
Given báo cáo "Chi tiết doanh thu theo hóa đơn và mặt hàng" đã tải và có nhiều dòng hơn chiều cao khung nhìn
When tôi cuộn dọc xuống giữa bảng
Then hàng tiêu đề nhóm, hàng tiêu đề cột và hàng ô lọc vẫn hiện ở đỉnh vùng cuộn
And ba hàng đó xếp liền nhau đúng thứ tự, không hở khoảng trống và không chồng lên nhau
```

**AC-02** — Hàng Tổng dính đáy vùng cuộn
```gherkin
Given báo cáo đang hiển thị hàng Tổng ở "tfoot"
When tôi cuộn dọc xuống giữa bảng
Then hàng Tổng vẫn hiện ở đáy vùng cuộn, ngay trên thanh cuộn ngang
And hàng Tổng cùng hàng tiêu đề nằm trong cùng một khung hình
```

**AC-03** — Ô ghim đè lên ô không ghim ở mọi hàng
```gherkin
Given bảng có cột được ghim trái (ví dụ cột "Ngày")
When tôi vừa cuộn dọc vừa cuộn ngang hết cỡ
Then cột ghim vẫn dính mép trái
And nội dung các cột khác trượt qua phía dưới nó mà không lộ lên trên, ở cả hàng tiêu đề, hàng ô lọc, thân bảng lẫn hàng Tổng
```

**AC-04** — Offset của hàng ô lọc bám theo chiều cao header thật
```gherkin
Given hàng tiêu đề đang cao một dòng
When tôi kéo hẹp một cột đủ để nhãn cột xuống dòng và hàng tiêu đề cao thêm
Then hàng ô lọc tự tụt xuống đúng phần cao thêm đó
And không xuất hiện khoảng hở giữa tiêu đề và ô lọc, cũng không có phần bị che
```

**AC-05** — Báo cáo không có hàng Tổng vẫn chạy
```gherkin
Given báo cáo "Kết quả kinh doanh" không khai báo summaryLabel nên không render "tfoot"
When tôi mở báo cáo và cuộn dọc
Then bảng hiển thị bình thường, không lỗi
And hàng tiêu đề vẫn dính đỉnh vùng cuộn
```

**AC-06** — Giao diện không đổi
```gherkin
Given bảng báo cáo trước khi sửa
When so sánh với bảng sau khi sửa ở cùng vị trí cuộn đầu bảng
Then chiều cao hàng, padding, viền và màu nền của mọi hàng giữ nguyên
And tính năng kéo-thả đổi thứ tự cột cùng kéo giãn chiều rộng cột vẫn hoạt động như cũ
```

**AC-07** — Hàng Tổng dính đáy cả khi bảng ngắn hoặc rỗng
```gherkin
Given báo cáo trả về ít dòng hơn chiều cao vùng cuộn, kể cả 0 dòng
When tôi mở báo cáo
Then hàng Tổng vẫn nằm sát đáy vùng cuộn, ngay trên thanh phân trang
And vị trí hàng Tổng không đổi khi số dòng thay đổi
```
