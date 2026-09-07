---
id: UOW-02
slug: member-scope-transport
title: ĐVT/Thương hiệu tách khỏi túi columnFilters
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-05, AC-07]
risk: medium
status: todo
rollback: Revert commit của UoW; đường cũ (gấp vào columnFilters) không bị xoá cho tới khi UOW-03 xanh
---

# UOW-02 — ĐVT/Thương hiệu tách khỏi túi columnFilters

## Demo script
1. "Tổng hợp nhập xuất tồn kho", đặt "Đơn vị tính" = "Đôi", "Thống kê theo" = "Hàng hóa" → 8987 dòng (như cũ)
2. Đổi "Thống kê theo" sang "Mẫu mã" → **201**, không còn 400
3. Đổi tiếp sang "Nhóm hàng hóa" → **201**
4. Lặp bước 2–3 với "Thương hiệu" trên cả 5 báo cáo khai "Thống kê theo" → 0/10 trả 400

## In scope
- `MemberScopeFilters` đi thẳng xuống engine, không qua `toEngineFilters`
- Nối `document-detail` và `temp-warehouse-out` — hai lớp vốn **quên** truyền scope `{unit, brand}`

## Not in scope
- Vị từ vào CTE gộp (UOW-03): ở UoW này hạt gộp mới chỉ **hết 400**, chưa lọc đúng

## Risks
| Risk | Mitigation |
| --- | --- |
| Đổi đường vận chuyển làm lệch hạt item vốn đang đúng | T-02-02 khoá hành vi hạt item bằng test TRƯỚC khi đổi |

## Definition of done
- [x] AC-05 và AC-07 pass
- [x] Hạt `item` cho kết quả y hệt trước khi đổi
- [x] Không lớp report nào còn gấp `unit`/`brand` vào `columnFilters`
