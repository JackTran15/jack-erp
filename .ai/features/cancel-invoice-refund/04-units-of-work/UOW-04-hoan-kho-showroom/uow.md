---
id: UOW-04
slug: hoan-kho-showroom
title: Hàng của hóa đơn bị hủy cộng vào kho showroom
demoable: true
duration: 0.5d
depends_on: []
requirements: [US-04]
verifies: [AC-11, AC-12, AC-13]
risk: low
status: todo
rollback: Revert `StockReturnConsumer` về dùng `item.locationId` — một dòng đổi lại
---

# UOW-04 — Hoàn kho về showroom

Độc lập hoàn toàn với các lát cắt tiền: có thể làm song song với UOW-01 ngay từ đầu.

## Demo script

1. Chọn một item đang có tồn ở kho tổng, không có kệ riêng ở showroom.
2. Bán item đó trên POS (hệ thống trừ ở vị trí showroom hoặc kho tổng tùy dữ liệu),
   ghi lại tồn của cả kho tổng lẫn showroom ở Backoffice → Tồn kho theo vị trí.
3. Hủy hóa đơn.
4. Xem lại tồn: phần hoàn nằm ở **showroom**, không nằm ở kho tổng.
5. Lặp với item có kệ riêng trong showroom: hàng về đúng kệ đó.

## In scope

- `StockReturnConsumer` định tuyến qua `resolveBranchItemLocations(..., { showroomOnly: true })`
- E2E tồn kho cho cả hai trường hợp

## Not in scope

- Đổi cách chọn vị trí của luồng bán, trả hàng hay đổi hàng — chỉ đường hủy hóa đơn

## Risks

| Risk | Mitigation |
|---|---|
| Chi nhánh không có kho showroom hoặc không có vị trí "Mặc định" | `resolveBranchItemLocations` bỏ qua item đó; consumer phải log rõ item nào bị bỏ thay vì im lặng |
| Vòng chống trùng hiện tại dựa trên `(referenceType, referenceId, itemId)` | Không đổi khóa đó — đổi vị trí không ảnh hưởng tính idempotent |

## Definition of done

- [ ] AC-11, AC-12, AC-13 pass
- [ ] Demo script chạy được từ đầu đến cuối
- [ ] Item không giải quyết được vị trí showroom đều xuất hiện trong log
- [ ] `pnpm --filter @erp/api test` xanh
- [ ] Demoed và accepted ở gate G4
