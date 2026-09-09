# Requirements — voucher-revision-projection

## US-01 — Sửa được phiếu đã từng sửa

**AC-01** — Sửa lần thứ hai không còn 409
```gherkin
Given một phiếu thu tiền mặt đã được sửa một lần, nên revision = 1
When mở lại phiếu đó từ lưới Thu chi tiền mặt và lưu một thay đổi nữa
Then server trả 200
And revision của phiếu tăng lên 2
```

**AC-02** — Lưới trả về revision thật, không phải 0
```gherkin
Given một phiếu thu tiền mặt có revision = 1 trong cơ sở dữ liệu
When gọi POST /v2/cash-vouchers/search
Then dòng của phiếu đó có revision = 1
```

**AC-03** — Nhánh phiếu chi của UNION cũng trả revision
```gherkin
Given một phiếu chi tiền mặt có revision = 1
When gọi POST /v2/cash-vouchers/search
Then dòng của phiếu đó có revision = 1
```

## US-02 — Cùng điều đó cho tiền gửi

**AC-04** — Lưới tiền gửi trả revision thật ở cả hai nhánh
```gherkin
Given một phiếu thu tiền gửi và một phiếu chi tiền gửi, mỗi cái đã sửa một lần
When gọi POST /v2/deposit-vouchers/search
Then cả hai dòng đều có revision = 1
```

**AC-05** — Sửa lần thứ hai trên tiền gửi không còn 409
```gherkin
Given một phiếu chi tiền gửi đã được sửa một lần
When lưu một thay đổi nữa với revision lấy từ dòng lưới
Then server trả 200
```

## US-03 — Không tái phát im lặng

**AC-06** — Mọi trường của row DTO đều có mặt trong phép chiếu
```gherkin
Given câu SQL mà handler search v2 sinh ra
When so danh sách cột của SELECT ngoài cùng với các trường của row DTO
Then không trường nào của DTO vắng mặt
And điều đó đúng cho cả hai handler
```
