---
feature: temp-warehouse-scan-add-line
stories: 3
acceptance_criteria: 13
---

# Requirements — Sửa luồng quét mã ở màn "Kho tạm"

Bối cảnh chung cho mọi kịch bản dưới đây: đang ở `/fast-stock-transfer`, phiên kho tạm
còn mở, đã chọn *Người vận chuyển*, con trỏ nằm trong ô *Hàng hóa*. Kịch bản áp dụng cho
**cả hai tab** *Xuất đi* và *Trả lại* (A-04).

---

## US-01 — Quét mã rồi Enter là dòng vào bảng

Là thủ kho, tôi muốn quét mã rồi bấm Enter một lần là dòng vào bảng,
để tay không phải rời máy quét trong suốt ca đẩy hàng.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Quét mã khớp tuyệt đối
```gherkin
Given mặt hàng "AKSK6769-N-41" có mã vạch khớp tuyệt đối trong catalog
When tôi quét mã đó (máy quét gõ chuỗi rồi gửi Enter)
Then một dòng mới cho đúng mặt hàng đó xuất hiện trong bảng
And tôi không phải bấm nút "Thêm" hay chạm chuột lần nào
```

**AC-02** — Vòng lặp quét liên tục
```gherkin
Given tôi vừa quét xong một mã và dòng đã vào bảng
When màn hình ổn định lại
Then ô "Người vận chuyển" vẫn giữ nguyên người tôi đã chọn
And ô "Hàng hóa" trống
And con trỏ nằm trong ô "Hàng hóa", sẵn sàng cho mã kế tiếp
```

**AC-03** — Chưa chọn người vận chuyển
```gherkin
Given ô "Người vận chuyển" đang trống
When tôi quét một mã khớp tuyệt đối rồi Enter
Then không có dòng nào được thêm
And màn hình báo "Vui lòng chọn người vận chuyển."
And con trỏ nhảy về ô "Người vận chuyển"
```

**AC-04** — Enter trên ô trống
```gherkin
Given ô "Hàng hóa" trống và chưa có mặt hàng nào được chọn
When tôi bấm Enter
Then không có dòng nào được thêm
And không có thông báo lỗi nào hiện ra
```

**AC-05** — Enter dồn khi đang tra mã
```gherkin
Given tôi quét một mã và lượt tra cứu chưa trả về
When phím Enter tới trước lúc tra cứu xong
Then đúng một dòng được thêm cho lần quét đó
And không có dòng trùng nào được thêm
```

---

## US-02 — Chọn hàng bằng bàn phím khi mã không khớp tuyệt đối

Là thủ kho, khi mã quét không khớp tuyệt đối (mặt hàng chưa gán mã vạch, mã có tiền tố
khác), tôi vẫn muốn chọn hàng bằng bàn phím thay vì phải rê chuột vào dropdown.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-06** — Không khớp tuyệt đối, có gợi ý
```gherkin
Given mã tôi quét không khớp tuyệt đối nhưng tìm gần đúng ra 3 mặt hàng
When danh sách gợi ý hiện ra
Then dòng đầu tiên đã được làm nổi sẵn
And bấm Enter chọn đúng dòng đang nổi rồi thêm dòng vào bảng
And tôi không phải chạm chuột lần nào
```

**AC-07** — Đổi lựa chọn bằng bàn phím
```gherkin
Given danh sách gợi ý đang mở với dòng đầu được làm nổi
When tôi bấm mũi tên xuống hai lần rồi Enter
Then mặt hàng ở dòng thứ ba được chọn và thêm vào bảng
```

**AC-08** — Không tìm ra gì
```gherkin
Given mã tôi quét không khớp tuyệt đối và tìm gần đúng cũng không ra kết quả
When tôi bấm Enter
Then không có dòng nào được thêm
And dropdown hiện "Không có kết quả."
And chuỗi tôi vừa quét vẫn còn trong ô để tôi sửa tay
```

**AC-09** — Không lây sang màn khác
```gherkin
Given tôi đang ở màn Bán hàng (Checkout) hoặc Đổi trả hàng
When tôi gõ vào ô tìm hàng hoặc mở bất kỳ dropdown PosSelect nào
Then không dòng nào được làm nổi sẵn
And hành vi Enter giống hệt trước khi có thay đổi này
```

---

## US-03 — Vị trí luôn là kệ của đúng mặt hàng đó

Là người kiểm phiếu, tôi cần cột *Vị trí* của mỗi dòng là kệ của chính mặt hàng đó,
để không phải đi tìm hàng ở kệ của mặt hàng quét trước nó.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-10** — Không giữ kệ của mặt hàng trước
```gherkin
Given ô "Vị trí" đang hiện "Y11.02" của mặt hàng vừa quét trước đó
When tôi quét một mặt hàng khác
Then ô "Vị trí" trống ngay lập tức
And chỉ được điền lại khi tra ra kệ của chính mặt hàng mới
```

**AC-11** — Dòng thêm ra mang đúng kệ
```gherkin
Given mặt hàng tôi quét có kệ ưu tiên trong kho nguồn
When tôi Enter ngay lập tức, trước khi lượt tra kệ trả về
Then dòng được thêm mang đúng kệ của mặt hàng đó
And không mang kệ của mặt hàng quét trước
```

**AC-12** — Không có kệ thì vẫn thêm được
```gherkin
Given mặt hàng tôi quét không có kệ ưu tiên trong kho nguồn
When tôi Enter
Then dòng vẫn được thêm vào bảng
And cột "Vị trí" của dòng đó để trống
```

**AC-13** — Dropdown không treo sau khi tự chọn hàng
```gherkin
Given tôi quét một mã khớp tuyệt đối và hệ thống tự chọn mặt hàng
When tên hàng hiện trong ô "Hàng hóa"
Then không còn khung "Không có kết quả." treo dưới ô
```

---

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Regression | Checkout / Đổi trả hàng / mọi `PosSelect` giữ nguyên hành vi — thay đổi ở `PosSearchPopover` phải là prop opt-in, mặc định = hành vi cũ | T-01-02 |
| Test | `apps/pos-web` có test vitest đầu tiên cho `PosSearchPopover` (highlight + Enter) và cho luồng Enter-thêm-dòng | T-01-04, T-03-03 |
| Kiểm chứng thật | Quét 20 mã liên tiếp (≥3 mã không khớp tuyệt đối) bằng máy quét thật: 20/20 dòng vào bảng, 0 lần chạm chuột, 20/20 cột *Vị trí* đúng kệ của chính mặt hàng | UOW-03 Demo script |
