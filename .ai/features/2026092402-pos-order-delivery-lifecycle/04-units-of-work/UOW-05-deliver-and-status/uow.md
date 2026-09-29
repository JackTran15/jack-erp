---
id: UOW-05
slug: deliver-and-status
title: Giao hàng, Cập nhật TT, Hoàn thành, Chuyển hoàn + quyền + lịch sử
demoable: true
duration: 2d
depends_on: [UOW-03, UOW-04]
requirements: [US-05, US-07]
verifies: [AC-18, AC-19, AC-20, AC-21, AC-22, AC-26]
risk: high
status: todo
rollback: gỡ route deliver/delivery-status; dữ liệu cột giao để nguyên
---

# UOW-05 — Giao hàng, Cập nhật TT, Hoàn thành, Chuyển hoàn + quyền + lịch sử

## Demo script
1. SO-1 hoá đơn đã thanh toán, tab Chờ giao → tick → "Giao hàng" → chọn GHN, VD123, 20.000, gói 2kg → Lưu → sang Đang giao hàng, Ngày GH = hôm nay (AC-18)
2. Giao đơn khác bỏ trống đối tác + phí → [DB] NULL (AC-18)
3. SO-2 hoá đơn nháp → Giao hàng → "Hoá đơn chưa hoàn tất" (AC-19)
4. Cập nhật TT: menu chỉ có bước hợp lệ; gọi API COMPLETED→IN_TRANSIT → 409 (AC-20)
5. Đơn FAILED hoá đơn debt → "Đã chuyển hoàn" → tồn quay về, công nợ đóng, đơn CANCELLED/RETURNED (AC-21)
6. Hoàn thành đơn còn nợ → "Đơn còn … chưa thu"; đơn hết nợ → Hoàn thành (AC-22)
7. User không có pos.sales-order.deliver: nút ẩn, API 403 (AC-26)
8. Lịch sử SO-1: duyệt → nhận xử lý → giao → hoàn thành (AC-27)

## In scope
- `POST deliver`, `POST delivery-status` batch
- RETURNED qua `cancelIn` (ADR-04)
- Nhãn lịch sử action mới
- DeliverDialog, DeliveryStatusDialog, Hoàn thành

## Not in scope
- Thu COD (ADR-05 rejected)

## Risks
| Risk | Mitigation |
| --- | --- |
| `cancel()` chưa có biến thể nhận manager | Tách `cancelIn` giữ `cancel` gọi nó; spec hồi quy cancel hiện có |
| Hai người cùng cập nhật một đơn | `FOR UPDATE` trên đơn trong mỗi action |

## Definition of done
- [x] AC-18..AC-22, AC-26, AC-27 có bằng chứng (07-verification.md; 2026-09-25) — AC-26 chỉ spec
- [x] `pnpm --filter @erp/api test -- sales-order` xanh (07-verification.md; 2026-09-25)
- [x] `pnpm --filter @erp/pos-web build` xanh (07-verification.md; 2026-09-25)
