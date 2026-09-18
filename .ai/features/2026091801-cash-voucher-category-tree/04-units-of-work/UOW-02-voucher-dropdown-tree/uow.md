---
id: UOW-02
slug: voucher-dropdown-tree
title: Kế toán thấy dropdown Mục thu / Mục chi trên 4 dialog phiếu theo thứ tự cây, mục con thụt lề dưới mục cha
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-04]
verifies: [AC-08]
risk: low
status: todo
rollback: revert commit ⇒ hook về `GET /admin/entities/.../records?sortBy=displayOrder`, dropdown phẳng
---

# UOW-02 — Dropdown Mục thu/chi trên phiếu theo cây

`useCashVoucherCategories(direction)` đổi nguồn sang `POST /v2/cash-voucher-categories/tree` và trả danh sách DFS
kèm `depth`; bốn dialog thụt lề option bằng NBSP. Giữ `queryKey`, `staleTime` 5 phút, không lọc `isActive` (A-11)
để `useCategoryNameMap` còn hiện tên mục đã tắt trên phiếu cũ.

## Demo script

Môi trường `local-backoffice`, org MT, sau demo UOW-01 (có "Chi phí vận hành" › "Tiền điện"; nếu đã xoá ở bước 8
thì tạo lại).

1. Quỹ tiền › Thu chi tiền mặt → thêm Phiếu chi → thêm dòng → mở dropdown Mục chi: option "Chi phí vận hành" rồi
   ngay dưới "Tiền điện" thụt lề; các mục gốc khác theo `display_order` như cũ. Chụp ảnh.
2. Chọn "Tiền điện", điền số tiền, Lưu. Mở lại phiếu ở chế độ xem → ô Mục chi hiện "Tiền điện" không thụt lề; lưới
   Thu chi tiền mặt hiện tên mục của các phiếu cũ như trước.
3. Phiếu chi tiền gửi (Quỹ tiền › Thu chi tiền gửi): cùng cây mục chi. Phiếu thu tiền mặt và Phiếu thu tiền gửi:
   dropdown Mục thu vẫn 9 mục gốc (không có nhóm) — thứ tự như trước.
4. DevTools › Network: dropdown gọi `POST /v2/cash-voucher-categories/tree` body `{ direction: "OUT" }` / `"IN"`;
   không còn request `/admin/entities/cash-voucher-categories/records` từ dialog.
5. Tắt "Tiền điện" trên màn Danh mục thu chi → mở lại phiếu đã lưu ở bước 2 → vẫn hiện "Tiền điện" (A-11).

## In scope

- Hook + type + option label của 4 dialog (T-02-01).

## Not in scope

- Ẩn mục đã tắt khỏi dropdown; disable option cha (A-03); dropdown ở POS/mobile.

## Risks

| Risk | Mitigation |
| --- | --- |
| `<option>` gộp khoảng trắng đầu dòng nên thụt lề không hiện | Dùng ` ` (NBSP), kiểm ở bước 1 |
| Tên mục trong ô xem/lưới bị dính NBSP | Chỉ thụt lề ở `renderEditor`; `getValue` và name map dùng `name` gốc |

## Definition of done

- [ ] AC-08 pass
- [ ] `tsc --noEmit` của `apps/backoffice-web` sạch
- [ ] Demo script chạy đầu-cuối và được nghiệm thu ở G4
