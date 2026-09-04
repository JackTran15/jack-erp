---
feature: untracked-location-hidden
stories: 4
acceptance_criteria: 15
---

# Requirements — Ẩn vị trí đã ngừng theo dõi

Từ vựng dùng chung: **"dòng"** = một hàng `stock_balances` = một cặp (hàng hoá × vị trí).
**"ngừng theo dõi"** = `stock_balances.is_tracked = false`. **"vị trí trống"** = vị trí không còn
dòng nào đang theo dõi (có thể vẫn còn dòng đã ngừng trong DB — xem A-04).

## US-01 — Trạng thái "Xếp hàng hoá" phản ánh việc theo dõi

Là nhân viên kho, tôi muốn cột "Xếp hàng hoá" ở trang "Vị trí hàng hoá" nói đúng sự thật,
để phân biệt được kệ còn dùng với kệ đã bỏ mà không phải mở từng vị trí ra xem.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Vị trí chỉ còn dòng đã ngừng theo dõi
```gherkin
Given vị trí L có đúng 2 dòng và cả 2 đều is_tracked = false
When tôi mở trang "Vị trí hàng hoá"
Then cột "Xếp hàng hoá" của L hiển thị "Chưa xếp"
```

**AC-02** — Còn dòng đang theo dõi, kể cả khi hết hàng
```gherkin
Given vị trí L có 1 dòng is_tracked = true với quantity = 0 và 3 dòng is_tracked = false
When tôi mở trang "Vị trí hàng hoá"
Then cột "Xếp hàng hoá" của L hiển thị "Đã xếp"
```

**AC-03** — Bộ lọc cột đi cùng một định nghĩa
```gherkin
Given vị trí L chỉ còn dòng đã ngừng theo dõi
When tôi lọc cột "Xếp hàng hoá" = "Chưa xếp"
Then L có trong kết quả
When tôi lọc cột "Xếp hàng hoá" = "Đã xếp"
Then L không có trong kết quả
And tổng số dòng trả về khớp với số dòng đếm được của bộ lọc đó
```

**AC-04** — Bật lại theo dõi thì trở về "Đã xếp"
```gherkin
Given vị trí L đang hiển thị "Chưa xếp" vì mọi dòng đã ngừng theo dõi
When tôi bật lại theo dõi cho 1 dòng ở trang "Chi tiết vị trí"
And tôi mở lại trang "Vị trí hàng hoá"
Then cột "Xếp hàng hoá" của L hiển thị "Đã xếp"
```

**AC-05** — Endpoint danh sách vị trí v1 dùng cùng định nghĩa
```gherkin
Given vị trí L chỉ còn dòng đã ngừng theo dõi
When tôi gọi endpoint danh sách vị trí v1 (InventoryLocationService.listLocations)
Then trường hasItems của L là false
```

## US-02 — Hộp thoại chi tiết vị trí chỉ hiện hàng đang theo dõi

Là nhân viên kho, tôi muốn mở một vị trí từ trang "Vị trí hàng hoá" và chỉ thấy những mã thật sự
còn được theo dõi ở đó, nhưng vẫn xem lại được hàng đã ngừng khi cần dọn dẹp.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-06** — Mặc định ẩn dòng đã ngừng theo dõi
```gherkin
Given vị trí L có 2 dòng đang theo dõi và 3 dòng đã ngừng theo dõi
When tôi bấm vào L ở trang "Vị trí hàng hoá" để mở hộp thoại chi tiết
Then tôi thấy đúng 2 dòng
And tổng số bản ghi hiển thị ở phân trang là 2
```

**AC-07** — Xem riêng hàng đã ngừng theo dõi
```gherkin
Given hộp thoại chi tiết của vị trí L đang mở
When tôi đổi bộ lọc trạng thái sang "Ngừng theo dõi"
Then tôi thấy đúng 3 dòng đã ngừng theo dõi
And nút xoá dòng dùng được trên các dòng đó
```

**AC-08** — Xem tất cả
```gherkin
Given hộp thoại chi tiết của vị trí L đang mở
When tôi đổi bộ lọc trạng thái sang "Tất cả"
Then tôi thấy đủ 5 dòng
```

**AC-09** — Lọc chạy ở SQL, không sau phân trang
```gherkin
Given vị trí L có 60 dòng đang theo dõi và 40 dòng đã ngừng theo dõi
And pageSize = 50
When tôi mở hộp thoại chi tiết ở trạng thái mặc định
Then trang 1 có đúng 50 dòng và tổng là 60
And trang 2 có đúng 10 dòng
```

**AC-10** — Bộ lọc "dưới định mức" cũng tôn trọng trạng thái theo dõi
```gherkin
Given vị trí L có 1 dòng đã ngừng theo dõi với quantity dưới min_qty
When tôi mở hộp thoại chi tiết và lọc "dưới định mức" ở trạng thái mặc định
Then dòng đó không xuất hiện
```

## US-03 — Trang "Chi tiết vị trí" ở chế độ xem một vị trí

Là nhân viên kho, tôi muốn `/inventory/item-location-details?locationId=…` hành xử giống hộp thoại chi tiết,
để hai lối vào cùng một dữ liệu không cho hai câu trả lời khác nhau.

**Priority:** must
**Depends on:** US-02

### Acceptance criteria

**AC-11** — Chế độ xem một vị trí mặc định ẩn dòng đã ngừng
```gherkin
Given vị trí L có 2 dòng đang theo dõi và 3 dòng đã ngừng theo dõi
When tôi mở /inventory/item-location-details?locationId=<id của L>
Then tôi thấy đúng 2 dòng, giống hệt hộp thoại chi tiết của L
```

**AC-12** — Cột "Trạng thái" lọc được ở chế độ xem một vị trí
```gherkin
Given tôi đang ở /inventory/item-location-details?locationId=<id của L>
When tôi đổi bộ lọc cột "Trạng thái" sang "Ngừng theo dõi"
Then tôi thấy đúng 3 dòng đã ngừng theo dõi
When tôi xoá bộ lọc cột "Trạng thái"
Then tôi thấy đủ 5 dòng
```

**AC-13** — Chế độ chung không đổi hành vi
```gherkin
Given tôi mở trang "Chi tiết vị trí" không kèm locationId
When tôi để bộ lọc "Trạng thái" ở mặc định
Then chỉ dòng đang theo dõi hiển thị, y như trước đợt sửa này
And tham số gửi lên vẫn là isTracked=true trên endpoint /inventory/stock/balances
```

## US-04 — Không hồi quy hợp đồng và dữ liệu

Là người bảo trì, tôi muốn đợt sửa này không âm thầm đổi hợp đồng API hay đụng dữ liệu,
để bật lại theo dõi luôn khôi phục được nguyên trạng.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-14** — Không truyền tham số thì hành vi giữ nguyên
```gherkin
Given một client gọi GET /inventory/locations/:id/stock-items mà không truyền isTracked
When request chạy
Then kết quả gồm cả dòng đang theo dõi lẫn dòng đã ngừng theo dõi, y như trước đợt sửa này
```

**AC-15** — Dữ liệu không bị đụng tới
```gherkin
Given vị trí L có 3 dòng đã ngừng theo dõi, mỗi dòng có ngưỡng min/max riêng
When tôi bật lại theo dõi cho cả 3 dòng
Then cả 3 dòng hiện lại ở mọi màn hình với đúng số lượng cũ
And ngưỡng min/max của từng dòng còn nguyên
And không có migration nào được thêm trong đợt này
```

## Non-functional

| Kind | Requirement | Verified by |
|------|-------------|-------------|
| Hợp đồng API | `StockByLocationItemDto` khai `isTracked`; `packages/api-client` và `packages/api-client/openapi.snapshot.json` được sinh lại và commit | T-02-02 |
| Hiệu năng | Bộ lọc mới là một điều kiện trên cột đã có của `stock_balances`, không thêm join và không thêm truy vấn thứ hai | T-01-01, T-02-01 |
| Ngôn ngữ | Nhãn UI tiếng Việt ("Đang theo dõi" / "Ngừng theo dõi" / "Tất cả"); mô tả Swagger và comment tiếng Anh | T-02-03, T-03-01 |
| Kiểm chứng | Ảnh chụp cả ba màn hình ở desktop 1440×900, chụp sau khi API đã build lại (A-10) | T-04-01 |
