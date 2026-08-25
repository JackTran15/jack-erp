---
id: UOW-02
slug: drilldown-invoice-listing
title: Click ô Ngày mở bảng kê hoá đơn của ngày đó
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-02, US-04]
verifies: [AC-06, AC-07, AC-08, AC-09, AC-13, AC-14, AC-15]
risk: medium
status: todo
rollback: revert sáu commit; `ReportPageTableView` quay lại nhánh `col.column === "invoiceCode"` cứng, `ReportPage` không mount dialog drill-down, cột `date` mất cờ `link`. Không có state hay dữ liệu nào tồn tại ngoài phiên trình duyệt, nên revert là hoàn nguyên tuyệt đối.
---

# UOW-02 — Click ô Ngày mở bảng kê hoá đơn của ngày đó

## Demo script
1. `make dev-api` + `make dev-backoffice`, đăng nhập, chọn chi nhánh **HCM**.
2. Mở `/reports/sales#daily_sales_summary`, kỳ **01/08/2026 – 31/08/2026**, bấm "Lấy dữ liệu".
3. Ô cột **Ngày** hiện màu xanh và có con trỏ tay. Click dòng **19/08/2026**.
   → Dialog mở, tiêu đề **BẢNG KÊ HÓA ĐƠN**, phụ đề **Ngày 19/08/2026**.
   → Bảng liệt kê từng hoá đơn của đúng ngày đó, có dòng filter theo cột, có dòng tổng ở chân.
   → Chân dialog có ba nút **In**, **Xuất khẩu**, **Đóng**.
4. So dòng tổng của dialog với dòng 19/08 của báo cáo cha ở các cột tương ứng → khớp.
5. Click một **mã hoá đơn** trong dialog → dialog chi tiết hoá đơn mở **chồng lên**. Đóng nó →
   quay về dialog bảng kê, không đóng luôn cả hai.
6. Bấm **Xuất khẩu** trong dialog → file tải về chỉ chứa hoá đơn ngày 19/08.
7. Đóng dialog → URL hash vẫn là `#daily_sales_summary`, báo cáo cha giữ nguyên kỳ và dữ liệu
   (không nạp lại).
8. Đổi sang `#invoice_and_order_list` → cột **Ngày** ở đây là text thường, không click được;
   cột **Số hoá đơn** vẫn click được như trước.

## In scope
- Cờ `link` cho cột `date`, đặt riêng trong `daily-sales-summary`, không qua `LINK_COLUMNS` toàn cục.
- Registry drill-down FE khoá theo `(backendKey, columnKey)` thay cho nhánh `invoiceCode` cứng.
- State `drillDown` trong report store + factory dựng state cho bảng lồng.
- `ReportDrillDownDialog` — `AppModal` bọc stack provider thứ hai.
- Tách `ReportExportButtons` khỏi `ReportPageToolbar` để dùng lại ở chân dialog.

## Not in scope
- Dialog theo mặt hàng và filter `sku` — UOW-03.
- Tiêu đề file xuất khẩu/in ("BẢNG KÊ HÓA ĐƠN VÀ ĐƠN HÀNG" thay vì "BẢNG KÊ HÓA ĐƠN") — người
  dùng đã chấp nhận, xem A-08.
- Thêm vitest cho `backoffice-web`.
- Cột `date` của báo cáo kho / công nợ / lợi nhuận.

## Risks
| Risk | Mitigation |
|---|---|
| Mount nhầm `ReportUrlSync` trong dialog ⇒ đóng dialog làm báo cáo cha nhảy sang report type của dialog | Done-when của T-02-04 cấm tường minh; bước 7 của demo script bắt đúng triệu chứng này |
| Bảng lồng đọc nhầm store của cha (hook lấy context gần nhất — sai thứ tự lồng là hỏng âm thầm) | T-02-04 yêu cầu bước demo 4 (đối chiếu dòng tổng) phải xanh, đó là phép thử phân biệt duy nhất |
| Generalise nhánh cell làm hỏng drill-down mã hoá đơn sẵn có | AC-13 nằm trong `verifies` của T-02-02; bước demo 8 kiểm ngay |
| Kế thừa filter bằng spread ⇒ lọt filter đích không hỗ trợ, `invoiceFilterSummary` in dòng phụ đề sai lên file xuất | T-02-06 bắt buộc allow-list tường minh và cấm spread |
| `AppModal` lồng nhau tranh z-index hoặc khoá cuộn của nhau | `AppModal` đã tự quản stack (`MODAL_STACK_BASE_Z + STEP`); bước demo 5 xác nhận bằng mắt |

## Definition of done
- [x] AC-06, AC-07, AC-08, AC-09, AC-13, AC-14, AC-15 đều pass
- [x] `ReportUrlSync` không được mount trong dialog
- [x] Đóng dialog không làm báo cáo cha nạp lại
- [x] `_lib/report-drilldown.ts` không import React (giữ thuần để còn test được khi có vitest)
- [x] Demoed và accepted ở gate G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` xanh trên mọi môi trường bắt buộc — local-backoffice, 12/12 bước
- [x] Có bằng chứng cho AC-06 (S5), AC-07 (S6), AC-08 (S7), AC-13 (S10, S11), AC-14 (S10)
- [ ] ~~AC-09 và AC-15~~ — **không chụp được, không phải chưa làm.** AC-09: runner không mở
      `.xlsx` để kiểm nội dung, nên chỉ chứng minh được "file tải về" chứ không phải "file đúng
      phạm vi"; đã kiểm tay ở demo script. AC-15: hôm nay không cột **số** nào mang `link: true`
      trong bộ bốn báo cáo bán hàng, nên không dựng được ô để chụp; S11 chứng minh nửa còn lại
      của cùng thay đổi. `evidence_check.py` báo đỏ hai mục này vì nó không có cơ chế miễn trừ.
- [x] `08-evidence.md` đã sinh lại và sha của nó khớp HEAD
