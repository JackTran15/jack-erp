# EPIC-007 — Draft Review Checklist
> POS Invoice · Customer CRM · Promotions
> **Status:** Staged, chưa commit/push
> **Date:** 2026-05-07

---

## Modules đang implement

### 1. POS — Invoice (`modules/pos`)

#### Entities
- [ ] `Invoice` — entity chính của hóa đơn
- [ ] `InvoiceItem` — chi tiết dòng hàng trong hóa đơn
- [ ] `InvoiceDebt` — công nợ phát sinh từ hóa đơn
- [ ] `DebtPayment` — ghi nhận thanh toán công nợ

#### Services
- [ ] `invoice.service` — CRUD hóa đơn cơ bản
- [ ] `checkout-invoice.service` — luồng thanh toán hóa đơn
- [ ] `invoice-debt.service` — quản lý công nợ & thu tiền
- [ ] `cancel-invoice.service` — hủy hóa đơn

#### API Endpoints
| #   | Method | Path                                    | Chức năng              | Review |
| --- | ------ | --------------------------------------- | ---------------------- | ------ |
| 1   | POST   | `/invoices`                             | Tạo hóa đơn draft      | - [ ]  |
| 2   | GET    | `/invoices`                             | Danh sách hóa đơn      | - [ ]  |
| 3   | GET    | `/invoices/drafts`                      | Danh sách draft        | - [ ]  |
| 4   | GET    | `/invoices/:id`                         | Chi tiết hóa đơn       | - [ ]  |
| 5   | PATCH  | `/invoices/:id`                         | Cập nhật hóa đơn       | - [ ]  |
| 6   | DELETE | `/invoices/:id`                         | Xóa hóa đơn draft      | - [ ]  |
| 7   | POST   | `/invoices/:id/checkout`                | Thanh toán hóa đơn     | - [ ]  |
| 8   | POST   | `/invoices/:id/cancel`                  | Hủy hóa đơn            | - [ ]  |
| 9   | POST   | `/invoices/:id/debt`                    | Đánh dấu là công nợ    | - [ ]  |
| 10  | GET    | `/invoices/customers/:customerId/debts` | Xem công nợ khách hàng | - [ ]  |
| 11  | GET    | `/invoices/debts/:debtId/payments`      | Lịch sử thanh toán nợ  | - [ ]  |
| 12  | POST   | `/invoices/debts/:debtId/payments`      | Thu tiền công nợ       | - [ ]  |

#### Migrations
- [ ] `1778000000000-AddPosInvoiceEntities` — tạo bảng invoice entities
- [ ] `1778500001000-AddLocationIdToInvoiceItems` — thêm `locationId` vào invoice_items
- [ ] `1778600000000-AddInvoiceCancelFields` — thêm fields cancel vào invoice

---

### 2. Customer — CRM Extension (`modules/customer`)

#### Entities mới
- [ ] `MembershipCard` — thẻ thành viên
- [ ] `PointHistory` — lịch sử điểm tích lũy
- [ ] `CustomerGroup` — nhóm khách hàng

#### Services mới
- [ ] `membership-card.service` — phát hành & quản lý thẻ
- [ ] `customer-group.service` — CRUD nhóm khách hàng

#### API Endpoints
| #   | Method | Path                               | Chức năng                | Review |
| --- | ------ | ---------------------------------- | ------------------------ | ------ |
| 1   | POST   | `/customers/:id/membership-card`   | Phát hành thẻ thành viên | - [ ]  |
| 2   | GET    | `/customers/:id/membership-card`   | Xem thẻ thành viên       | - [ ]  |
| 3   | PATCH  | `/customers/:id/membership-card`   | Cập nhật thẻ             | - [ ]  |
| 4   | GET    | `/membership-cards/:cardId/points` | Xem lịch sử điểm         | - [ ]  |
| 5   | POST   | `/membership-cards/:cardId/points` | Điều chỉnh điểm          | - [ ]  |
| 6   | POST   | `/customers/groups`                | Tạo nhóm khách hàng      | - [ ]  |
| 7   | GET    | `/customers/groups`                | Danh sách nhóm           | - [ ]  |
| 8   | GET    | `/customers/groups/:id`            | Chi tiết nhóm            | - [ ]  |
| 9   | PATCH  | `/customers/groups/:id`            | Cập nhật nhóm            | - [ ]  |
| 10  | DELETE | `/customers/groups/:id`            | Xóa nhóm                 | - [ ]  |

#### Migrations
- [ ] `1778100000000-ExtendCustomerAndMembershipCard` — mở rộng bảng customer & membership card

---

### 3. Promotion — Khuyến mãi (`modules/promotion`)

#### Entities
- [ ] `DiscountCode` — mã giảm giá
- [ ] `Voucher` — voucher
- [ ] `Promotion` — chương trình khuyến mãi
- [ ] `InvoicePromotion` — liên kết khuyến mãi ↔ hóa đơn

#### Services
- [ ] `discount-code.service` — quản lý mã giảm giá
- [ ] `voucher.service` — quản lý voucher
- [ ] `promotion.service` — quản lý chương trình khuyến mãi
- [ ] `promotion-apply.service` — áp dụng khuyến mãi vào hóa đơn

#### API Endpoints
| #   | Method | Path                                           | Chức năng                 | Review |
| --- | ------ | ---------------------------------------------- | ------------------------- | ------ |
| 1   | GET    | `/promotions/discount-codes`                   | Danh sách mã giảm giá     | - [ ]  |
| 2   | POST   | `/promotions/discount-codes`                   | Tạo mã giảm giá           | - [ ]  |
| 3   | PATCH  | `/promotions/discount-codes/:id`               | Cập nhật mã               | - [ ]  |
| 4   | DELETE | `/promotions/discount-codes/:id`               | Vô hiệu hóa mã            | - [ ]  |
| 5   | POST   | `/promotions/discount-codes/:code/validate`    | Validate mã giảm giá      | - [ ]  |
| 6   | GET    | `/promotions/vouchers`                         | Danh sách voucher         | - [ ]  |
| 7   | POST   | `/promotions/vouchers`                         | Tạo voucher               | - [ ]  |
| 8   | PATCH  | `/promotions/vouchers/:id`                     | Cập nhật voucher          | - [ ]  |
| 9   | DELETE | `/promotions/vouchers/:id`                     | Vô hiệu hóa voucher       | - [ ]  |
| 10  | POST   | `/promotions/vouchers/:code/validate`          | Validate voucher          | - [ ]  |
| 11  | GET    | `/promotions/programs`                         | Danh sách chương trình KM | - [ ]  |
| 12  | POST   | `/promotions/programs`                         | Tạo chương trình KM       | - [ ]  |
| 13  | PATCH  | `/promotions/programs/:id`                     | Cập nhật chương trình     | - [ ]  |
| 14  | DELETE | `/promotions/programs/:id`                     | Vô hiệu hóa chương trình  | - [ ]  |
| 15  | POST   | `/promotions/invoices/:invoiceId/apply`        | Áp dụng KM vào hóa đơn    | - [ ]  |
| 16  | DELETE | `/promotions/invoices/:invoiceId/:promotionId` | Gỡ KM khỏi hóa đơn        | - [ ]  |

#### Migrations
- [ ] `1778400000000-AddPromotionEntities` — tạo bảng promotion entities

---

## Checklist tổng thể trước khi commit

### Code quality
- [ ] Unit tests pass (`membership-card.service.spec`, `checkout-invoice.service.spec`, `invoice-debt.service.spec`, `invoice.service.spec`, `discount-code.service.spec`, `voucher.service.spec`, `promotion-apply.service.spec`)
- [ ] Không có `console.log` thừa
- [ ] DTO validation đầy đủ
- [ ] Guard / RBAC đã gắn đúng trên các endpoint nhạy cảm

### Database
- [ ] Migration chạy `up` thành công
- [ ] Migration chạy `down` (rollback) không lỗi
- [ ] Index đã tạo cho các foreign key thường query

### Business logic
- [ ] Invoice: không thể checkout khi đã cancel
- [ ] Invoice: không thể cancel khi đã checkout
- [ ] Debt: tổng payment không vượt quá debt amount
- [ ] Points: balance không âm sau khi trừ điểm
- [ ] DiscountCode: validate expiry date & usage limit
- [ ] Voucher: validate expiry date & đã dùng chưa

### Integration
- [ ] `app.module.ts` đã import đủ module mới
- [ ] Journal service cập nhật đúng bút toán khi checkout invoice
- [ ] Shared interfaces / kafka topics đã sync

---

## Notes
<!-- Ghi chú khi review -->

