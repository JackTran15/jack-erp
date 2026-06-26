# Tổng quan phiên test

> Tổng hợp trạng thái tất cả journey. Ghi nhanh khi test → format theo [`REPORT-TEMPLATE.md`](REPORT-TEMPLATE.md) → lưu `report-NN.md`.

## Trạng thái báo cáo

| Journey | File | Trạng thái |
| --- | --- | --- |
| ENV-00 Setup | [`report-00.md`](report-00.md) | 🟡 Xong — 7 bug (1 Critical, 6 Major), 12 UX |
| TC-01 Thiết lập hệ thống | [`report-01.md`](report-01.md) | 🟢 Xong — 11/11 pass |
| TC-02 Nhập hàng | [`report-02.md`](report-02.md) | 🟢 Xong — 7/8 pass, 1 UX nhỏ |
| TC-03 Bán hàng POS | [`report-03.md`](report-03.md) | 🟢 Xong — 9/10 pass, 2 bug, 4 UX |
| TC-04 Chuyển kho tạm | — | 🔧 Đang fix (chưa test) |
| TC-05 Ca làm việc POS | — | 🚫 Skip — POS chưa có UI mở/đóng ca |
| TC-06 Quỹ tiền | [`report-06.md`](report-06.md) | 🟡 Một phần — 4/8 pass, 2 bug (auto-post + reverse UI) |
| TC-07 Điều chuyển chi nhánh | [`report-07.md`](report-07.md) | 🟢 Xong — 5/5 pass, 1 bug minor |
| TC-08 Xuất kho thủ công | [`report-08.md`](report-08.md) | 🟢 Xong — 3/3 pass, 1 UX nhỏ |
| TC-09 Kiểm kê kho | [`report-09.md`](report-09.md) | 🟡 Một phần — 6/7 pass, 1 bug minor |
| TC-10 Đổi trả hàng | [`report-10.md`](report-10.md) | 🔴 4/6 pass, 2 NG — 1 bug major (type sai), 1 bug minor |
| TC-11 Báo cáo | [`report-11.md`](report-11.md) | 🔧 Tạm dừng — 1/3 pass, 2 NG; chờ fix bug group-by (13 TC chưa test) |
| TC-12 Phân quyền | [`report-12.md`](report-12.md) | 🔴 5/8 pass, 3 NG — 3 bug major (FE guard, branch ERP, mgr scope) |

---

**Tester:** LocTran · **Tài khoản:** Quản trị hệ thống (`inventory.admin@erp.local`)

## Ghi chú hiện tại

_(Ghi nhanh bug dạng plain text khi test — sẽ được format vào report-NN.md tương ứng)_
