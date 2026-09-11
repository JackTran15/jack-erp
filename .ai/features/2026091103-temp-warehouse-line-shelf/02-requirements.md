---
feature: temp-warehouse-line-shelf
stories: 1
acceptance_criteria: 7
---

# Requirements — temp-warehouse-line-shelf

## US-01 — Kho tạm hiện đúng kệ của dòng

Là thu ngân ở màn Kho tạm, tôi muốn cột Vị trí luôn là kệ mà mặt hàng được quét, để đi lấy đúng kệ.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Tải lưới
```gherkin
Given dòng "Xuất đi" có sourceLocationId là kệ A05.03, trong phiên có kệ kho là A01.01
When lưới Kho tạm tải
Then cột "Vị trí" của dòng là A05.03
```

**AC-02** — Sửa → Lưu không đổi kệ
```gherkin
Given dòng đó, sau khi tải lại trang
When tôi bấm "Sửa" rồi "Lưu" mà không đổi vị trí
Then cột "Vị trí" vẫn là A05.03
And sourceLocationId của dòng không đổi
```

**AC-03** — Dòng đã bị ghi sai hiển thị đúng
```gherkin
Given dòng có notes = "A01.01" nhưng sourceLocationId là kệ A05.03
When lưới tải
Then cột "Vị trí" là A05.03
```

**AC-04** — Tab "Trả lại"
```gherkin
Given dòng "Trả lại" có sourceLocationId là kệ T05.05 của kho lưu trữ
When lưới tải, và sau khi "Sửa" rồi "Lưu"
Then cột "Vị trí" là T05.05
```

**AC-05** — Dòng không có id kệ
```gherkin
Given dòng không có sourceLocationId, hoặc kệ đó không còn tra được, và notes = "B10.03"
When lưới tải
Then cột "Vị trí" là "B10.03"
And nếu không có cả hai thì cột để trống
```

**AC-06** — Lọc cột theo đúng giá trị đang hiển thị
```gherkin
Given dòng hiển thị Vị trí A05.03 nhưng notes cũ là "A01.01"
When tôi gõ "A05" vào ô lọc cột "Vị trí"
Then dòng đó vẫn còn trong lưới
```

**AC-07** — API trả kệ của từng dòng
```gherkin
Given một phiên có hai dòng quét từ hai kệ khác nhau
When gọi API danh sách dòng kho tạm
Then mỗi dòng có sourceShelf = { id, code, name } của chính sourceLocationId của dòng đó
And sourceLocation và destinationLocation giữ nguyên là kệ của phiên
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Hiệu năng | Danh sách dòng kho tạm gom id kệ của dòng vào **cùng một** lượt `loadLocations` theo `IN (...)`, không truy vấn theo từng dòng | T-01-01 |
