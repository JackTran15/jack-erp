---
feature: stock-by-store-branch-scope
environments: [local-backoffice-bm, local-backoffice-wh]
viewports: [desktop]
---

# Verification — Số lượng tồn kho theo cửa hàng hiện đủ mọi chi nhánh

ADR-04, chủ dự án chốt 03/09/2026: **riêng báo cáo này, mọi vai trò mở được đều xem toàn bộ chi
nhánh của tổ chức**. Đây là **nới** phạm vi — trước đó đường v2 kẹp theo `actor.branchIds`.

## Chạy trên hai vai trò KHÔNG có quyền xem toàn chuỗi — có lý do

Khiếu nại PQ-02 nhắc "Quản lý chi nhánh **và NV**", nên chạy cả hai vai trò trên cùng kịch bản:

- `local-backoffice-bm` — **Quản lý chi nhánh**
- `local-backoffice-wh` — **Nhân viên kho**, vai trò nhân viên **duy nhất** giữ
  `inventory.reports.read` (`org-role-permissions.ts:210`). Nhân viên bán hàng / thu ngân không có
  khoá này nên không mở được màn hình.

Cả hai đều **không** có `reporting.dashboard.consolidated.read`. Nếu ở đâu đó còn kẹp theo phân
công hoặc theo quyền, một trong hai sẽ đỏ.

## Fixture

**Dữ liệu khách thật** — org MT (`e60e5f49-304d-4eb1-9735-3a2d10ba288f`), **15 chi nhánh**, tất cả
đều có tồn kho. Ảnh chụp vì thế mang dữ liệu hàng hoá thật; tài khoản do chủ dự án cung cấp cho
đúng mục đích này.

- `bm.verify@erp.local` và `wh.verify@erp.local` — mỗi tài khoản chỉ được gán **2 / 15** chi nhánh
  (MT46 Đà Nẵng 6.751 + MT211 Đà Nẵng 28.399 = **35.150**), sao chép đúng phân công của một Quản lý
  chi nhánh có thật (`ngothuytuyettrinh2106@gmail.com`).
- Tổng toàn tập của tổ chức: **263.340**.

Chênh lệch giữa hai con số là toàn bộ phép thử. **Chỉ được gán 35.150 mà nhìn thấy 263.340** thì
việc nới là thật; nếu vẫn là 35.150 thì bản vá chưa vào. Và `text=Chi nhánh Long Xuyên` — một chi
nhánh tài khoản **không** được gán — phải hiện.

## Steps

Thứ tự có chủ đích: hai bước cùng `/reports/inventory` chỉ khác `#hash` sẽ **không** nạp lại
`ReportPage` (Playwright `goto` chỉ đổi fragment), nên S2 xen vào giữa để S3 là điều hướng thật.

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Tài khoản chỉ được gán 2/15 chi nhánh vẫn thấy đủ mọi cửa hàng, tổng 263.340 — gồm cả Long Xuyên vốn không được gán | `/reports/inventory#stock_quantity_by_store` | `click button:has-text("Lấy dữ liệu"); wait text=Tồn cuối kỳ` | AC-01, AC-02 | `text=SỐ LƯỢNG TỒN KHO THEO CỬA HÀNG; text=Chi nhánh MT46 Đà Nẵng; text=Chi nhánh MT211 Đà Nẵng; text=Chi nhánh Long Xuyên; text=263.340` |
| S2 | Trang legacy đã xoá: URL cũ rơi vào màn hình 404, không còn bảng báo cáo kho | `/reports/storage/stock-by-branch` | `wait text=Không tìm thấy trang` | AC-06, AC-07 | `text=Không tìm thấy trang; no-text=Tồn cuối kỳ` |
| S3 | Việc nới KHÔNG lan sang báo cáo khác: "Tổng hợp nhập xuất tồn kho theo cửa hàng" vẫn kẹp theo phân công | `/reports/inventory#store_inventory_in_out_stock_summary` | `click button:has-text("Lấy dữ liệu"); wait text=Mã SKU` | AC-09 | `text=TỔNG HỢP NHẬP XUẤT TỒN KHO THEO CỬA HÀNG; no-text=Chi nhánh Long Xuyên` |
| S4 | Chế độ "Chuỗi cửa hàng" vẫn khoá theo quyền: hai tài khoản này không có mục đó trong bộ chọn chi nhánh | `/` | `click button:has-text("Chi nhánh MT46 Đà Nẵng"); wait text=Chi nhánh MT211 Đà Nẵng` | AC-05 | `text=Chi nhánh MT46 Đà Nẵng; text=Chi nhánh MT211 Đà Nẵng; no-text=Chuỗi cửa hàng` |
