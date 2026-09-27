---
id: UOW-03
slug: delivery-partners
title: Danh mục đối tác giao hàng — backoffice CRUD + list cho POS
demoable: true
duration: 1d
depends_on: [UOW-02]
requirements: [US-03]
verifies: [AC-10, AC-11]
risk: low
status: todo
rollback: gỡ đăng ký CRUD + NavChild; bảng vẫn còn (nằm trong migration UOW-02)
---

# UOW-03 — Danh mục đối tác giao hàng — backoffice CRUD + list cho POS

## Demo script
1. Backoffice /admin/delivery-partners: thêm GHN mã GHN; thêm lần hai cùng mã → 409 (AC-10)
2. Đặt GHTK inactive; `GET /mobile/delivery-partners` chỉ trả GHN (AC-11)

## In scope
- `DeliveryPartnerCrudService` + đăng ký generic CRUD (ADR-02)
- `GET /mobile/delivery-partners`
- NavChild backoffice

## Not in scope
- Dialog Giao hàng (UOW-05)

## Risks
| Risk | Mitigation |
| --- | --- |
| Permission CRUD cho entity mới chưa có | Dùng cùng permission quản trị như `sales-channels`; ghi trong ticket |

## Definition of done
- [x] AC-10, AC-11 có bằng chứng (07-verification.md; 2026-09-25)
- [x] `pnpm --filter @erp/api test -- delivery-partner` xanh (07-verification.md; 2026-09-25)
