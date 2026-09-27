---
id: UOW-04
slug: delivery-order-grid
title: Đơn hàng trên POS — 10 tab, bộ lọc, lưới 24 cột
demoable: true
duration: 2d
depends_on: [UOW-02]
requirements: [US-04]
verifies: [AC-12, AC-13, AC-14, AC-15, AC-16, AC-17]
risk: medium
status: todo
rollback: gỡ route /orders + mục menu; view DELIVERY là nhánh mới của handler
---

# UOW-04 — Đơn hàng trên POS — 10 tab, bộ lọc, lưới 24 cột

## Demo script
1. Có đơn ở mỗi delivery_status ở CN-A. Menu → "Đơn hàng"; bấm từng tab, mỗi tab đúng đơn (AC-12)
2. SO-1 hoá đơn paid ở "Đã thanh toán", SO-2 hoá đơn nháp ở "Chưa thanh toán/Lưu tạm" (AC-13)
3. Loại ngày "Ngày GH" + "7 ngày gần đây" + nhãn "Thiếu hàng" (AC-14)
4. Đủ 24 cột; đơn đã giao hiện GHN / VD123 / 20.000 (AC-15)
5. Gọi search với mọi bộ lọc không bao giờ ra SO-9 (AC-16)
6. Gửi đơn hàng, Thu COD, Gắn nhãn, Thống kê hàng hoá, In phiếu GH disabled + tooltip (AC-17)
7. Bấm dòng "Chưa thanh toán/Lưu tạm" → hoá đơn nháp mở vào tab checkout

## In scope
- Nhánh DELIVERY của `SearchBranchSalesOrdersQuery`
- Trang `OrderListPage`, route `/orders`, menu `don-hang`
- Mở hoá đơn nháp từ dòng

## Not in scope
- Action giao hàng (UOW-05)

## Risks
| Risk | Mitigation |
| --- | --- |
| Join invoices + invoice_debts làm chậm list | Index (organization_id, branch_id, delivery_status) + LEFT JOIN theo invoice_id; limit 100 |
| Restore draft chỉ tìm draft trong ca hiện tại | Kiểm tra `SearchDraftInvoicesV2` trước; nếu lọc theo session thì mở theo id |

## Definition of done
- [x] AC-12..AC-17 có bằng chứng (07-verification.md; 2026-09-25)
- [x] `pnpm --filter @erp/api test -- search-branch-sales-orders` xanh (07-verification.md; 2026-09-25)
- [x] `pnpm --filter @erp/pos-web build` xanh (07-verification.md; 2026-09-25)
