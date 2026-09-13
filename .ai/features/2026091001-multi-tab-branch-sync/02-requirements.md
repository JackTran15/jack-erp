# Requirements — multi-tab-branch-sync

Từ vựng dùng thống nhất trong tài liệu này:

- **Chi nhánh của tab** — thứ tab đang hiển thị và tin là mình đang đứng:
  `useBranchStore.branchId` (backoffice) / `usePosBranchStore.branchId` (POS), nằm trong
  bộ nhớ từng tab.
- **Chi nhánh của phiên** — thứ server thực sự dùng để trả dữ liệu: `branchId` trong JWT,
  vì `@Actor` giải `jwt > header > jwtList` (`actor-context.decorator.ts:33`). Đọc gián
  tiếp qua `localStorage.active_branch_id` ở backoffice (A-03), trực tiếp từ
  `pos_access_token` ở POS (A-04).
- **Lệch** — chi nhánh của phiên **đã đổi sau khi tab này khởi tạo** (A-02). Không phải
  "khác với zustand".

---

## US-01 — Nhân viên backoffice mở nhiều tab, không bị đọc nhầm số liệu chi nhánh

**AC-01** — Phát hiện lệch khi quay lại tab

```gherkin
Given TAB A và TAB B cùng đăng nhập, cùng đứng ở "Chi nhánh Hà Nội"
And TAB B đổi sang "Chi nhánh Hồ Chí Minh" ở menu góc phải
When người dùng chuyển về TAB A (sự kiện focus / visibilitychange)
Then TAB A hiện dialog nêu đúng hai tên: chi nhánh của tab ("Hà Nội") và chi nhánh của
     phiên ("Hồ Chí Minh")
And dialog xuất hiện kể cả khi TAB A không gọi request nào trong lúc bị ẩn
```

**AC-02** — Dialog bắt buộc chọn

```gherkin
Given dialog lệch chi nhánh đang mở ở TAB A
When người dùng bấm Esc, click ra nền tối, hoặc tìm nút X
Then dialog vẫn mở, không có nút X, và không có đường nào đóng nó mà chưa chọn
```

**AC-03** — Chọn "Dùng chi nhánh mới"

```gherkin
Given dialog đang mở với chi nhánh mới là "Hồ Chí Minh"
When người dùng bấm "Dùng chi nhánh Hồ Chí Minh"
Then TAB A tải lại trang
And header hiện "Hồ Chí Minh"
And không có POST /auth/switch-branch nào được gọi (token dùng chung đã đúng chi nhánh)
And mọi lưới/báo cáo trên TAB A là dữ liệu Hồ Chí Minh
```

**AC-04** — Chọn "Quay về chi nhánh cũ"

```gherkin
Given dialog đang mở, chi nhánh của tab là "Hà Nội"
When người dùng bấm "Quay về Hà Nội"
Then POST /auth/switch-branch {branchId: <Hà Nội>} được gọi đúng MỘT lần
And localStorage.active_branch_id trở lại Hà Nội
And TAB A tải lại và hiện Hà Nội ở cả header lẫn dữ liệu
```

**AC-05** — Tab tự đổi chi nhánh không tự hỏi lại chính nó

```gherkin
Given TAB B là tab đang thao tác
When TAB B đổi chi nhánh ở menu góc phải
Then TAB B không hiện dialog lệch chi nhánh, trước hay sau lần reload của nó
```

**AC-06** — Không lệch thì không có dialog

```gherkin
Given người dùng chỉ mở một tab, hoặc vừa tải lại trang, hoặc vừa đăng nhập
When tab được focus
Then không có dialog nào xuất hiện
```

**AC-07** — Hết đường âm thầm đổi tên chi nhánh trên header

```gherkin
Given TAB A đang đứng ở "Hà Nội" và chi nhánh của phiên đã là "Hồ Chí Minh"
When effect ở BranchSelector.tsx:59-66 chạy
Then nó chỉ giải TÊN cho branchId hiện tại của tab
And nó KHÔNG tự ghi branchId của tab sang giá trị mới trong localStorage
And đường xử lý chi nhánh ngừng hoạt động (BranchSelector.tsx:75-97) vẫn chạy nguyên như
    hôm nay: chi nhánh biến mất khỏi /branches/me thì tự chuyển kèm toast, không qua dialog
```

**AC-08** — Đăng xuất ở tab khác không bật dialog chi nhánh

```gherkin
Given TAB B đăng xuất, clearSession() xoá refresh_token và active_branch_id
When người dùng chuyển về TAB A
Then TAB A không hiện dialog lệch chi nhánh
And TAB A đi đúng đường phiên hết hạn sẵn có (401 → /login)
```

---

## US-02 — Thu ngân POS mở nhiều tab, không bán nhầm kho chi nhánh khác

**AC-09** — Phát hiện lệch ở POS

```gherkin
Given hai tab POS cùng phiên, cùng đứng ở "Hà Nội"
And tab B đổi sang "Hồ Chí Minh" ở ô chọn chi nhánh trên thanh trên
When người dùng chuyển về tab A
Then tab A hiện dialog POS nêu đúng hai tên và không đóng được nếu chưa chọn
```

**AC-10** — Hết đường tự cướp phiên

```gherkin
Given tab A đang lệch chi nhánh và người dùng chưa chọn gì trong dialog
When effect đồng bộ token ở PosLocationIndicator.tsx:38-57 chạy (mount, đổi route)
Then KHÔNG có POST /auth/switch-branch nào được bắn từ tab A
```

**AC-11** — POS chọn "Dùng chi nhánh mới"

```gherkin
Given dialog POS đang mở, chi nhánh của phiên là "Hồ Chí Minh"
When thu ngân bấm "Dùng chi nhánh Hồ Chí Minh"
Then usePosBranchStore mang "Hồ Chí Minh" và vỏ POS hiện tên đó
And resetCheckoutSelections() và queryClient.clear() được gọi (giỏ hàng trống)
And KHÔNG có POST /auth/switch-branch nào được gọi (A-11)
```

**AC-12** — POS chọn "Quay về chi nhánh cũ"

```gherkin
Given dialog POS đang mở, chi nhánh của tab là "Hà Nội"
When thu ngân bấm "Quay về Hà Nội"
Then POST /auth/switch-branch {branchId: <Hà Nội>} được gọi đúng MỘT lần
And giỏ hàng và cache bị xoá như đường đổi chi nhánh thường
And vỏ POS hiện "Hà Nội"
```

**AC-13** — Ca đồng bộ token hợp lệ vẫn chạy

```gherkin
Given thu ngân vừa đăng nhập POS, JWT mang chi nhánh mặc định khác chi nhánh đã persist
When PosLocationIndicator mount
Then nó vẫn tự gọi switch-branch để kéo token về chi nhánh đã chọn, đúng như hôm nay
And không có dialog nào xuất hiện (đây không phải lệch — A-02)
```

---

## US-03 — Người dùng biết mình sắp mất gì

**AC-14** — Dialog nói rõ hệ quả

```gherkin
Given dialog lệch chi nhánh đang mở
Then dialog ghi rõ dữ liệu chưa lưu trên trang này sẽ mất khi đổi
And ở POS ghi thêm giỏ hàng đang mở sẽ bị xoá
And khi chọn "quay về chi nhánh cũ", dialog nói trước rằng tab kia sẽ được hỏi lại
```
