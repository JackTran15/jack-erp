---
feature: warehouse-voucher-detail-line-pagination
stories: 4
acceptance_criteria: 17
---

# Requirements — Phân trang dòng hàng trong dialog xem chi tiết phiếu nhập / phiếu xuất

## US-01 — Dòng phiếu xuất giữ đúng thứ tự đã nhập

As a thủ kho, I want dòng hàng trên phiếu xuất hiện đúng thứ tự tôi đã nhập
so that khi cắt trang tôi vẫn đối chiếu được với chứng từ giấy.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Phiếu mới giữ thứ tự nhập
```gherkin
Given tôi tạo một phiếu xuất kho với các dòng theo thứ tự A, B, C
When tôi mở lại phiếu đó và đọc dòng qua endpoint lines
Then thứ tự trả về là A, B, C
```

**AC-02** — Thứ tự ổn định qua các trang
```gherkin
Given một phiếu xuất có 120 dòng và cỡ trang là 50
When tôi đọc lần lượt trang 1, trang 2 và trang 3
Then ghép ba trang lại được đúng 120 dòng, không trùng và không sót
And thứ tự sau khi ghép khớp thứ tự đã nhập
```

**AC-03** — Phiếu cũ vẫn đọc được sau backfill, và giữ được thứ tự nhập gốc
```gherkin
Given các phiếu xuất đã tồn tại trước khi có cột thứ tự
When migration backfill chạy xong
Then mọi dòng của mỗi phiếu cũ đều có giá trị thứ tự duy nhất trong phạm vi phiếu đó
And đọc lại phiếu cũ trả về đủ số dòng như trước khi backfill
And thứ tự đó lấy từ thứ tự vật lý của hàng, không phải từ khoá chính ngẫu nhiên (ADR-09)
```

**AC-04** — Phiếu nhập giữ đúng thứ tự đã nhập, theo cùng cơ chế với phiếu xuất
```gherkin
Given tôi tạo một phiếu nhập kho với các dòng theo thứ tự A, B, C
When tôi mở lại phiếu đó và đọc dòng qua endpoint lines
Then thứ tự trả về là A, B, C
And thứ tự đó đến từ cột line_no, không phải từ created_at
```

> Sửa 2026-09-03 (A-14, ADR-05). Bản cũ của AC-04 khẳng định phiếu nhập **không đổi**
> và vẫn sắp theo `created_at`. Akenzy đảo quyết định đó: hai bảng dùng hai cơ chế thứ
> tự khác nhau là thứ sẽ phân kỳ, nên phiếu nhập cũng nhận `line_no`. Thứ tự người dùng
> nhìn thấy **không đổi** — `created_at ASC` và `line_no ASC` cho ra cùng một dãy sau
> backfill; cái đổi là nguồn của thứ tự đó.

**AC-17** — Phiếu nhập cũ vẫn giữ nguyên thứ tự đang hiển thị sau backfill
```gherkin
Given một phiếu nhập đã tồn tại trước khi có cột line_no
When migration backfill chạy xong
Then mọi dòng của phiếu đó có line_no duy nhất trong phạm vi phiếu
And thứ tự đọc ra khớp đúng thứ tự created_at mà phiếu đó đang hiển thị hôm nay
```

## US-02 — Dialog xem chi tiết phiếu xuất chỉ tải một trang dòng

As a thủ kho, I want dialog chi tiết phiếu xuất mở nhanh dù phiếu có vài trăm dòng
so that tôi không phải chờ và không phải cuộn qua cả phiếu.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-05** — Chỉ tải một trang
```gherkin
Given một phiếu xuất có ít nhất 200 dòng
When tôi mở dialog xem chi tiết phiếu đó
Then lưới dòng hiện đúng một trang dòng
And chỉ có một request lấy dòng được gửi, mang tham số page và pageSize
And độ lớn payload của request đó không tỉ lệ với tổng số dòng của phiếu
```

**AC-06** — Điều hướng trang
```gherkin
Given tôi đang xem trang 1 của lưới dòng
When tôi chuyển sang trang kế tiếp
Then lưới hiện trang kế tiếp
And tổng số dòng hiển thị trên thanh phân trang khớp tổng số dòng thật của phiếu
```

**AC-07** — Phiếu ít dòng
```gherkin
Given một phiếu xuất chỉ có 3 dòng
When tôi mở dialog xem chi tiết
Then cả 3 dòng hiện trong một trang
And thanh phân trang không mời tôi sang trang không tồn tại
```

## US-03 — Dialog xem chi tiết phiếu nhập cũng chỉ tải một trang, và hai chế độ kia không đổi

As a kế toán kho, I want dialog chi tiết phiếu nhập hành xử giống phiếu xuất
so that hai màn hình dùng chung một thói quen thao tác, mà tạo và sửa vẫn như cũ.

**Priority:** must
**Depends on:** US-02

### Acceptance criteria

**AC-08** — Phiếu nhập phân trang
```gherkin
Given một phiếu nhập kho có ít nhất 200 dòng
When tôi mở dialog xem chi tiết phiếu đó
Then lưới dòng hiện đúng một trang dòng và điều hướng được qua các trang
And tổng số dòng hiển thị khớp tổng số dòng thật của phiếu
```

**AC-09** — Chế độ tạo và chế độ sửa không hồi quy
```gherkin
Given tôi mở dialog phiếu nhập hoặc phiếu xuất ở chế độ tạo hoặc chế độ sửa
When tôi thêm, sửa và xoá dòng rồi lưu
Then toàn bộ dòng được gửi đi và lưu như trước khi có thay đổi này
And lưới ở hai chế độ đó vẫn hiện mọi dòng không cắt trang
```

**AC-10** — In và xuất Excel vẫn đủ dòng
```gherkin
Given một phiếu có nhiều hơn một trang dòng
When tôi in phiếu hoặc xuất Excel phiếu đó
Then tệp kết quả chứa đủ mọi dòng của phiếu, không chỉ trang đang xem
```

## US-04 — Tìm một mặt hàng trong phiếu mà không phải lật từng trang

As a kế toán kho, I want gõ mã hoặc tên hàng vào ô lọc trên header lưới và được tìm
trên **cả phiếu** so that tôi không phải lật qua từng trang để biết phiếu có chứa mặt
hàng đó hay không.

**Priority:** must
**Depends on:** US-02, US-03

> Story này ra đời từ một hồi quy do chính feature này gây ra, không phải từ một mong
> muốn mới (A-19). Trước khi phân trang, ô lọc của lưới tìm đúng cả phiếu vì lưới nhận
> cả phiếu.

### Acceptance criteria

**AC-11** — Lọc tìm trên cả phiếu, không chỉ trang đang xem
```gherkin
Given một phiếu xuất có 200 dòng, cỡ trang 50, và mặt hàng X chỉ xuất hiện ở dòng thứ 180
When tôi đang ở trang 1 và gõ mã SKU của X vào ô lọc cột Mã SKU
Then lưới hiện dòng chứa X
And lưới không còn hiện các dòng không khớp
And thanh phân trang báo tổng số dòng khớp là 1, không phải 200
```

**AC-12** — Điều kiện lọc đi xuống server, không lọc ở client
```gherkin
Given tôi đang mở dialog xem chi tiết một phiếu
When tôi gõ vào một ô lọc
Then một request POST tới đường dẫn lines/search được gửi, mang điều kiện lọc trong body
And số dòng trong response bằng đúng số dòng lưới hiện
```

**AC-13** — Thứ tự không đổi khi lọc, và không đổi được
```gherkin
Given tôi lọc ra một tập dòng trải trên nhiều trang gốc của phiếu
When tôi đọc kết quả
Then các dòng vẫn theo line_no tăng dần
And hợp đồng của endpoint không nhận bất kỳ tham số sắp xếp nào
```

**AC-14** — Ba số ở chân lưới theo tập đã lọc
```gherkin
Given một phiếu có 200 dòng, tổng tiền toàn phiếu là T
When tôi lọc còn 3 dòng
Then Số dòng ở chân lưới là 3
And Số lượng và Thành tiền ở chân lưới là tổng của đúng 3 dòng đó, không phải T
```

**AC-15** — Cột không lọc được thì không mời gõ
```gherkin
Given tôi đang ở chế độ xem
When tôi nhìn header lưới
Then các cột Kho, Vị trí và Đơn vị tính không có ô lọc gõ được
And các cột Mã SKU, Tên hàng hóa, Số lượng, Đơn giá, Thành tiền có ô lọc
```

**AC-16** — Chế độ tạo và chế độ sửa vẫn lọc tại chỗ
```gherkin
Given tôi đang soạn một phiếu ở chế độ tạo hoặc chế độ sửa với các dòng chưa lưu
When tôi gõ vào ô lọc trên header
Then lưới lọc ngay trên các dòng đang soạn, không gửi request nào
And sửa hoặc xoá một dòng khi đang lọc vẫn tác động đúng dòng đó
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Hiệu năng | Thời gian từ lúc bấm Xem tới lúc lưới hiện dòng đầu tiên giảm rõ rệt trên phiếu 200 dòng, đo trước và sau trên cùng máy | T-03-03 |
| Tương thích | Panel chi tiết cuộn vô hạn ở `GoodsIssuePage.tsx:879` tiếp tục chạy đúng sau khi đổi thứ tự sắp xếp | T-01-03 |
| Phạm vi dữ liệu | Truy vấn dòng giữ nguyên lọc theo organizationId và branchId cùng `@RequirePermission` sẵn có | T-01-02 |
| Hợp đồng API | Nếu chữ ký response của `/lines` đổi thì chạy lại `pnpm openapi:generate` và commit snapshot cùng schema sinh ra | T-02-01 |
| Hợp đồng API | `GET /:id/lines` bị xoá ở cả hai controller; không còn caller nào trong repo trỏ tới nó | T-05-04 |
| Tương thích | Panel chi tiết cuộn vô hạn ở `GoodsIssuePage.tsx:879` chạy đúng trên endpoint mới, gồm cả cuộn tới cuối phiếu | T-05-04 |
| Ngữ nghĩa toán tử | `*` trên header lưới lọc substring không phân biệt hoa thường; `≤` so sánh số — khớp đúng luật `line-item-grid.tsx:221-241` | T-06-03 |
| Ngôn ngữ | Chuỗi hiển thị tiếng Việt, source backend tiếng Anh | T-02-02 |
