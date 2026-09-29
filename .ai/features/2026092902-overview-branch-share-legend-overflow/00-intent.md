---
feature: overview-branch-share-legend-overflow
slug: 2026092902-overview-branch-share-legend-overflow
owner: Akenzy
created: 2026-09-29
status: approved
---

# Intent — Legend "Tỉ trọng doanh thu theo chi nhánh" không tràn khỏi card

## Problem

Tổng quan (chế độ "Chuỗi cửa hàng"), widget "Tỉ trọng doanh thu theo chi nhánh": với 15+
chi nhánh, legend bên phải pie tràn lên trên và xuống dưới card — đè lên card "Doanh thu,
chi phí, lợi nhuận" phía trên, đè lên select "Tháng này" của chính widget, và lấn xuống
card "Lợi nhuận hàng hóa theo thời gian" (ảnh chụp 2026-09-29, jack-erp-backoffice).

Nguyên nhân đọc từ mã: `ProductRevenueShareChart` đặt pie + legend trong một hàng
`flex h-[330px] items-center`; `PieLegend` là `<ul class="flex shrink-0 flex-col gap-4">`
không giới hạn chiều cao, nên danh sách dài hơn 330px được căn giữa và tràn đều hai phía.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Quản lý chuỗi xem Tổng quan | Legend đè lên card khác và select kỳ, không bấm được "Tháng này" | Legend cao tối đa 80% khung 330px (264px), dư thì cuộn trong legend; mọi chi nhánh vẫn bấm ẩn/hiện được |

## Success signal

Trên Tổng quan chế độ chuỗi (15 chi nhánh), bounding box của legend nằm trọn trong card
"Tỉ trọng doanh thu theo chi nhánh" (top ≥ top vùng body, bottom ≤ top footer "Dữ liệu"),
legend cuộn được tới chi nhánh cuối, và select "Tháng này" bấm được.

## Out of scope

- Gộp chi nhánh nhỏ thành "Khác" / ẩn chi nhánh doanh thu 0 — chủ sản phẩm chọn cuộn, 2026-09-29.
- Nhãn trục X của biểu đồ cột "Doanh thu, chi phí, lợi nhuận" (xoay chéo, dài) — không phải lỗi này.

## Constraints

| Kind | Detail |
| --- | --- |
| Platform | Desktop backoffice |
| Compat | Không đổi API; chỉ class Tailwind |
| Shared | `PieLegend` dùng chung với widget "Tỉ trọng doanh thu hàng hóa" (≤ 4 dòng) — hành vi ở đó không đổi |

## Existing surface touched

- Reused components: `PieLegend` (`OverviewRow3/ProductShareWidget/ProductRevenueShareChart/PieLegend`).
- Adjacent features: `ProductShareWidget` dùng cùng legend.
- Entry points: không có route mới.
