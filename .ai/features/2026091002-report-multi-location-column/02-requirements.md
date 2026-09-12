---
feature: report-multi-location-column
stories: 4
acceptance_criteria: 19
---

# Requirements — Cột "Vị trí" liệt kê đủ mọi kho–vị trí

## US-01 — Nhân viên kho đọc đủ vị trí trên báo cáo Tổng hợp nhập xuất tồn kho

Là nhân viên kho, tôi muốn thấy **mọi** kho–vị trí mà một mặt hàng đang nằm,
để không đi tới một kệ rồi phát hiện hàng nằm ở kho lưu trữ khác.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Hai kho lưu trữ, hai kệ
```gherkin
Given mặt hàng A có kệ ưu tiên A101 ở kho lưu trữ mã "A1" và kệ ưu tiên A201 ở kho lưu trữ mã "A2"
  And cả hai kho đều đang hoạt động và thuộc chi nhánh đang xem
When tôi mở báo cáo Tổng hợp nhập xuất tồn kho ở chế độ một chi nhánh
Then ô "Mã vị trí" của mặt hàng A hiển thị "A101, A201"
  And ô "Tên vị trí" hiển thị "<tên kệ A101>, <tên kệ A201>"
```
> Sửa lần một 2026-09-12 khi mở lại G2 (A-03 đảo): bản trước yêu cầu ô "Mã vị trí" hiển thị
> "A1-A101, A2-A201"; tên kho lui về cột "Tên vị trí".
> **Sửa lần hai 2026-09-12 khi mở lại G1 (A-03 đảo tiếp):** Akenzy xem lại báo cáo và chốt ô
> "Tên vị trí" cũng chỉ hiện tên vị trí. Không cột nào của báo cáo còn nêu kho nữa — ADR-06.

**AC-02** — Một kệ duy nhất: ô mã chỉ có mã vị trí
```gherkin
Given mặt hàng B chỉ nằm trên đúng một kệ A101 thuộc kho lưu trữ mã "A1"
When tôi mở báo cáo
Then ô "Mã vị trí" hiển thị "A101"
  And ô "Tên vị trí" hiển thị "Kệ A101"
```
> Sửa ngày 2026-09-12 (A-03 đảo): bản trước của plan này yêu cầu "A1-A101", và trước nữa
> hành vi trên prod cũng là "A101". Tức là ô mã trở lại như trước feature này, còn cái
> feature này thêm vào — liệt kê đủ mọi kệ — vẫn giữ.

**AC-03** — Hợp của kệ ưu tiên và kệ đang có tồn
```gherkin
Given mặt hàng C có kệ ưu tiên A101 với tồn 0
  And mặt hàng C còn tồn 5 trên kệ B202 thuộc một kho lưu trữ khác
When tôi mở báo cáo
Then ô "Mã vị trí" chứa cả cặp của A101 lẫn cặp của B202
```

**AC-04** — Cặp "Ngừng theo dõi" bị loại, các cặp còn lại giữ nguyên
```gherkin
Given mặt hàng D nằm trên kệ A101 và kệ A201
  And cặp (D, A101) được đánh dấu Ngừng theo dõi
When tôi mở báo cáo
Then ô "Mã vị trí" chỉ chứa cặp của A201
  And mặt hàng D vẫn xuất hiện trên báo cáo
```

**AC-05** — Chỉ nằm ở showroom
```gherkin
Given mặt hàng E không nằm trên kệ của bất kỳ kho lưu trữ nào
  And mặt hàng E còn tồn trên kệ của showroom
When tôi mở báo cáo Tổng hợp nhập xuất tồn kho
Then ô "Mã vị trí" hiển thị cặp kho–vị trí của kệ showroom đó
```

**AC-06** — Thứ tự tất định
```gherkin
Given mặt hàng F nằm trên nhiều kệ ở nhiều kho lưu trữ
When tôi tải báo cáo hai lần với cùng bộ lọc
Then chuỗi trong ô "Mã vị trí" giống hệt nhau ở cả hai lần
  And các kệ được sắp theo mã vị trí, rồi tên vị trí, rồi mã kho
```
> Sửa ngày 2026-09-12 (ADR-06). Bản trước sắp theo `(mã kho, mã vị trí)`. Sau khi kho ra khỏi
> cả hai ô, khoá sắp xếp cũ không còn nhìn thấy được: đúng dòng QA báo sẽ đọc ra
> `S01.01, A01.01` — tất định nhưng trông như chưa sắp. Mã kho tụt xuống làm khoá phá hoà cuối,
> chỉ để giữ tất định cho hai kệ khác kho trùng cả mã lẫn tên (AC-14).

**AC-14** — Hai kho trùng mã vị trí thì ô mã gộp còn một
```gherkin
Given mặt hàng G nằm trên kệ mã "999" ở kho lưu trữ "A1" và kệ mã "999" ở kho lưu trữ "A2"
When tôi mở báo cáo
Then ô "Mã vị trí" hiển thị "999"
  And ô "Tên vị trí" hiển thị "<tên kệ ở A1>, <tên kệ ở A2>" — đủ hai mục, không gộp
```
> Bổ sung ngày 2026-09-12 theo A-18: bỏ tiền tố kho khiến hai kệ khác kho có thể cho cùng một
> mã, và `999, 999` là chuỗi vô nghĩa — đúng cái ADR-03 cũ lo.
> **Sửa ngày 2026-09-12 (ADR-06):** ô tên nay cũng không có tên kho, nên hai kệ trùng cả tên sẽ
> đọc ra `999, 999`. Akenzy được hỏi trực tiếp và chọn giữ đủ hai mục: số mục trong ô tên bằng
> số kệ thật, còn ô mã vẫn gộp. Hai ô lệch nhau về số mục là chủ ý.

## US-02 — Cột vị trí nhất quán ở các báo cáo doanh thu và lợi nhuận

Là kế toán, tôi muốn cột "Vị trí" ở báo cáo doanh thu/lợi nhuận đọc giống hệt báo cáo tồn,
để không phải nhớ báo cáo nào hiển thị kiểu gì.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-07** — Ba báo cáo còn lại cùng định dạng
```gherkin
Given mặt hàng A nằm trên hai kệ ở hai kho lưu trữ khác nhau
When tôi mở "Chi tiết doanh thu theo mặt hàng", "Doanh thu theo mặt hàng" và "Lợi nhuận theo mặt hàng"
Then cột mã vị trí ở cả ba báo cáo hiển thị cùng chuỗi "A101, A201"
  And cột tên vị trí (hai báo cáo có cột này) hiển thị "Kệ A101, Kệ A201"
```
> Sửa ngày 2026-09-12 (A-03 đảo). "Lợi nhuận theo mặt hàng" chỉ có một cột vị trí và nó lấy
> `loc.code`, nên nó hiện chuỗi mã: "A101, A201".

**AC-08** — Ba báo cáo này không lẫn kệ showroom
```gherkin
Given mặt hàng E không nằm trên kệ kho lưu trữ nào và chỉ còn tồn ở showroom
When tôi mở ba báo cáo doanh thu/lợi nhuận
Then ô vị trí của mặt hàng E để trống
```
> Giữ nguyên khác biệt cố ý giữa các báo cáo — lý do ở `item-warehouse-location.util.ts:39-45`.

**AC-13** — Cột vị trí ở ba báo cáo này đủ rộng cho trường hợp thường gặp
```gherkin
Given mặt hàng A nằm trên hai kệ ở hai kho lưu trữ
When tôi xem "Chi tiết doanh thu theo mặt hàng", "Doanh thu theo mặt hàng" và "Lợi nhuận theo mặt hàng" trên khung nhìn desktop 1440x900
Then ô vị trí ở cả ba báo cáo hiển thị trọn chuỗi "Kệ A101, Kệ A201" mà không bị CSS cắt
```
> Ô mã vị trí nay ngắn hơn hẳn ("A101, A201"), nhưng ô **tên** vị trí vẫn dài như trước, nên
> độ rộng 220 của T-02-03 vẫn cần — lấy chuỗi tên làm mốc đo (sửa 2026-09-12).
> **Sửa lại 2026-09-12 (ADR-06):** chuỗi mốc nay là `Kệ A101, Kệ A201`. Độ rộng 220 giữ nguyên,
> dư chứ không thiếu; AC-13 coi như đã pass bằng phép đo của T-02-03 với chuỗi dài hơn.
> Bổ sung ngày 2026-09-10 khi mở lại G1: kế hoạch ban đầu chỉ nới cột ở Tổng hợp nhập xuất
> tồn kho (AC-12), trong khi A-02 ("không giới hạn, chỉ nới rộng cột") và A-04 ("cả 4 báo
> cáo") áp cho cả bốn báo cáo.

## US-03 — Không làm hỏng bộ lọc và các chế độ xem sẵn có

Là support, tôi muốn mọi bộ lọc và chế độ xem của báo cáo hoạt động y như trước,
để việc sửa cột vị trí không kéo theo khiếu nại mới.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-09** — Dropdown "Kho" không đổi kết quả
```gherkin
Given tôi chọn một kho lưu trữ ở bộ lọc "Kho" của báo cáo Tổng hợp nhập xuất tồn kho
When báo cáo trả về
Then tập dòng và các số nhập/xuất/tồn giống hệt kết quả trước khi sửa
```

**AC-10** — Chế độ chuỗi và chọn nhiều cửa hàng giữ nguyên
```gherkin
Given tôi xem báo cáo ở chế độ chuỗi, hoặc chọn nhiều hơn một cửa hàng
When báo cáo trả về
Then hai cột vị trí bị loại khỏi danh mục cột (chế độ chuỗi), hoặc để trống (nhiều cửa hàng)
  And không có truy vấn tra vị trí nào được thực hiện
```

**AC-11** — Xuất Excel giữ đủ chuỗi
```gherkin
Given mặt hàng A nằm trên nhiều kệ
When tôi xuất báo cáo ra Excel
Then ô vị trí trong file chứa đầy đủ mọi cặp, không bị cắt
```

**AC-12** — Cột đủ rộng cho trường hợp thường gặp
```gherkin
Given mặt hàng A nằm trên hai kệ ở hai kho lưu trữ
When tôi xem báo cáo trên khung nhìn desktop 1440x900
Then ô "Mã vị trí" hiển thị trọn chuỗi mà không bị CSS cắt
```
> Sửa ngày 2026-09-12 (ADR-06): chuỗi mốc của ô tên co lại từ `Kho A1-Kệ A101, Kho A2-Kệ A201`
> xuống `Kệ A101, Kệ A201`. Độ rộng `320` mà T-01-04 đo được **giữ nguyên** — nay dư chứ không
> thiếu. Thu hẹp lại là việc khác, không nằm trong lần sửa này.

## US-04 — Kho quay lại báo cáo bằng một cột riêng

Là nhân viên kho, tôi muốn biết mặt hàng nằm ở **kho** nào mà không phải đọc lẫn trong ô vị trí,
để cột vị trí vẫn ngắn mà thông tin kho không mất.

**Priority:** must
**Depends on:** US-01

> Sinh ra 2026-09-12 khi mở lại G1 lần ba. ADR-06 bỏ tên kho khỏi ô "Tên vị trí" và hệ quả đã nêu
> trước với Akenzy là không cột nào còn nhắc tới kho. Đây là cách ADR-06 chỉ ra để đưa kho trở lại.

### Acceptance criteria

**AC-15** — Cột "Kho" liệt kê mọi kho của mặt hàng
```gherkin
Given mặt hàng A có kệ A101 ở kho "Kho A1" và kệ A201 ở kho "Kho A2"
When tôi mở báo cáo Tổng hợp nhập xuất tồn kho ở chế độ một chi nhánh
Then cột "Kho" hiển thị "Kho A1, Kho A2"
  And cột "Mã vị trí" vẫn hiển thị "A101, A201"
  And cột "Tên vị trí" vẫn hiển thị "Kệ A101, Kệ A201"
```

**AC-16** — Nhiều kệ trong cùng một kho gộp còn một tên kho
```gherkin
Given mặt hàng H nằm trên hai kệ A101 và A102, cả hai đều thuộc kho "Kho A1"
When tôi mở báo cáo
Then cột "Kho" hiển thị "Kho A1"
  And cột "Mã vị trí" hiển thị "A101, A102"
```
> Đây là lý do A-19 chốt khử trùng: không khử thì ô đọc thành `Kho A1, Kho A1`, đúng cái vô nghĩa
> mà ô mã đã tránh được ở A-18.

**AC-17** — Cột "Kho" có ở cả bốn báo cáo
```gherkin
Given mặt hàng A nằm trên hai kệ ở hai kho lưu trữ khác nhau
When tôi mở "Tổng hợp nhập xuất tồn kho", "Chi tiết doanh thu theo mặt hàng", "Doanh thu theo mặt hàng" và "Lợi nhuận theo mặt hàng"
Then cả bốn báo cáo đều có cột "Kho" và đều hiển thị "Kho A1, Kho A2"
```

**AC-18** — Cột "Kho" theo đúng mọi quy tắc sẵn có của cột vị trí
```gherkin
Given tôi xem báo cáo Tổng hợp nhập xuất tồn kho ở chế độ chuỗi, hoặc chọn nhiều cửa hàng
When báo cáo trả về
Then cột "Kho" bị loại khỏi danh mục cột (chế độ chuỗi), hoặc để trống (nhiều cửa hàng)
  And với mặt hàng chỉ còn tồn ở showroom, cột "Kho" hiện tên showroom ở báo cáo tồn và để trống ở ba báo cáo doanh thu/lợi nhuận
```
> Cột "Kho" đến từ đúng một lần gọi `resolveItemWarehouseLocations` như hai cột kia, nên nó thừa
> hưởng nguyên `showroomFallback` (A-08, A-09), quy tắc Ngừng theo dõi (A-12), và việc bị loại
> khỏi catalog ở chế độ chuỗi.

**AC-19** — Độ rộng ba cột chốt bằng phép đo, không ước lượng
```gherkin
Given mặt hàng A nằm trên hai kệ ở hai kho lưu trữ
When tôi xem cả bốn báo cáo trên khung nhìn desktop 1440x900 với dữ liệu thật
Then cột "Kho", "Mã vị trí" và "Tên vị trí" đều hiển thị trọn chuỗi mà không bị CSS cắt
  And số đo `scrollWidth`/`clientWidth` của từng ô được ghi lại trong ticket
```
> A-20. Thay thế phần "giữ nguyên 320/220" của AC-12 và AC-13: sau khi thêm cột thứ ba, tổng bề
> ngang đổi nên cả ba cột phải đo lại cùng lúc chứ không chốt từng cột một.

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Hiệu năng | Việc tra vị trí vẫn giới hạn ở phạm vi một trang và không phát sinh thêm truy vấn ngoài 4 truy vấn hiện có mỗi lần tra | T-01-01 |
| Tương thích | `resolveItemWarehouseLocations` đổi kiểu trả về; cả 4 nơi gọi phải biên dịch được và có test | T-01-03 |
| Hồi quy | Quy tắc "Ngừng theo dõi" của `2026090401-untracked-location-hidden` vẫn đúng ở dạng nhiều cặp | T-01-02 |
