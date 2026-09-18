---
id: UOW-03
slug: expense-reports
title: Ba báo cáo chi tiền — theo mục chi, bảng kê theo mục chi, theo thời gian — với drill-down giữa chúng
demoable: true
duration: 2d
depends_on: [UOW-01, UOW-02]
requirements: [US-04, US-05, US-06]
verifies: [AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18]
risk: medium
status: todo
rollback: Revert các commit của UoW; xoá `backendKey` của 3 enum là 3 báo cáo biến mất, UOW-01/02 không ảnh hưởng.
---

# UOW-03 — Ba báo cáo chi tiền

## Demo script

Cùng môi trường như UOW-01, chi nhánh Hồ Chí Minh có phiếu chi nhiều mục.

1. Chọn báo cáo = **Chi tiền theo mục chi**, kỳ Năm nay → mỗi mục một dòng, giảm dần theo số
   tiền, dòng tổng chân bảng; "Chi mua hàng hóa" không có mặt (AC-12). Sửa mẫu có "ID Mục chi",
   "Loại Mục chi" đang ẩn.
2. Bấm tên mục "Tiền điện" → dialog **Bảng kê tiền chi theo mục chi** cùng kỳ, Mục chi = Tiền
   điện: dòng TỔNG CHI, một dòng nhóm "Tiền điện", các dòng chi tiết với Số chứng từ là link
   (AC-13, AC-14).
3. Đóng, chọn báo cáo = **Bảng kê tiền chi theo mục chi**, Cửa hàng = Tất cả, kỳ Năm nay →
   TỔNG CHI, nhóm không mục ("Chi khác") đứng đầu, rồi các mục theo thứ tự hiển thị; phiếu có
   2 dòng 2 mục xuất hiện ở 2 nhóm với giá trị từng dòng; phân trang 50 đếm cả dòng nhóm; dòng
   tổng chân bảng vẫn là tổng toàn bộ (AC-14, AC-15).
4. Chọn báo cáo = **Chi tiền theo thời gian**, Thống kê theo = Tháng, Mục chi = Tất cả, kỳ Năm
   nay → mỗi tháng có chi một dòng, tổng khớp dòng tổng của bước 1; Thống kê theo = Ngày, Mục
   chi = Tiền điện → chỉ các ngày có chi tiền điện (AC-16, AC-17).
5. Bấm một ngày → dialog Bảng kê tiền chi theo mục chi với từ = đến = ngày đó, cùng Mục chi (AC-18).
6. Xuất khẩu / In cả 3 báo cáo: file và bản in giữ dòng nhóm đậm, thụt lề.

## In scope

- 3 definition: `expenses-by-category`, `expense-list-by-category`, `expenses-by-time`
- `filter-options?type=expenseCategory`
- FE: filter line `EXPENSE_CATEGORY`, `TIME_BUCKET`; 3 registry; metadata; 2 drill-down

## Not in scope

- Chi phí dồn tích chưa thanh toán (bảng `expenses`) — A-12
- "Chi mua hàng hóa" trong ba báo cáo này — A-02

## Risks

| Risk | Mitigation |
| --- | --- |
| Mục chi thật tên "Chi khác" trùng nhãn nhóm không mục | Khoá nhóm là `categoryId` / `'uncategorized'` (như `business-results.aggregator.ts`), nhãn trùng vẫn là hai nhóm; drill-down truyền khoá, không truyền nhãn |
| Phân trang trên danh sách phẳng có dòng nhóm: offset SQL không biết dòng nhóm | Tính trong RAM sau khi lấy `LIMIT/OFFSET` theo dòng chi tiết + đếm nhóm đã qua (`sumSignedBeforeOffset`-style: `COUNT(DISTINCT category)` trước offset); `countRows` chặn kỳ quá lớn; export đi keyset trên dòng chi tiết, dòng nhóm chỉ ở màn hình |
| 5 file FE dùng chung với UOW-02 | Đã khai phụ thuộc T-03-04 → T-02-03, T-03-05 → T-02-04, T-03-02 → T-02-01: ba definition BE của UoW này vẫn chạy song song với UOW-02, phần FE nối đuôi |

## Definition of done

- [x] AC-12..18 có test xanh — unit 3 spec (13 + 22 + 19), e2e `cash-fund-report-expenses` 41/41 (kể cả 120 dòng tháng 10 cho AC-15), trình duyệt `verify-t0304.py` 26/26 (2026-09-18)
- [x] Hai drill-down hoạt động — `verify-t0305.py` 22/22, ảnh `evidence/t0305-*.png`
- [ ] Đối chiếu MShopKeeper: tổng "Chi tiền theo mục chi" = tổng "Chi tiền theo thời gian" = Σ nhóm của "Bảng kê tiền chi theo mục chi" cùng kỳ; lệch với MShopKeeper (nếu có) giải thích bằng A-02 (refund/chuyển quỹ)
- [ ] Demo script chạy trước Akenzy và được chấp nhận tại G4
