---
feature: pos-employee-picker-branch-scope
stories: 2
acceptance_criteria: 13
---

# Requirements — Branch-scope hai picker nhân viên trong POS

Mọi AC dưới đây chạy với tài khoản **admin có `iam.user.read.all`** trừ khi nói khác. Đây là
tài khoản tái hiện lỗi: user thường vốn đã bị `EmployeeBranchScopeService` thu hẹp sẵn, nên
chạy bằng user thường thì cả hai màn "đã đúng" và không chứng minh được gì.

## US-01 — Chọn người vận chuyển ở màn Chuyển kho tạm

Là thu ngân POS, tôi muốn chọn được người vận chuyển trong danh sách nhân viên chi nhánh mình,
tìm nhanh bằng tên / email / mã nhân viên, để lập phiếu chuyển kho tạm mà không phải bỏ trống
trường này.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Mở ô khi chưa gõ gì
```gherkin
Given tôi đang đăng nhập POS ở chi nhánh B
And chi nhánh B có ít nhất một user active trong user_branch_assignments
When tôi focus ô "Người vận chuyển" mà chưa gõ ký tự nào
Then dropdown hiện danh sách nhân viên của chi nhánh B
And danh sách khác rỗng
```

**AC-02** — Tìm theo tên
```gherkin
Given dropdown "Người vận chuyển" đang mở ở chi nhánh B
When tôi gõ một phần họ hoặc tên của nhân viên thuộc chi nhánh B
Then dropdown chỉ còn những dòng khớp phần vừa gõ
```

**AC-03** — Tìm theo email
```gherkin
Given dropdown "Người vận chuyển" đang mở ở chi nhánh B
When tôi gõ một phần email của nhân viên thuộc chi nhánh B
Then dropdown hiện đúng nhân viên đó
```

**AC-04** — Tìm theo mã nhân viên
```gherkin
Given nhân viên X thuộc chi nhánh B và có hồ sơ HR với mã "NV000123"
When tôi gõ "NV000123" vào ô "Người vận chuyển"
Then dropdown hiện nhân viên X
And dòng của X hiển thị mã nhân viên, để thấy được vì sao nó khớp
```

**AC-05** — Cuộn để nạp thêm
```gherkin
Given chi nhánh B có nhiều hơn 20 user active
And dropdown "Người vận chuyển" đang mở
When tôi cuộn xuống đáy danh sách
Then trang kế tiếp được nạp và nối vào cuối danh sách
And không dòng nào bị lặp lại hay biến mất khỏi thứ tự đang có
```

**AC-06** — Đổi chi nhánh
```gherkin
Given tôi vừa xem danh sách người vận chuyển của chi nhánh B
When tôi đổi sang chi nhánh C rồi mở lại ô "Người vận chuyển"
Then danh sách là nhân viên của chi nhánh C
```

**AC-07** — Không rò nhân sự chi nhánh khác
```gherkin
Given nhân viên Y chỉ được gán chi nhánh C
When tôi ở chi nhánh B và gõ tên đầy đủ của Y vào ô "Người vận chuyển"
Then dropdown không có dòng nào là Y
```

## US-02 — Lọc báo cáo ngày theo nhân sự chi nhánh

Là quản lý cửa hàng, tôi muốn dropdown "Thu ngân" / "NVBH" / "Nhân viên" ở màn Báo cáo theo
ngày chỉ liệt kê nhân sự chi nhánh tôi đang đứng, để không phải dò trong danh sách cả chuỗi.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-08** — Dropdown Thu ngân theo chi nhánh
```gherkin
Given tôi đăng nhập POS ở chi nhánh B bằng tài khoản có iam.user.read.all
When tôi mở dropdown "Thu ngân" ở màn Báo cáo theo ngày
Then danh sách chỉ gồm user thuộc chi nhánh B
And ô "Nhân viên" ở panel bàn giao ca cũng vậy, vì dùng chung nguồn cashier
```

**AC-09** — Dropdown NVBH theo chi nhánh
```gherkin
Given tôi đăng nhập POS ở chi nhánh B bằng tài khoản có iam.user.read.all
When tôi mở dropdown "NVBH" ở màn Báo cáo theo ngày
Then danh sách chỉ gồm nhân viên bán hàng thuộc chi nhánh B
```

**AC-10** — Chặn branch không thuộc quyền
```gherkin
Given tôi gọi GET /reports/invoices/filter-options với branchId không nằm trong branchIds của token
When request được xử lý
Then API trả 403
And không trả về bất kỳ dòng nhân sự nào
```

**AC-11** — Backoffice hợp nhất không đổi
```gherkin
Given tôi mở báo cáo chain-store ở backoffice bằng tài khoản có reporting.invoice.consolidated.read
And request không kèm tham số branchId
When tôi mở dropdown "NV thu ngân" với phạm vi "tất cả cửa hàng"
Then danh sách vẫn gồm thu ngân của toàn hệ thống
```

## Non-functional

**AC-12** — Picker dùng chung không đổi hành vi
```gherkin
Given một call site khác của PosSearchPopover không truyền prop loadMore
When tôi mở picker đó và cuộn trong dropdown
Then nó vẫn cắt ở maxSuggestions gợi ý như trước
And không phát sinh request nào khi cuộn
```

**AC-13** — Hợp đồng lưu phiếu không đổi
```gherkin
Given tôi chọn một người vận chuyển rồi thêm dòng vào phiếu chuyển kho tạm
When request add-line được gửi
Then carrierUserId vẫn là users.id đúng như trước
And dòng đã lưu vẫn hiển thị đúng tên người vận chuyển khi tải lại
```

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Compatibility | Consumer khác của `PosSearchPopover` giữ nguyên hành vi (AC-12) | T-01-02 |
| Compatibility | Payload `carrierUserId` và đường hydrate carrier trên line giữ nguyên (AC-13) | T-01-03 |
| Governance | `employee-branch-scope.md` mô tả đúng scope thực tế; `employee-listing-surfaces.spec.ts` xanh | T-01-01, T-02-01 |
| Correctness | Phân trang có thứ tự ổn định (tiebreaker `u.id`) nên trang 2 không lặp dòng của trang 1 | T-01-01 |
| Security | `branchId` gửi lên luôn được đối chiếu `actor.branchIds` trước khi dùng làm scope | T-02-01 |
