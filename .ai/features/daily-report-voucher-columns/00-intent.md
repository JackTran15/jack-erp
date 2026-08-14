---
feature: daily-report-voucher-columns
slug: daily-report-voucher-columns
owner: Akenzy
created: 2026-08-14
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Thu/Chi tiền mặt đọc theo phiếu, thêm cột NV Thu / NV Chi

Màn "Báo cáo theo ngày" (POS) có hai modal tiền mặt, và hai modal đang trả lời hai câu hỏi
khác nhau. "Tổng chi tiền mặt" liệt kê **phiếu chi** (`PC…`). "Tổng tiền mặt" liệt kê **hoá
đơn** (`INV-`/`RTN-`) trộn với vài **phiếu thu** (`PT…`). Mô hình đích: cả hai modal đều liệt
kê chứng từ quỹ, và cả đối tượng nộp/nhận lẫn nhân viên phụ trách đều lấy từ chính phiếu đó.

Đây là bước **một phần, có chủ ý**. Bản thân phiếu Thu/Chi chưa được làm giàu dữ liệu trong
đợt này — đó là việc tiếp theo, chủ sản phẩm sẽ chốt spec sau.

## Problem

1. **Modal Thu không đồng nhất với modal Chi.** Chi đọc `cash_payments`; Thu đọc
   `invoice_payments` + một phần `cash_receipts` (loại trừ `purpose = POS_SALE`). Người dùng
   nhìn hai bảng cạnh nhau và không suy ra được "một dòng ở đây nghĩa là gì".
2. **Không biết ai thu, ai chi.** Cả hai modal chỉ có cột "Khách hàng". Cột `staff_id` đã tồn
   tại trên `cash_receipts` và `cash_payments` (đang được dùng để **lọc**) nhưng không bao giờ
   được hiển thị, nên dữ liệu có mà không ai đọc được.

## Success signal

- `POST /reports/pos/daily-summary/detail` với `category: "revenue-cash"` trả về **chỉ** các
  dòng bắt nguồn từ `cash_receipts` đã POSTED (mọi `purpose`, kể cả `POS_SALE`); không còn
  dòng `INV-`/`RTN-` nào.
- Modal "Tổng tiền mặt" có cột **NV Thu** ngay sau "Khách hàng"; modal "Tổng chi tiền mặt" có
  cột **NV Chi** ở cùng vị trí.
- "Khách hàng" và "NV Thu/Chi" lấy từ phiếu: `payer_name`/`payee_name` → `partner_name_snapshot`
  cho đối tượng, `staff_id` → tên người dùng cho nhân viên.
- `category: "revenue-bank-transfer"` **không đổi hành vi** — vẫn liệt kê hoá đơn và vẫn loại
  trừ `POS_SALE`.

## Out of scope

- Handler tổng hợp (`get-pos-daily-summary.handler.ts`). Con số "Tiền mặt" trên thẻ Thu giữ
  nguyên công thức cũ.
- `revenue-bank-transfer`, `expense-bank-transfer`, `revenue-points`, `debt-*`.
- Bảng nhãn "Loại chứng từ" cho dòng phiếu thu. Giữ nguyên 7 lựa chọn hiện có trong dropdown;
  chủ sản phẩm sẽ cung cấp mapping sau (xem A-03).
- Làm cho checkout saga v2 sinh phiếu thu cho mỗi lần bán tiền mặt (xem A-01).
- Làm giàu `staff_id` / đối tượng trên các phiếu do consumer sinh tự động (xem A-02).

## Constraints

- Chỉ đổi nguồn dữ liệu của **một** category. `buildRevenueRows` hiện phục vụ cả
  `RevenueCash` lẫn `RevenueBankTransfer`, nên khác biệt phải nằm sau tham số, không sửa
  thẳng thân hàm dùng chung.
- Contract nằm ở `packages/shared-interfaces` → phải chạy lại `pnpm openapi:generate` và
  commit cả `openapi.snapshot.json` lẫn `packages/api-client/src/generated/schema.ts`.
- Không migration: `staff_id`, `payer_name`, `payee_name`, `partner_name_snapshot` đã có sẵn
  trên cả hai bảng chứng từ; `UserEntity` đã được đăng ký trong `pos-daily-report.module.ts`.
