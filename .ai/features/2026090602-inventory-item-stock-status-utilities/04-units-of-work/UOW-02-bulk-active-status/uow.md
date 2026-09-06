---
id: UOW-02
slug: bulk-active-status
title: Tiện ích — đổi trạng thái kinh doanh cho nhiều dòng một lượt
demoable: true
duration: 1d
depends_on: []
requirements: [US-02]
verifies: [AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20]
risk: medium
status: todo
rollback: trả `onClick` của action `utilities` về `soon(...)` — route BE mới không có caller nào khác nên nằm im vô hại
---

# UOW-02 — Menu "Tiện ích": Đang kinh doanh / Ngừng kinh doanh

## Demo script
1. Đăng nhập backoffice, mở **Danh mục > Hàng hoá**.
2. Tick 5 dòng, trong đó cố ý chọn **ít nhất một dòng có nhiều biến thể** (cột số lượng mặt
   hàng > 1) — đây là ca dễ hỏng im lặng nhất.
3. Bấm **Tiện ích** → thấy đúng hai mục **Đang kinh doanh** / **Ngừng kinh doanh**.
4. Chọn **Ngừng kinh doanh** → hộp thoại nêu rõ "5 dòng" và trạng thái đích. Bấm huỷ, kiểm
   lưới không đổi gì.
5. Làm lại và xác nhận. Cột **Trạng thái** của cả 5 dòng chuyển sang *Ngừng kinh doanh*, và
   các dòng đó **vẫn nằm trên lưới** chứ không biến mất.
6. Mở trang Sửa của dòng nhiều biến thể, kiểm **mọi biến thể** đều đã ngừng kinh doanh.
7. Chọn lại 5 dòng đó → **Đang kinh doanh** → tất cả trở lại bình thường (chiều bật lại
   không bị quy tắc Showroom chặn).
8. Chọn một dòng có hàng đang nằm ở kho Showroom cùng vài dòng bình thường → **Ngừng kinh
   doanh** → các dòng bình thường đổi được, và hiện cảnh báo nêu mã bị bỏ qua.
9. Ở tab Network, xác nhận toàn bộ bước 5 chỉ tốn **một** request.

## In scope
- Mở route HTTP cho `InventoryInventoryItemCrudService.setActiveStatus`, đổi nó sang chế độ bỏ-qua-và-báo-lại.
- Nở id dòng lưới thành mặt hàng ở server; đồng bộ cờ trên `products`.
- Menu hai mục + hộp thoại xác nhận + toast kết quả + nạp lại lưới.

## Not in scope
- "Cập nhật ảnh" / "Cập nhật ảnh nhanh" trong menu Tiện ích của MISA (người dùng đã loại).
- Chế độ "áp dụng cho toàn bộ kết quả lọc" (A-04).

## Risks
| Risk | Mitigation |
| --- | --- |
| **Hỏng im lặng**: `row.id` của dòng nhóm là `products.id`, đưa thẳng vào `UPDATE items` thì không khớp dòng nào, trả `updated: 0` mà không báo lỗi | ADR-04 nở id ở server; T-02-03 bắt buộc có test cho dòng `type:'product'`; demo script bước 2 và 6 kiểm bằng mắt |
| Lưới **tự chọn lại dòng đầu** khi vùng chọn rỗng (`CrudListPage.tsx:337-348`) ⇒ người dùng tưởng chưa chọn gì nhưng vẫn có 1 dòng mục tiêu | Hộp thoại xác nhận luôn nêu **số dòng cụ thể** (AC-13); không bao giờ áp dụng thẳng khi bấm menu |
| `updated: 0` vì bị bỏ qua hết lại báo "thành công" | Error taxonomy quy định `updated = 0` phải ra toast cảnh báo, không phải toast thành công |
| Route tĩnh bị route `items/:id` nuốt mất | Khai báo `items/set-active-status` trước mọi route `items/:id` trong controller |

## Definition of done
- [x] AC-10..AC-20 pass
- [x] Chỉ đúng một request cho một thao tác hàng loạt
- [x] `grep -rn "Tiện ích đang được triển khai" apps/` không còn kết quả
- [x] Mã nguồn backend không có chuỗi tiếng Việt (chỉ FE mới có)
- [x] `pnpm --filter @erp/api test` xanh; `tsc --noEmit` của backoffice sạch
- [x] `pnpm openapi:generate` đã chạy lại và schema sinh ra được commit
