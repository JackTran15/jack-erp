---
id: UOW-02
slug: cash-in-out-list
title: "Bảng kê thu chi" với số dư luỹ kế, lọc cửa hàng / nhân viên / phương thức, và drill-down từ ô IV của "Tình hình thu chi"
demoable: true
duration: 1.5d
depends_on: [UOW-01]
requirements: [US-03]
verifies: [AC-08, AC-09, AC-10, AC-11]
risk: medium
status: todo
rollback: Revert các commit của UoW; xoá `backendKey` của `CASH_IN_OUT_LIST` là báo cáo biến mất khỏi API và FE, domain `cash` (UOW-01) không ảnh hưởng.
---

# UOW-02 — "Bảng kê thu chi" + drill-down

## Demo script

Cùng môi trường và dữ liệu như UOW-01, tài khoản admin.

1. Báo cáo → Quỹ tiền → Chọn báo cáo = **Bảng kê thu chi**; Cửa hàng = Theo nhóm cửa hàng →
   chọn 2 chi nhánh; Nhân viên = Tất cả; Phương thức = Tất cả; kỳ = Tháng này → Đồng ý.
   Phụ đề "Xem theo cửa hàng: …", "Nhân viên: Tất cả". Dòng đầu "Số dư đầu kỳ", rồi từng
   phiếu (tiền mặt lẫn tiền gửi) theo ngày tăng dần với Số dư cuối kỳ luỹ kế; dòng tổng Tiền
   thu / Tiền chi chân bảng (AC-08).
2. Đổi Nhân viên = một thu ngân, Phương thức = Tiền mặt → chỉ phiếu tiền mặt của người đó;
   Phương thức = Chuyển khoản → chỉ phiếu tiền gửi (AC-09).
3. Gõ vào ô lọc cột Diễn giải và Tiền chi (≤) → bảng, số dư đầu kỳ và dòng tổng co theo (AC-10).
4. Sửa mẫu: đúng 16 cột, "Mã đối tượng"/"Số hóa đơn" đang tắt, 4 cột đầu đang ghim; bật "Số
   hóa đơn", Lưu → cột hiện với số hoá đơn của phiếu thu POS (AC-11).
5. Quay lại **Tình hình thu chi** → bấm ô Tiền mặt ở dòng IV → dialog Bảng kê thu chi cùng kỳ,
   Phương thức = Tiền mặt; bấm ô Tiền gửi → Chuyển khoản. Đóng dialog quay lại đúng trạng thái.
6. Xuất khẩu với kỳ Năm nay → file đầy đủ mọi dòng (keyset, không bị chặn row cap).

## In scope

- `cash-in-out-list.report.ts` (UNION 4 bảng, lọc cột, dòng đầu kỳ, luỹ kế, `exportSource`)
- `filter-options` `type=employee`
- FE: filter line `PAYMENT_METHOD`, registry 16 cột, metadata #3, drill-down từ #2

## Not in scope

- Mở phiếu từ cột "Số chứng từ" bằng dialog riêng — link điều hướng sang
  `/treasury/cash/receipts-expenses` / `/treasury/deposit/receipts-expenses` với `?id=` (tab mới);
  dialog chi tiết phiếu trong báo cáo là việc sau
- Cột "Tên thẻ" (A-05)

## Risks

| Risk | Mitigation |
| --- | --- |
| Số dư luỹ kế khi có lọc cột: đầu kỳ + Σ tập đã lọc không còn là số dư thật | AC-10 chọn: đầu kỳ và tổng tính trên **tập đã lọc** (khác Sổ quỹ `cash-ledger.service.ts:73-78`, vốn không thu hẹp đầu kỳ theo lọc cột — sửa lại mô tả 2026-09-18 khi xây T-02-01); ghi trong comment của class |
| Phân trang offset trên UNION 4 bảng chậm với kỳ dài | `countRows` + row cap; export đi keyset `(doc_date, id)`; index của T-01-05 |
| 5 file FE + handler filter-options dùng chung với UOW-03 | UOW-03 khai phụ thuộc lên T-02-01 / T-02-03 / T-02-04, nên UoW này đi trước ở phần FE; hazard còn lại chỉ là barrel `reports/index.ts` (mỗi ticket thêm một dòng) |

## Definition of done

- [ ] AC-08..11 có test xanh (unit cho definition, e2e cho lọc + template)
- [ ] Drill-down từ #2 hoạt động (kiểm tay, ảnh trong `07-verification.md`)
- [ ] Đối chiếu MShopKeeper "Bảng kê thu chi" cùng kỳ: số dòng, Số dư đầu kỳ, tổng thu/chi, số dư cuối
- [ ] Demo script chạy trước Akenzy và được chấp nhận tại G4
