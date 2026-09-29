---
feature: overview-branch-share-legend-overflow
adr_count: 1
---

# Logical design — Legend tỉ trọng theo chi nhánh không tràn

## Approach

Thêm `max-h-[80%] overflow-y-auto` (và `pr-2` để chữ không sát thanh cuộn) vào `<ul>` của
`PieLegend`. Cha của nó là hàng `flex h-[330px] items-center` nên `max-h-[80%]` = 264px (chủ sản phẩm chốt 80%, 2026-09-29):
legend ngắn vẫn căn giữa như cũ, legend dài bị chặn ở 264px và cuộn bên trong.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Top-N + "Chi nhánh khác" | Chủ sản phẩm chọn cuộn (A-01); mất ẩn/hiện từng chi nhánh |
| Ẩn chi nhánh doanh thu 0 | Không giải quyết chuỗi có nhiều chi nhánh có doanh thu; đổi ngữ nghĩa legend |
| Legend echarts `type: "scroll"` | Legend hiện là React (`PieLegend`) có toggle riêng; chuyển sang legend echarts là viết lại |
| Tăng chiều cao card | Card cao theo số chi nhánh, lệch hàng với widget hàng hóa bên cạnh |

## Domain model

Không đổi.

## Contracts

Không đổi API.

## Error taxonomy

| Condition | Failure subtype | UI |
| --- | --- | --- |
| Legend dài hơn 264px (80% khung) | không phải lỗi | Cuộn trong legend |
| Không có dữ liệu | không phải lỗi | Nhánh "Chưa có dữ liệu" cùng khung 330px, cùng legend cuộn |

## ADRs

### ADR-01 — Chặn chiều cao legend bằng khung cha, cuộn bên trong
**Status:** accepted
**Context:** Legend React không giới hạn chiều cao trong hàng cao cố định 330px.
**Decision:** `max-h-[80%] overflow-y-auto` trên `<ul>` của `PieLegend` dùng chung.
**Consequences:** Mọi pie dùng `PieLegend` đều không bao giờ tràn khung; legend ngắn không đổi.
