---
id: UOW-12
slug: dispatch-dialog
title: Điều phối — tick đơn rồi chọn chi nhánh từng đơn trong dialog
demoable: true
duration: 1d
depends_on: [UOW-11]
requirements: [US-11]
verifies: [AC-40, AC-41, AC-42, AC-43, AC-44, AC-45]
risk: low
status: todo
rollback: revert trang Điều phối về cột chọn inline (T-10-01/T-10-02); không có thay đổi API hay DB
---

# UOW-12 — Dialog Điều phối (Akenzy đổi 2026-09-24, lần 3)

## Demo script
1. `/orders/dispatch`: lưới chỉ có ô tick, không có ô chọn chi nhánh; toolbar `[Điều phối] | [Nạp]`, "Điều phối" khoá khi chưa tick (AC-40)
2. Tick P, Q, R → "Điều phối (3)" → dialog liệt kê đúng P, Q, R, mỗi dòng một ô chọn chi nhánh; footer [Validate] [Lưu] (AC-40)
3. Chọn Cà Mau ở ô đầu cột → cả 3 dòng Cà Mau; đổi Q → Cần Thơ (AC-41); xoá chọn của R
4. Validate → báo cáo: Q trước P, P vàng "thiếu … tại Cà Mau", R vắng; đóng báo cáo, dialog Điều phối vẫn còn lựa chọn (AC-43)
5. Lưu → P về Cà Mau, Q về Cần Thơ, R còn trong pool (AC-42, AC-44)
6. Tick 2 đơn, một đơn vừa bị huỷ → Điều phối → chọn chi nhánh → Lưu: đơn kia phân được, dòng bị huỷ báo lỗi tại dòng trong dialog, giữ chi nhánh đã chọn, dialog không đóng (AC-45)

## In scope
- `DispatchOrdersDialog` mới; nút "Điều phối (n)" trên toolbar
- Gỡ `BranchPickerColumn` và prop `extraColumn` của `OrdersPageTable` (ADR-13)

## Not in scope
- API (ADR-11 giữ nguyên: mỗi đơn một `POST /admin/sales-orders/:id/dispatch`)
- Nhãn "Thiếu hàng" (giữ trên lưới)

## Risks
| Risk | Mitigation |
| --- | --- |
| Sau Lưu, invalidate làm đơn rời lưới → dialog mất dòng đúng lúc cần báo kết quả | Dialog chụp danh sách đơn lúc mở (cách `DispatchBranchDialog` cũ đã làm) |
| Gỡ `extraColumn` làm lệch lưới `/orders`, `/orders/all` | Prop là tuỳ chọn, hai màn kia không truyền; build + ảnh `/orders` |

## Definition of done
- [x] AC-40..AC-45 có bằng chứng trong `07-verification.md` (dialog)
- [x] `pnpm --filter @erp/backoffice-web build` xanh
