---
feature: customer-points-ui-fixes
stories: 6
acceptance_criteria: 25
---

# Requirements — Điểm thành viên, tương phản bảng, Quản lý vai trò, dòng trống CTKM

**[UI]** = chứng minh bằng ảnh chụp trình duyệt. **[e2e]** = `apps/api/test/e2e`.
**[unit]** = vitest (backoffice) hoặc jest (api).
Khoá quyền: `ADJ` = `customer.points.adjust`, `HIS` = `customer.points.history.read`.

---

## US-01 — Xem mã thẻ và đặt lại số dư điểm (T1)

- **AC-01** — *Given* khách hàng có thẻ `card_number = MT0001`, hạng Bạc, 120 điểm, *When* mở form sửa (`/admin/customers/:id/edit`) hoặc trang chi tiết, *Then* khối *Thẻ thành viên* hiện Mã thẻ `MT0001`, Hạng, Điểm `120`; mã thẻ không sửa được **[UI]**.
- **AC-02** — *Given* người dùng giữ `ADJ`, thẻ 120 điểm, *When* `PUT /customers/:id/membership-card/points { points: 200, note: "Bù điểm" }`, *Then* 200, `points = 200`, `point_history` có đúng **một** dòng mới `type = adjust`, `delta = +80`, `note = "Bù điểm"`, `created_by` = người gọi **[e2e]**.
- **AC-03** — *Given* thẻ 200 điểm, *When* đặt `points: 50`, *Then* dòng `adjust` `delta = -150`, số dư 50 **[e2e]**.
- **AC-04** — *Given* thẻ 50 điểm, *When* đặt `points: 50`, *Then* 200, số dư 50, **không** có dòng `point_history` mới (A-16) **[e2e]**.
- **AC-05** — *Given* body `points: -1`, `points: 1.5`, hoặc thiếu `note`/`note` rỗng, *Then* 400 **[e2e]**.
- **AC-06** — *Given* người dùng chỉ có `customer.write`, không có `ADJ`, *When* gọi PUT, *Then* 403; *And* trên UI không thấy nút *Điều chỉnh điểm* **[e2e]** **[UI]**.
- **AC-07** — *Given* khách hàng chưa có thẻ, *When* PUT, *Then* 404 `"Khách hàng chưa có thẻ thành viên"`; *And* UI hiện "Chưa có thẻ", không có nút **[e2e]** **[UI]**.
- **AC-08** — *Given* khách hàng thuộc tổ chức khác, *When* PUT, *Then* 404 **[e2e]**.
- **AC-09** — *Given* dialog *Điều chỉnh điểm*, *When* nhập 200 + lý do rồi Lưu, *Then* dialog đóng, toast thành công, khối *Thẻ thành viên* hiện 200 không cần tải lại trang **[UI]**.

## US-02 — Lịch sử điểm có phân quyền (T1)

- **AC-10** — *Given* thẻ có 3 dòng sổ cái (earn từ hóa đơn `HD0001`, redeem, adjust), *When* `GET /customers/:id/point-history?page=1&limit=20` với `HIS`, *Then* 200, `total = 3`, mới nhất trước, mỗi dòng có `createdAt, type, delta, invoiceId, invoiceCode, note, createdByName`; dòng earn có `invoiceCode = HD0001` **[e2e]**.
- **AC-11** — *Given* người dùng có `customer.read` nhưng không có `HIS`, *When* GET, *Then* 403 **[e2e]**.
- **AC-12** — *Given* người dùng có `HIS`, *When* mở chi tiết khách hàng, *Then* có tab *Lịch sử điểm* hiển thị bảng (Ngày, Loại, Điểm ±, Hóa đơn, Ghi chú, Người thực hiện) có phân trang; *Given* không có `HIS`, *Then* không có tab **[UI]**.
- **AC-13** — *Given* migration cấp quyền chạy trên DB có vai trò giữ `customer.merge`, *Then* vai trò đó có cả `ADJ` và `HIS`; vai trò chỉ giữ `customer.read`/`customer.write` thì không (A-06) **[e2e]**.
- **AC-14** — *Given* màn *Quản lý vai trò*, *Then* hai quyền mới hiện với nhãn tiếng Việt trong nhóm *Khách hàng* **[unit]** (`PERMISSION_LABELS_VI` có đủ khoá) **[UI]**.

## US-03 — Tương phản dòng bảng (T2)

- **AC-15** — *Given* một trang danh sách dùng `BaseDataTable` (vd *Phiếu nhập kho*), *Then* dòng chẵn nền trắng, dòng lẻ nền xám, hai màu phân biệt rõ trên theme `misa`; cột ghim cùng màu sọc với dòng **[UI]**.
- **AC-16** — *Given* bảng có `onRowClick`, *When* rê chuột lên một dòng, *Then* cả dòng **kể cả cột ghim** tô xanh **[UI]**.
- **AC-17** — *Given* dòng đang chọn (vd dòng được bấm ở *Đơn mua hàng*, *Quản lý vai trò*), *Then* cả dòng **kể cả cột ghim** tô tím, khác màu hover; rê chuột lên dòng đang chọn vẫn giữ tím **[UI]**.
- **AC-18** — *Given* lưới nhập dòng `LineItemGrid` (vd CTKM *Giảm giá hàng hóa*, *Phiếu nhập kho* chi tiết), *Then* sọc và hover dùng cùng token với AC-15/16 **[UI]**.

## US-04 — Quản lý vai trò tải nhanh (T3)

- **AC-19** — *Given* `GET /admin/users`, *Then* mỗi phần tử có `roleIds: string[]` đúng với `user_roles` của tổ chức; số truy vấn không tăng theo số người dùng (một truy vấn `IN`) **[e2e]**.
- **AC-20** — *Given* mở `/role-management` với ~120 người dùng, *Then* trang không gọi `GET /admin/users/{id}`; tổng XHR lúc tải ≤ 3 (`/admin/roles` + các trang `/admin/users`); chọn một vai trò hiện đúng danh sách người dùng của vai trò đó; gán/bỏ người dùng rồi Lưu vẫn đúng như trước **[UI]**.

## US-05 — CTKM bỏ dòng trống khi lưu (T4)

- **AC-21** — *Given* form *Giảm giá hàng hóa* có các dòng: hợp lệ (`targetId` + `code`), không `targetId`, có `targetId` nhưng `code` rỗng (dòng cũ không phân giải được), *When* `itemDiscountToDto`, *Then* `rewardLines` chỉ chứa dòng hợp lệ và `sortOrder` liên tục từ 0 **[unit]** (`promotion.mapper.spec.ts`). *And* trên trình duyệt: lưu rồi mở lại không còn dòng trống ở giữa **[UI]**.

## US-06 — Tương phản dòng trên mọi bảng backoffice (T2 mở rộng, reopen G3)

- **AC-22** — *Given* một màn báo cáo (`ReportPageTableView`, vd *Báo cáo bán hàng theo hàng hoá*), *Then* sọc, hover và cột ghim dùng cùng token với AC-15/16 (đo màu DOM) **[UI]**.
- **AC-23** — *Given* một trang `BaseDataTable` có cột chọn (vd danh mục *Hàng hoá* qua `CrudListPage`, *Chương trình KM*, *Phiếu thu tiền mặt*), *When* tick một dòng hoặc bấm chọn dòng, *Then* dòng đó tô tím `--table-row-selected` kể cả cột ghim (A-19) **[UI]**.
- **AC-24** — *Given* mã nguồn `apps/backoffice-web/src` (trừ `lib/print/`), *Then* mọi `<table` hoặc nằm trong `BaseDataTable`/`LineItemGrid`/`ReportPageTableView`, hoặc mang class `erp-data-table`, hoặc có comment miễn `table-contrast: exempt` (A-22) **[unit]** (`table-contrast-coverage.test.ts`).
- **AC-25** — *Given* một bảng tự viết đại diện mỗi nhóm (popup tra cứu, chi tiết đơn hàng, lưới CTKM tặng hàng, chi tiết phiếu quỹ, chi tiết kiểm kê), *Then* sọc trắng/xám, hover xanh, dòng chọn (nếu bảng có chọn) tím **[UI]**.

