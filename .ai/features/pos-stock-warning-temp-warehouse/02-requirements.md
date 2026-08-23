---
feature: pos-stock-warning-temp-warehouse
stories: 4
acceptance_criteria: 12
---

# Requirements — Cảnh báo vượt tồn cộng kho tạm

Từ vựng dùng chung trong tài liệu này:

- **tồn showroom** — `Σ stock_balances` ở các vị trí thuộc storage có `is_main_storage = true`
  của chi nhánh (trường `showroomQuantity` hôm nay).
- **dòng kho tạm đang mở** — `temp_warehouse_lines.status = ACTIVE` thuộc một
  `temp_warehouse_sessions.status = ACTIVE` của chính chi nhánh đó.
- **ngưỡng** — con số mà POS so với SL của dòng bán để quyết định có cảnh báo hay không
  (`CartLine.maxQty`).

## US-01 — Hàng đã mang ra quầy được tính vào ngưỡng

Là thu ngân, tôi muốn hàng vừa quét vào kho tạm được tính ngay vào tồn khả dụng,
để không phải bấm qua dialog bán khống cho một giao dịch bình thường.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Happy path
```gherkin
Given chi nhánh có phiên kho tạm chiều warehouse_to_showroom đang mở
And SKU BX140 có tồn showroom 4 và 3 đơn vị đã quét vào kho tạm chiều đó
When tôi thêm BX140 vào giỏ với SL 6
Then dòng không hiện chấm đỏ
And tooltip tồn của dòng ghi "Tồn: 7"
And bấm Thu tiền không hiện dialog "Cảnh báo xuất quá số lượng tồn"
```

**AC-02** — Vượt ngưỡng mới
```gherkin
Given SKU BX140 có tồn showroom 4 và 3 đơn vị ở kho tạm chiều warehouse_to_showroom
When tôi nhập SL 8 cho dòng BX140
Then dòng hiện chấm đỏ
And dialog "Cảnh báo xuất quá số lượng tồn" liệt kê BX140 với Số lượng tồn = 7
```

**AC-03** — Không có phiên nào đang mở
```gherkin
Given chi nhánh không có phiên kho tạm nào ở trạng thái ACTIVE
And SKU BX140 có tồn showroom 4
When tôi nhập SL 5 cho dòng BX140
Then dòng hiện chấm đỏ với Số lượng tồn = 4
```

**AC-04** — Dòng đã bị hoá đơn tiêu thụ không cộng lần hai
```gherkin
Given 3 đơn vị BX140 đã quét vào kho tạm và một hoá đơn trước đó đã tiêu thụ trọn 3 đơn vị đó
And phiên kho tạm vẫn đang mở
And tồn showroom BX140 sau hoá đơn đó là 1
When tôi thêm BX140 vào giỏ
Then ngưỡng của dòng là 1
```

## US-02 — Hàng đang chờ trả về kho bị trừ khỏi ngưỡng

Là quản lý, tôi muốn hàng đã quét để trả về kho lưu trữ không còn được tính là bán được,
để cảnh báo bám theo hàng thật sự còn ở quầy.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-05** — Trừ chiều s2w
```gherkin
Given chi nhánh có phiên kho tạm chiều showroom_to_warehouse đang mở
And SKU BX140 có tồn showroom 4 và 1 đơn vị đã quét vào phiên đó
When tôi nhập SL 4 cho dòng BX140
Then dòng hiện chấm đỏ với Số lượng tồn = 3
```

**AC-06** — Hai chiều cùng mở
```gherkin
Given SKU BX140 có tồn showroom 4, 3 đơn vị ở phiên warehouse_to_showroom và 1 đơn vị ở phiên showroom_to_warehouse
When tôi thêm BX140 vào giỏ
Then ngưỡng của dòng là 6
```

## US-03 — Ba đường đưa hàng vào giỏ cùng một ngưỡng

Là thu ngân, tôi muốn con số tồn giống nhau dù tôi gõ tìm, quét mã hay chọn biến thể,
để không phải đoán đường nào cho số đúng.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-07** — Quét mã vạch / SKU
```gherkin
Given SKU BX140 có tồn showroom 4 và 3 đơn vị ở kho tạm chiều warehouse_to_showroom
When tôi quét mã vạch của BX140 ở ô tìm kiếm
Then dòng vào giỏ với ngưỡng 7
```

**AC-08** — Dialog chọn biến thể
```gherkin
Given sản phẩm có biến thể BX140 với tồn showroom 4 và 3 đơn vị ở kho tạm chiều warehouse_to_showroom
When tôi mở dialog chọn biến thể của sản phẩm đó
Then dòng biến thể BX140 hiển thị Tồn 7
And chọn nó đưa vào giỏ một dòng có ngưỡng 7
```

**AC-09** — Gõ tìm theo tên
```gherkin
Given SKU BX140 có tồn showroom 4 và 3 đơn vị ở kho tạm chiều warehouse_to_showroom
When tôi gõ tên sản phẩm vào ô tìm kiếm và chọn kết quả
Then dòng vào giỏ với ngưỡng 7
```

## US-04 — Không đếm hai lần, không đổi thứ khác

Là kỹ sư bảo trì, tôi muốn phép cộng mới không phá các consumer sẵn có,
để feature này không sinh ra lỗi ở màn khác.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-10** — Dòng kho tạm không vượt ranh giới showroom thì không điều chỉnh
```gherkin
Given một phiên kho tạm chiều warehouse_to_showroom được ghim vị trí nguồn nằm trong chính main storage của chi nhánh
And SKU BX140 có tồn showroom 4 (đã bao gồm 3 đơn vị ở vị trí nguồn đó) và 3 đơn vị đã quét
When tôi thêm BX140 vào giỏ
Then ngưỡng của dòng là 4
```

**AC-11** — `quantityOnHand` và Chuyển kho nhanh không đổi
```gherkin
Given SKU BX140 có tồn showroom 4, tồn kho lưu trữ 8 và 3 đơn vị ở kho tạm
When màn Chuyển kho nhanh đọc catalog của chi nhánh
Then quantityOnHand của BX140 vẫn là 12
And danh sách dòng kho tạm của màn đó không đổi
```

**AC-12** — Không thu hẹp catalog
```gherkin
Given SKU chỉ có tồn ở kho lưu trữ, không có tồn showroom, không có dòng kho tạm
When tôi tìm SKU đó trên màn bán hàng
Then nó vẫn xuất hiện trong kết quả với ngưỡng 0
And tôi vẫn bán khống được sau khi xác nhận
```

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Hiệu năng | Gom kho tạm bằng **một** truy vấn cho cả chi nhánh — không N+1 theo mặt hàng, không thêm truy vấn cho mỗi dòng catalog. Cộng dồn và quyết định dấu chạy trên RAM, không `GROUP BY` (ADR-03) | T-01-01 |
| Ngôn ngữ | Source backend tiếng Anh (comment, tên trường, thông báo lỗi); chuỗi UI tiếng Việt | T-01-01, T-02-01 |
| Đổi tên có tripwire | `PosCatalogLineDto.showroomQuantity` → `sellableQuantity` (ADR-02) trên cả hai DTO; `pnpm openapi:generate` chạy lại và `packages/api-client/src/generated/schema.ts` được commit. Đường đọc nào quên phải cho ra `undefined` (⇒ luôn cảnh báo), không được cho ra một con số sai | T-01-03 |
| An toàn mặc định | Payload thiếu trường tồn vẫn phải bị coi là "chưa xác định được tồn" và luôn cảnh báo (hành vi `readShowroomOnHand` hiện có, không được nới) | T-02-02 |
