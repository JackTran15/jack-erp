---
feature: overview-branch-share-legend-overflow
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Legend dài thì cuộn dọc trong khung 330px, vẫn liệt kê đủ mọi chi nhánh | medium | yes | Nếu muốn top-N + "Khác" thì phải đổi `slices` ở `BranchRevenueShareWidget` và mất ẩn/hiện từng chi nhánh | confirmed | Chọn "Legend cuộn dọc" — Akenzy, 2026-09-29 |
| A-02 | Sửa ở `PieLegend` dùng chung là đủ và an toàn cho widget hàng hóa (≤ 4 dòng, không chạm ngưỡng 330px) | high | no | Widget hàng hóa có thanh cuộn thừa | confirmed | `ProductShareWidget` gộp phần còn lại thành "Nhóm khác" nên legend tối đa vài dòng — đọc mã 2026-09-29 |
| A-03 | `max-h-full` trên `<ul>` có hiệu lực vì cha là `div` có chiều cao xác định `h-[330px]` | high | no | Legend vẫn tràn | confirmed | Cả hai nhánh render của `ProductRevenueShareChart` (có dữ liệu / "Chưa có dữ liệu") đều bọc trong `h-[330px]` — đọc mã 2026-09-29 |
| A-04 | Legend dài được phép cao bằng cả khung 330px (`max-h-full`) | high | no | Legend chạm sát mép trên/dưới khung, trông chật | rejected → 80% | Akenzy 2026-09-29 (sau G4): "max height should be 80%" → `max-h-[80%]` = 264px |
