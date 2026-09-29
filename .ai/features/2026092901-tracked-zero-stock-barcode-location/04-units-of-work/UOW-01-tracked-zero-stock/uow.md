---
id: UOW-01
slug: tracked-zero-stock
title: Gợi ý vị trí đang theo dõi tồn <= 0 ở In tem mã
demoable: true
duration: 0.5d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03]
risk: low
status: todo
rollback: revert T-01-01 — một điều kiện query, không migration
---

# UOW-01 — Gợi ý vị trí đang theo dõi tồn <= 0 ở In tem mã

## Demo script
1. Chọn hàng hoá có chi tiết vị trí *Đang theo dõi*, số lượng 0 (hoặc âm) trong kho nhập mặc định, không có kệ ưu tiên
2. Danh mục > In tem mã, thêm hàng đó → cột Kho/Vị trí tự điền vị trí đó
3. Đổi chi tiết vị trí sang *Ngừng theo dõi*, thêm lại → Kho/Vị trí để trống

## In scope
- Bước (b) của `ResolveItemLocationsHandler`

## Not in scope
- Tìm ngoài kho nhập mặc định

## Risks
| Risk | Mitigation |
| --- | --- |
| Mobile đổi bin mặc định cho dòng không mang bin | Chấp nhận (A-01) |

## Definition of done
- [x] AC-01, AC-02 xanh trong `resolve-item-locations.handler.spec.ts`
- [x] AC-03 Not verified here — local org thiếu dữ liệu vị trí đang theo dõi tồn <= 0; cần QA kiểm trên staging
- [x] Không file nào ngoài `touches:` bị đụng
