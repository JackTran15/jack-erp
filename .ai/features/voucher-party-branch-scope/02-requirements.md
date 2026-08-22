---
feature: voucher-party-branch-scope
stories: 5
acceptance_criteria: 13
---

# Requirements — Ô "Đối tượng" chỉ liệt kê nhân viên của chi nhánh đang làm việc

Quy ước dùng xuyên suốt: **"chi nhánh đang làm việc"** = `ActorContext.branchId`
(jwt > header `X-Branch-Id` > `branchIds[0]`). **"Nhân viên của chi nhánh"** = có ít nhất
một dòng `user_branch_assignments (user_id, branch_id)` trỏ tới chi nhánh đó.

Dữ liệu mẫu dùng cho mọi AC dưới đây, đọc từ `erp_dev` chứ không bịa:

```sql
SELECT u.email, string_agg(b.name, ', ') FROM users u
LEFT JOIN user_branch_assignments uba ON uba.user_id = u.id
LEFT JOIN branches b ON b.id = uba.branch_id
WHERE u.organization_id::text = '<My Company>' GROUP BY u.id, u.email;
-- admin@erp.local      | Hồ Chí Minh, Hà Nội   ← có iam.user.read.all
-- staff-hcm@erp.local  | Hồ Chí Minh
-- staff-hn@erp.local   | Hà Nội
-- staff-03@erp.local   | Hà Nội, Hồ Chí Minh
```

Nghĩa là: đứng ở **Hà Nội**, một tài khoản *không* có `iam.user.read.all` phải thấy 3
nhân viên và **không** thấy `staff-hcm@erp.local`.

---

## US-01 — Phiếu nhập/xuất/chuyển kho chỉ mời nhân viên cùng chi nhánh

Là nhân viên kho, tôi muốn ô **Đối tượng** chỉ liệt kê người của chi nhánh mình,
để không phải tự nhớ ai thuộc đâu và không chọn nhầm.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Happy path
```gherkin
Given tôi đăng nhập chi nhánh "Hà Nội" và không có quyền iam.user.read.all
When tôi POST /v2/counterparties/search với type = "employee"
Then kết quả chứa staff-hn và staff-03
And không chứa staff-hcm
```

**AC-02** — Tìm kiếm không vượt mặt bộ lọc
```gherkin
Given tôi đăng nhập chi nhánh "Hà Nội" và không có quyền iam.user.read.all
When tôi POST /v2/counterparties/search với type = "employee" và search = "HCM"
Then kết quả rỗng và total = 0
```

**AC-03** — Loại "Tất cả" trộn đúng
```gherkin
Given tôi đăng nhập chi nhánh "Hà Nội" và không có quyền iam.user.read.all
When tôi POST /v2/counterparties/search với type = "all"
Then phần nhân viên đã bị lọc theo chi nhánh
And số lượng nhà cung cấp và khách hàng không đổi so với trước khi sửa
And "total" bằng đúng tổng số dòng thực sự trả về được qua mọi trang
```

**AC-04** — Nhân viên chưa gán chi nhánh
```gherkin
Given có một nhân viên đang hoạt động không có dòng nào trong user_branch_assignments
When tôi mở ô Đối tượng > Nhân viên ở bất kỳ chi nhánh nào, không có quyền iam.user.read.all
Then nhân viên đó không xuất hiện
```

---

## US-02 — Phiếu thu/chi chỉ mời nhân viên cùng chi nhánh

Là kế toán quỹ chi nhánh, tôi muốn cả ô **Đối tượng** lẫn ô **Nhân viên thu/chi** trên
phiếu thu, phiếu chi và phiếu thu/chi tiền gửi chỉ liệt kê người của chi nhánh mình.

**Priority:** must
**Depends on:** US-01 (dùng chung vị ngữ lọc)

### Acceptance criteria

**AC-05** — Ô Đối tượng trên phiếu thu/chi
```gherkin
Given tôi đăng nhập chi nhánh "Hà Nội" và không có quyền iam.user.read.all
When tôi GET /cash-vouchers/partners?type=employee
Then kết quả chứa staff-hn và staff-03
And không chứa staff-hcm
```

**AC-06** — Ô "Nhân viên thu/chi" dùng chung một đường
```gherkin
Given tôi mở phiếu chi ở chi nhánh "Hà Nội" và không có quyền iam.user.read.all
When tôi bấm chọn ở ô "Nhân viên chi"
Then hộp thoại tìm kiếm nhân viên không liệt kê staff-hcm
```

**AC-07** — Đếm đúng sau khi lọc
```gherkin
Given tôi đăng nhập chi nhánh "Hà Nội" và không có quyền iam.user.read.all
When tôi GET /cash-vouchers/partners?type=all
Then "total" đếm trên tập đã lọc, không phải tập trước lọc
And trang cuối không trả về dòng rỗng
```

---

## US-03 — Bộ lọc Thu ngân / NVBH trên báo cáo chỉ liệt kê nhân viên cùng chi nhánh

Là người xem báo cáo, tôi muốn hai dropdown này chỉ còn nhân sự chi nhánh đang xem,
để không phải lướt qua hàng trăm cái tên không bao giờ có giao dịch ở đây.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-08** — Thu ngân
```gherkin
Given tôi đăng nhập chi nhánh "Hà Nội" và không có quyền iam.user.read.all
When tôi GET /reports/invoices/filter-options?type=cashier
Then kết quả không chứa staff-hcm
```

**AC-09** — Nhân viên bán hàng
```gherkin
Given tôi đăng nhập chi nhánh "Hà Nội" và không có quyền iam.user.read.all
When tôi GET /reports/invoices/filter-options?type=salesperson
Then kết quả không chứa hồ sơ nhân viên của staff-hcm
And các loại filter khác (store, customer, product_group…) trả về y như trước
```

---

## US-04 — Không phá thứ đang chạy

Là quản trị viên, tôi vẫn phải lập được phiếu hộ chi nhánh khác, và mọi phiếu cũ vẫn
phải đọc được tên đối tượng của nó.

**Priority:** must
**Depends on:** US-01, US-02, US-03

### Acceptance criteria

**AC-10** — Quyền tổng không bị lọc
```gherkin
Given tôi đăng nhập bằng admin@erp.local (có iam.user.read.all) ở chi nhánh "Hà Nội"
When tôi gọi lần lượt cả 4 nguồn liệt kê nhân viên
Then cả 4 đều trả về đủ 4 nhân viên của tổ chức, gồm cả staff-hcm
```

**AC-11** — Phiếu cũ vẫn đọc được tên
```gherkin
Given tồn tại một phiếu nhập kho ở "Hà Nội" có đối tượng là staff-hcm
When tôi mở lại phiếu đó ở chi nhánh "Hà Nội" không có quyền iam.user.read.all
Then ô Đối tượng hiển thị đúng mã và tên của staff-hcm
```

**AC-12** — Fail-closed khi không có chi nhánh
```gherkin
Given actor không giải được branchId nào (branchIds rỗng và không có header)
When tôi gọi bất kỳ nguồn nào trong 4 nguồn, không có quyền iam.user.read.all
Then danh sách nhân viên trả về rỗng, không phải trả về toàn bộ tổ chức
```

---

## US-05 — Chứng minh không còn bề mặt nào rò

Là người review, tôi muốn một bằng chứng chạy được rằng không còn nguồn thứ 5, thay vì
một lời khẳng định trong mô tả PR.

**Priority:** should
**Depends on:** US-01, US-02, US-03

### Acceptance criteria

**AC-13** — Rà soát có bằng chứng
```gherkin
Given toàn bộ apps/api/src/modules
When tôi liệt kê mọi truy vấn trả về danh sách users hoặc employee_profiles cho UI chọn
Then mỗi truy vấn hoặc áp vị ngữ chi nhánh, hoặc được ghi rõ trong 01-assumptions.md vì sao không cần
And danh sách này nằm trong repo dưới dạng test hoặc tài liệu, không chỉ trong hội thoại
```

---

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Performance | Vị ngữ lọc không thêm round-trip DB nào cho mỗi lần gõ phím: dùng `EXISTS` subquery trong cùng câu truy vấn, không phải nạp trước danh sách id | T-01-01 |
| Performance | Nhánh kiểm quyền bypass đọc `RbacService.getUserPermissions` (đã cache Redis), không truy vấn `user_roles` mỗi request | T-01-01 |
| Bảo mật | Lọc thực hiện ở server. Không có tham số nào từ client được phép nới rộng phạm vi | T-01-01, T-02-01, T-03-01 |
| Tương thích | Không đổi hợp đồng HTTP: không thêm/bớt trường request hay response ở cả 4 endpoint | T-04-01 |
