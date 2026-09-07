---
id: UOW-04
slug: pivot-drop-period-lines
title: "Số lượng tồn kho theo cửa hàng" không còn chào mời kỳ
demoable: true
duration: 1d
depends_on: []
requirements: [US-03]
verifies: [AC-09, AC-10]
risk: low
status: todo
rollback: Trả hai dòng lọc về `filterConfig` — một file, một commit
---

# UOW-04 — "Số lượng tồn kho theo cửa hàng" không còn chào mời kỳ

## Demo script
1. Mở "Số lượng tồn kho theo cửa hàng" → form **không còn** dòng "Kỳ báo cáo" và "Từ ngày / đến ngày"
2. Mở lần lượt 7 báo cáo kho còn lại → cả 7 vẫn còn dòng kỳ, và đổi kỳ vẫn đổi số dòng

## In scope
- Gỡ `report_period` + `range_date` khỏi `filterConfig` của registry báo cáo đó (ADR-04)

## Not in scope
- Sửa engine pivot để tôn trọng kỳ — là feature riêng dựng trên ledger (A-02)

## Risks
| Risk | Mitigation |
| --- | --- |
| Prune (ADR-04 tháng 8) xoá hai line khỏi túi và báo cáo khác mất kỳ mặc định (A-07) | Hai line nằm sẵn trong `ALWAYS_KEPT_FILTER_LINES`; test store phủ đúng nhánh này |

## Definition of done
- [x] AC-09 và AC-10 pass
- [x] Không báo cáo nào khác mất dòng kỳ
- [x] Test store xanh
