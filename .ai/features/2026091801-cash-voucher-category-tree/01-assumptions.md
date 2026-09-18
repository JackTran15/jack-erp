---
feature: cash-voucher-category-tree
blocking_open: 0         # count of blocking + pending; must be 0 to pass G1
---

# Assumption register

Bốn quyết định Akenzy chốt ngày 18/09/2026 qua AskUserQuestion khi duyệt plan (D1–D4) được ghi thành A-03…A-06.

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Cột `parent_group_id` / trường `parentGroupId`, đặt tên giống Nhóm hàng hoá và Nhóm NCC, để `TreeSelectInput.buildTree` và `flattenCategoryTree` dùng lại không sửa | high | no | Phải thêm prop tên trường vào picker và helper; T-01-03/T-01-04 lớn hơn | confirmed | Akenzy duyệt plan 18/09/2026; cả hai entity cây hiện có đều dùng tên này (`item-category.entity.ts:26`, `supplier-group-crud.service.ts`) |
| A-02 | Mục con phải cùng `direction` (Thu/Chi) với mục cha; BE từ chối khi khác, và từ chối đổi loại của mục đang có con | high | yes | Cây có nhánh trộn Thu/Chi ⇒ dropdown lọc theo loại hiện mục con mà không có cha, hoặc ngược lại; báo cáo theo loại lệch | confirmed | Akenzy duyệt plan 18/09/2026 (plan ghi rõ luật này ở mục Design và ADR-04); suy từ việc 4 dialog lọc dropdown theo `direction` |
| A-03 | Dòng phiếu chọn được **bất kỳ** mục nào, cha hay con — giống Nhóm hàng hoá; không thêm validate ở BE khi lưu phiếu | high | no | Phải disable option cha trên 4 dialog và chặn ở `cash-receipts.service` / `cash-payments.service` | confirmed | Akenzy chọn "Bất kỳ mục nào" 18/09/2026 (D2) |
| A-04 | Xoá mục đang có mục con (chưa xoá mềm) bị **từ chối**; xoá mục lá vẫn xoá mềm như cũ | high | no | Phải mô phỏng `SET NULL` trong `beforeDelete` vì xoá mềm không kích FK | confirmed | Akenzy chọn "Từ chối xóa" 18/09/2026 (D1) |
| A-05 | 43 mục mặc định giữ **phẳng**: không sửa seeder, không migration dữ liệu; sau deploy mọi mục hiện có là mục gốc | high | no | Cần tên nhóm từ ảnh nguồn (repo không lưu) + migration dữ liệu + sửa `DEFAULT_CASH_VOUCHER_CATEGORIES` | confirmed | Akenzy chọn "Giữ phẳng, người dùng tự nhóm trên UI" 18/09/2026 (D4) |
| A-06 | Dropdown Mục thu / Mục chi trên 4 dialog hiện theo cây (mục con thụt lề bằng NBSP dưới mục cha), lấy từ endpoint cây | high | no | Nếu không cần: bỏ UOW-02, hook giữ nguyên | confirmed | Akenzy chọn "Có, hiển thị theo cây" 18/09/2026 (D3) |
| A-07 | Báo cáo (Kết quả kinh doanh `queryOtherCategories`, mobile `mobile-business-report.service.ts`) không cộng dồn con vào cha; mỗi mục vẫn một dòng | medium | no | Thêm UoW cộng dồn theo cây trong report — ngoài phạm vi feature này | confirmed | Ghi ở Out of scope của `00-intent.md`; Akenzy duyệt plan 18/09/2026 |
| A-08 | Không giới hạn độ sâu cây, chỉ chặn vòng (mọi tầng) và tự làm cha | medium | no | Thêm một điều kiện trong `beforeCreate/beforeUpdate` | confirmed | Cùng hành vi Nhóm hàng hoá (handler đệ quy không giới hạn); Akenzy duyệt plan 18/09/2026 |
| A-09 | Tổng quát hoá chế độ cây của `CrudListPage` qua `CRUD_TREE_ENTITIES` giữ Nhóm hàng hoá **y nguyên**: cùng `queryKey ["item-category-tree", { search }]`, cùng render, cùng dialog | high | yes | Trang Nhóm hàng hoá hỏng hoặc cache không invalidate sau nhập Excel (`ItemCategoriesPage` invalidate theo prefix `["item-category-tree"]`) | confirmed | Akenzy duyệt plan 18/09/2026; AC-10 là tiêu chí hồi quy, kiểm ở demo UOW-01 |
| A-10 | Picker "Mục cha" lọc theo loại đang chọn trên form chỉ là tiện ích phía client; luật BE (A-02) mới là hợp đồng. Khi form chưa chọn loại, picker hiện cả hai loại | high | no | Người dùng chọn nhầm cha khác loại rồi bị BE từ chối — vẫn đúng, chỉ kém tiện | confirmed | Akenzy duyệt plan 18/09/2026 (ADR-04) |
| A-11 | Hook `useCashVoucherCategories` đổi nguồn sang endpoint cây nhưng **không** lọc `isActive`, giữ `queryKey` và `staleTime` 5 phút, để `useCategoryNameMap` còn hiện tên mục đã tắt trên phiếu cũ | high | no | Phiếu cũ mất tên mục ở lưới / panel chi tiết | confirmed | Hành vi hiện tại (`use-cash-voucher-categories.ts:13-44` không lọc `isActive`); Akenzy duyệt plan 18/09/2026 |
| A-12 | Quyền cho endpoint cây là `accounting.cash_voucher_category.read` — đúng quyền `CrudPermissionGuard` đang đòi cho `GET /records` mà hook dropdown gọi, nên không vai trò nào mất dropdown (CASHIER có quyền này, `org-role-permissions.ts:207`) | high | no | Thu ngân mất dropdown mục thu/chi | confirmed | Đối chiếu `permissions.seed.ts:121-143` và `org-role-permissions.ts` 18/09/2026 |

## Rejected assumptions

| ID | Assumption | Rejected by | Consequence |
| --- | --- | --- | --- |
| — | Chưa có | | |
