---
id: UOW-02
slug: process-online-orders
title: Nhận xử lý đơn online — duyệt + tạo hoá đơn nháp, vào vòng đời giao
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-02, US-07]
verifies: [AC-06, AC-07, AC-08, AC-09, AC-27, AC-28]
risk: high
status: todo
rollback: migration:revert 1790100700000 (cột mới nullable, enum value không xoá được — để lại vô hại); gỡ route POST process
---

# UOW-02 — Nhận xử lý đơn online — duyệt + tạo hoá đơn nháp, vào vòng đời giao

## Demo script
1. Mở ca ở CN-A. Trên "Đơn hàng online" tick SO-1 → "Nhận xử lý" → toast "1/1 đơn đã nhận xử lý" (AC-06)
2. [DB] SO-1: confirmed_at có, status PROCESSED, invoice_id → hoá đơn nháp shipping_fee_amount 30.000, delivery_status AWAITING_PICKUP; events CONFIRM + PROCESS (AC-06)
3. Tick SO-1 (đã xử lý) + SO-2 → "1/2" kèm lý do của SO-1 (AC-07); nút disabled khi chỉ tick đơn đã xử lý (AC-09)
4. Đóng ca → Nhận xử lý SO-2 → "Chi nhánh chưa mở ca", SO-2 không đổi (AC-08)

## In scope
- Migration 1790100700000: `delivery_status` + 6 cột giao trên `sales_orders`, `delivery_partners`, enum action mới, permission `pos.sales-order.deliver`, backfill
- `approve()` set AWAITING_PICKUP + event PROCESS
- `POST /mobile/sales-orders/process` batch (ADR-07)
- Nhãn lịch sử cho action mới (T-02-04, chuyển từ T-05-03)
- Chặn duyệt đơn lẻ khác chi nhánh (T-02-05, AC-28)
- Nút Nhận xử lý + toast kết quả batch

## Not in scope
- CRUD đối tác (UOW-03)
- lưới Đơn hàng (UOW-04)

## Risks
| Risk | Mitigation |
| --- | --- |
| `ALTER TYPE ADD VALUE` trong transaction migration | Chỉ thêm giá trị, không dùng trong cùng migration; kiểm bằng `migration:run` trên erp_test |
| Backfill đưa đơn PROCESSED có hoá đơn đã huỷ vào lưới | Backfill join `invoices.status <> cancelled` |

## Definition of done
- [x] AC-06..AC-09 có bằng chứng (07-verification.md; 2026-09-25)
- [x] `pnpm migration:run` + `migration:revert` sạch trên DB local (T-02-01: run → revert → run trên erp_dev_3008, 2026-09-24; không chạy lại revert vì sẽ xoá dữ liệu demo)
- [x] `pnpm --filter @erp/api test -- sales-order.service` xanh (07-verification.md; 2026-09-25)
- [x] `pnpm --filter @erp/api test -- sales-order-history` xanh (07-verification.md; 2026-09-25)
