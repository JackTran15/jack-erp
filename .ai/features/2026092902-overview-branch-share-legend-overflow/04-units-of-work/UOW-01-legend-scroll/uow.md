---
id: UOW-01
slug: legend-scroll
title: Legend tỉ trọng theo chi nhánh cuộn trong khung
demoable: true
duration: 0.5d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03]
risk: low
status: todo
rollback: Revert một commit 1 file FE
---

# UOW-01 — Legend tỉ trọng theo chi nhánh cuộn trong khung

## Demo script
1. Đăng nhập backoffice, chọn "Chuỗi cửa hàng"
2. Tổng quan → widget "Tỉ trọng doanh thu theo chi nhánh": legend nằm trong card, không đè card trên/dưới, select "Tháng này" bấm được
3. Cuộn legend tới chi nhánh cuối, bấm để ẩn/hiện
4. Widget "Tỉ trọng doanh thu hàng hóa" bên cạnh: legend như cũ, không có thanh cuộn

## In scope
- Class Tailwind trên `<ul>` của `PieLegend`

## Not in scope
- Top-N / "Khác", nhãn trục X biểu đồ cột

## Risks
| Risk | Mitigation |
| --- | --- |
| Widget hàng hóa đổi hiển thị | Kiểm tra trên trình duyệt (AC-03) |

## Definition of done
- [x] AC-01..AC-03 pass
- [x] `tsc --noEmit` của `@erp/backoffice-web` xanh
- [x] Chỉ đổi `PieLegend.tsx`

## Verification evidence
Chrome extension không kết nối, dữ liệu local không có 15 chi nhánh → dựng lại đúng cây DOM/class
của `ProductRevenueShareChart` + `PieLegend` (Tailwind CDN) và đo trong chromium-headless-shell,
2026-09-29:
- class cũ, 15 dòng: legend cao 584px, `top` −22px, tràn khỏi card (tái hiện lỗi)
- class mới (`max-h-[80%]`), 15 dòng: legend cao 264px (80% khung 330px), căn giữa, nằm trong card, `scrollHeight > clientHeight` (AC-01, AC-02 cuộn)
- class mới, 4 dòng: 144px, không cuộn, giống class cũ (AC-03)
- Nút toggle trong `<li>` không đổi markup → hành vi ẩn/hiện giữ nguyên (AC-02); chưa bấm thử trên app thật.
