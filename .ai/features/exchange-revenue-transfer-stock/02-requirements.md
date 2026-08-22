---
feature: exchange-revenue-transfer-stock
stories: 2
acceptance_criteria: 9
---

# Requirements — Đổi trả vào doanh số & Điều chuyển trừ kho xuất

Quy ước dùng chung: một hoá đơn `EXCHANGE` có `newSubtotal` = Σ dòng `direction = OUT`
("mua thêm") và `returnSubtotal` = Σ dòng `direction = IN` ("hàng trả");
`netAmount = newSubtotal − returnSubtotal`. Quy tắc người dùng đã chốt: **mua thêm cộng
nguyên vào cột doanh số bán, hàng trả trừ ở cột riêng, số tổng giữ nguyên bằng net**.

---

## US-01 — Doanh số hiện đủ phần mua thêm của hoá đơn đổi trả

Là chủ cửa hàng, tôi muốn nhìn thấy phần khách mua thêm trong một hoá đơn đổi trả,
để phân biệt "hôm nay không bán được gì" với "hôm nay đổi ngang một đơn 500k".

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Doanh thu theo mặt hàng tách được hàng bán và hàng trả
```gherkin
Given trong kỳ có một hoá đơn EXCHANGE đổi ngang cùng một mặt hàng
  (mua thêm 500.000, trả lại 500.000)
When tôi mở báo cáo "Doanh thu theo mặt hàng" cho kỳ đó
Then mặt hàng đó hiện giá trị hàng bán 500.000 và giá trị hàng trả 500.000
And cột tổng doanh thu của dòng đó vẫn bằng 0
```

**AC-02** — Số tổng không đổi so với hôm nay
```gherkin
Given một kỳ bất kỳ đã có số liệu trước khi sửa
When tôi chạy lại "Doanh thu theo mặt hàng" cho đúng kỳ đó sau khi sửa
Then tổng cột doanh thu của toàn báo cáo bằng đúng giá trị trước khi sửa
```

**AC-03** — Kết quả kinh doanh tách doanh thu gộp khỏi hàng trả
```gherkin
Given trong kỳ có hoá đơn EXCHANGE với mua thêm 800.000 và hàng trả 300.000
When tôi mở "Kết quả kinh doanh" cho kỳ đó
Then doanh thu hàng hoá gộp tăng 800.000 và hàng trả tăng 300.000
And doanh thu thuần của kỳ vẫn tăng đúng 500.000
```

**AC-04** — POS Tổng hợp: ô Hàng bán đã đúng, không được làm hỏng
```gherkin
Given trong kỳ có hoá đơn EXCHANGE với mua thêm 800.000 và hàng trả 300.000
When tôi mở POS › Báo cáo cuối ngày › Tổng hợp cho kỳ đó
Then ô "Hàng bán" gồm đủ 800.000 và ô "Hàng trả" gồm đủ 300.000
And ô "Doanh thu" vẫn chỉ phản ánh số tiền thực thu theo phương tiện thanh toán
```

**AC-05** — Hoá đơn bán thường không đổi hành vi
```gherkin
Given một kỳ chỉ có hoá đơn SALE và RETURN, không có EXCHANGE
When tôi chạy cả ba báo cáo trên cho kỳ đó
Then mọi con số bằng đúng giá trị trước khi sửa
```

---

## US-02 — Điều chuyển kho trừ đúng số lượng ở kho xuất

Là nhân viên kho, tôi muốn kho gửi bị trừ ngay khi phiếu điều chuyển được ghi sổ,
để không bán trùng số hàng đã chuyển đi và để kiểm kê không lệch.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-06** — Ghi sổ điều chuyển thì kho xuất giảm
```gherkin
Given mặt hàng X tồn 10 tại kho nguồn
When tôi lập và ghi sổ một phiếu điều chuyển 3 đơn vị mặt hàng X sang kho khác
Then tồn của X tại kho nguồn còn 7 trên màn "Tổng hợp tồn kho"
And màn "Vị trí hàng hoá" của kho nguồn cũng giảm đúng 3 tại vị trí bị trừ
And "Báo cáo nhập xuất tồn" ghi nhận 3 vào cột xuất trong kỳ của kho nguồn
```

**AC-07** — Không có chân nhập nào đứng một mình
```gherkin
Given một phiếu điều chuyển bất kỳ đã ghi sổ
When tôi cộng toàn bộ bút toán kho của phiếu đó trên cả tổ chức
Then tổng số lượng bằng 0
```

**AC-08** — Nhập điều chuyển thiếu chân xuất bị chặn
```gherkin
Given tôi lập phiếu nhập điều chuyển mà không có phiếu xuất đối ứng
When tôi ghi sổ phiếu đó
Then hệ thống từ chối và nêu rõ thiếu phiếu xuất đối ứng
And không có bút toán kho nào được ghi
```

**AC-09** — Không cho xuất quá tồn
```gherkin
Given mặt hàng X tồn 2 tại kho nguồn
When tôi ghi sổ một phiếu điều chuyển 5 đơn vị mặt hàng X đi khỏi kho đó
Then hệ thống từ chối và nêu rõ kho nguồn không đủ tồn
```
