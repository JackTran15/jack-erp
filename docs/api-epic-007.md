# API Documentation — EPIC-007: POS Invoice, Customer Loyalty & Promotions

> Base URL: `https://api.erp.internal/v1`
> All requests require `Authorization: Bearer <token>` and `X-Organization-Id: <orgId>` headers.
> All timestamps are ISO 8601 UTC. All monetary values are `decimal(18,2)`.

---

## Dependency Order

```
TKT-038 Invoice Entities          (foundation — no endpoints)
  └── TKT-039 Invoice CRUD        POST/GET/PATCH/DELETE /invoices
        └── TKT-040 Checkout      POST /invoices/:id/checkout
        └── TKT-043 Debt          GET|POST /invoices/debts/:id/payments
TKT-041 Customer Extensions       GET/POST/PATCH/DELETE /customers, /customer-groups
  └── TKT-042 Membership Card     POST/GET/PATCH /customers/:id/membership-card
  └── TKT-044 Purchase History    ❌ Not yet implemented
TKT-045 Promotion Entities        GET/POST/PATCH/DELETE /promotions/...
  └── TKT-046 Promotion Apply     POST /promotions/invoices/:id/apply
```

---

## TKT-039 — Invoice CRUD (Draft Lifecycle)

### Common response shape — `Invoice`

```json
{
  "id": "a1b2c3d4-0000-0000-0000-000000000001",
  "organizationId": "org-0001",
  "branchId": "branch-0001",
  "code": "DRAFT-1746123456789",
  "sessionId": "session-0001",
  "isDraft": true,
  "status": "draft",
  "draftLabel": "Bàn 3",
  "customerId": "cust-0001",
  "staffId": "user-0001",
  "subtotal": 500000.00,
  "discountAmount": 0.00,
  "depositAmount": 0.00,
  "amountDue": 500000.00,
  "paymentMethod": null,
  "cashTendered": null,
  "changeAmount": null,
  "issuedAt": null,
  "note": null,
  "priceListId": null,
  "createdAt": "2026-05-07T08:00:00.000Z",
  "updatedAt": "2026-05-07T08:00:00.000Z",
  "createdBy": "user-0001"
}
```

### `InvoiceItem` shape

```json
{
  "id": "item-row-0001",
  "invoiceId": "a1b2c3d4-0000-0000-0000-000000000001",
  "itemId": "item-0001",
  "locationId": "loc-0001",
  "itemCode": "SP001",
  "itemName": "Áo thun nam cổ tròn",
  "unit": "cái",
  "quantity": 2,
  "unitPrice": 200000.00,
  "lineDiscount": 0.00,
  "lineTotal": 400000.00,
  "sortOrder": 0,
  "note": null
}
```

---

### `POST /invoices`
**Tạo draft invoice mới**
Permission: `pos.invoice.write`

**Request body**
```json
{
  "sessionId": "session-0001",
  "customerId": "cust-0001",
  "draftLabel": "Bàn 3",
  "note": "Khách yêu cầu không tính VAT",
  "items": [
    {
      "itemId": "item-0001",
      "locationId": "loc-0001",
      "itemCode": "SP001",
      "itemName": "Áo thun nam cổ tròn",
      "unit": "cái",
      "quantity": 2,
      "unitPrice": 200000,
      "lineDiscount": 0,
      "sortOrder": 0
    },
    {
      "itemId": "item-0002",
      "locationId": "loc-0001",
      "itemCode": "SP002",
      "itemName": "Quần jean slim fit",
      "unit": "cái",
      "quantity": 1,
      "unitPrice": 450000,
      "lineDiscount": 50000,
      "sortOrder": 1
    }
  ]
}
```

**Response `201`**
```json
{
  "id": "a1b2c3d4-0000-0000-0000-000000000001",
  "code": "DRAFT-1746600000000",
  "isDraft": true,
  "status": "draft",
  "draftLabel": "Bàn 3",
  "customerId": "cust-0001",
  "subtotal": 800000.00,
  "discountAmount": 0.00,
  "depositAmount": 0.00,
  "amountDue": 800000.00,
  "items": [
    {
      "id": "item-row-0001",
      "itemCode": "SP001",
      "itemName": "Áo thun nam cổ tròn",
      "quantity": 2,
      "unitPrice": 200000.00,
      "lineDiscount": 0.00,
      "lineTotal": 400000.00,
      "locationId": "loc-0001"
    },
    {
      "id": "item-row-0002",
      "itemCode": "SP002",
      "itemName": "Quần jean slim fit",
      "quantity": 1,
      "unitPrice": 450000.00,
      "lineDiscount": 50000.00,
      "lineTotal": 400000.00,
      "locationId": "loc-0001"
    }
  ],
  "createdAt": "2026-05-07T08:00:00.000Z"
}
```

---

### `GET /invoices`
**Danh sách invoice có filter + phân trang**
Permission: `pos.invoice.read`

**Query params**

| Param | Type | Default | Mô tả |
|---|---|---|---|
| `status` | `draft\|pending\|paid\|debt\|cancelled` | — | Filter theo status |
| `isDraft` | `boolean` | — | Filter theo trạng thái draft |
| `customerId` | UUID | — | Filter theo khách hàng |
| `branchId` | UUID | — | Filter theo chi nhánh |
| `sessionId` | string | — | Filter theo session POS |
| `dateFrom` | ISO date | — | `issued_at ≥` |
| `dateTo` | ISO date | — | `issued_at ≤` |
| `page` | number | `1` | Trang hiện tại |
| `limit` | number | `20` | Số bản ghi (max 100) |

**Request**
```
GET /invoices?status=paid&dateFrom=2026-05-01&dateTo=2026-05-07&page=1&limit=20
```

**Response `200`**
```json
{
  "data": [
    {
      "id": "a1b2c3d4-0000-0000-0000-000000000001",
      "code": "INV-2605-00001",
      "isDraft": false,
      "status": "paid",
      "issuedAt": "2026-05-07T09:30:00.000Z",
      "customerId": "cust-0001",
      "branchId": "branch-0001",
      "subtotal": 800000.00,
      "discountAmount": 50000.00,
      "amountDue": 750000.00,
      "paymentMethod": "cash"
    }
  ],
  "total": 1
}
```

---

### `GET /invoices/drafts?session_id=:sessionId`
**Liệt kê tất cả drafts thuộc một POS session**
Permission: `pos.invoice.read`

**Request**
```
GET /invoices/drafts?session_id=session-0001
```

**Response `200`**
```json
[
  {
    "id": "a1b2c3d4-0000-0000-0000-000000000001",
    "code": "DRAFT-1746600000000",
    "isDraft": true,
    "status": "draft",
    "draftLabel": "Bàn 3",
    "subtotal": 800000.00,
    "amountDue": 800000.00,
    "createdAt": "2026-05-07T08:00:00.000Z"
  },
  {
    "id": "a1b2c3d4-0000-0000-0000-000000000002",
    "code": "DRAFT-1746600001000",
    "isDraft": true,
    "status": "draft",
    "draftLabel": "Bàn 5",
    "subtotal": 300000.00,
    "amountDue": 300000.00,
    "createdAt": "2026-05-07T08:15:00.000Z"
  }
]
```

---

### `GET /invoices/:id`
**Chi tiết invoice kèm items**
Permission: `pos.invoice.read`

**Response `200`**
```json
{
  "id": "a1b2c3d4-0000-0000-0000-000000000001",
  "code": "INV-2605-00001",
  "isDraft": false,
  "status": "paid",
  "issuedAt": "2026-05-07T09:30:00.000Z",
  "subtotal": 800000.00,
  "discountAmount": 50000.00,
  "depositAmount": 0.00,
  "amountDue": 750000.00,
  "paymentMethod": "cash",
  "cashTendered": 1000000.00,
  "changeAmount": 250000.00,
  "customerId": "cust-0001",
  "staffId": "user-0001",
  "items": [
    {
      "id": "item-row-0001",
      "itemCode": "SP001",
      "itemName": "Áo thun nam cổ tròn",
      "unit": "cái",
      "quantity": 2,
      "unitPrice": 200000.00,
      "lineDiscount": 0.00,
      "lineTotal": 400000.00,
      "locationId": "loc-0001",
      "sortOrder": 0
    }
  ]
}
```

**Response `404`**
```json
{ "statusCode": 404, "message": "Invoice a1b2c3d4 not found" }
```

---

### `PATCH /invoices/:id`
**Cập nhật draft invoice (chỉ khi `isDraft=true`)**
Permission: `pos.invoice.write`

**Request body** *(tất cả optional)*
```json
{
  "customerId": "cust-0002",
  "draftLabel": "Bàn 3 - cập nhật",
  "note": "Thêm note cho đơn",
  "items": [
    {
      "itemId": "item-0001",
      "locationId": "loc-0001",
      "itemCode": "SP001",
      "itemName": "Áo thun nam cổ tròn",
      "unit": "cái",
      "quantity": 3,
      "unitPrice": 200000,
      "lineDiscount": 0
    }
  ]
}
```

> **Note:** Gửi `items` sẽ **thay thế hoàn toàn** danh sách items hiện tại (delete + re-insert).

**Response `200`** — trả về invoice kèm items mới

**Response `400`** — nếu invoice không phải draft
```json
{ "statusCode": 400, "message": "Invoice a1b2c3d4 is not a draft and cannot be updated" }
```

---

### `DELETE /invoices/:id`
**Xóa draft invoice (chỉ khi `isDraft=true`)**
Permission: `pos.invoice.write`

**Response `204`** — No Content

**Response `400`**
```json
{ "statusCode": 400, "message": "Invoice a1b2c3d4 is not a draft and cannot be deleted" }
```

---

## TKT-040 — Invoice Checkout

### `POST /invoices/:id/checkout`
**Finalize draft → paid hoặc debt**
Permission: `pos.invoice.write`

**Checkout flow thực tế:**
1. Validate draft state
2. Validate tồn kho từng item
3. Commit DB transaction (invoice + debt nếu DEBT)
4. Trừ kho (`SALE_ISSUE`)
5. Ghi sổ kế toán
6. Publish event `SALE_POSTED` → Kafka
7. Emit `POS_CHECKOUT_ACKNOWLEDGED` → WebSocket

**Request body — CASH payment**
```json
{
  "paymentMethod": "cash",
  "cashTendered": 1000000,
  "depositAmount": 0,
  "note": "Khách thanh toán đủ",
  "cashAccountId": "acct-0001",
  "revenueAccountId": "acct-0002"
}
```

**Request body — BANK TRANSFER**
```json
{
  "paymentMethod": "bank_transfer",
  "cashAccountId": "acct-0003",
  "revenueAccountId": "acct-0002"
}
```

**Request body — DEBT (bán nợ)**
```json
{
  "paymentMethod": "debt",
  "cashAccountId": "acct-0004",
  "revenueAccountId": "acct-0002"
}
```

**Response `200` — CASH**
```json
{
  "id": "a1b2c3d4-0000-0000-0000-000000000001",
  "code": "INV-2605-00001",
  "isDraft": false,
  "status": "paid",
  "issuedAt": "2026-05-07T09:30:00.000Z",
  "subtotal": 800000.00,
  "discountAmount": 50000.00,
  "depositAmount": 0.00,
  "amountDue": 750000.00,
  "paymentMethod": "cash",
  "cashTendered": 1000000.00,
  "changeAmount": 250000.00
}
```

**Response `200` — DEBT** *(tự động tạo `invoice_debt`)*
```json
{
  "id": "a1b2c3d4-0000-0000-0000-000000000001",
  "code": "INV-2605-00002",
  "isDraft": false,
  "status": "debt",
  "issuedAt": "2026-05-07T10:00:00.000Z",
  "amountDue": 750000.00,
  "paymentMethod": "debt"
}
```

**Response `400` — không phải draft**
```json
{ "statusCode": 400, "message": "Invoice a1b2c3d4 is not a draft and cannot be checked out" }
```

**Response `400` — cashTendered không đủ**
```json
{ "statusCode": 400, "message": "Cash tendered (500000) is less than the amount due (750000)" }
```

**Response `400` — thiếu tồn kho**
```json
{ "statusCode": 400, "message": "Insufficient stock for item item-0001: available=1, requested=2" }
```

**Response `500` — stock movement thất bại (invoice đã revert về draft)**
```json
{ "statusCode": 500, "message": "Stock deduction failed. Invoice has been reverted to draft." }
```

---

### `POST /invoices/:id/debt`
**Shorthand checkout với `paymentMethod=debt`** — nhận cùng body với `/checkout`
Permission: `pos.invoice.write`

---

## TKT-043 — Invoice Debt & Debt Payment

### Common response shape — `InvoiceDebt`

```json
{
  "id": "debt-0001",
  "invoiceId": "a1b2c3d4-0000-0000-0000-000000000001",
  "referenceCode": "INV-2605-00002",
  "customerId": "cust-0001",
  "documentType": "credit_invoice",
  "originalAmount": 750000.00,
  "paidAmount": 0.00,
  "remainingAmount": 750000.00,
  "status": "open",
  "issuedAt": "2026-05-07",
  "dueDate": null,
  "settledAt": null,
  "note": null,
  "organizationId": "org-0001",
  "branchId": "branch-0001"
}
```

---

### `GET /invoices/customers/:customerId/debts`
**Danh sách công nợ của khách hàng**
Permission: `pos.invoice.read`

**Query params**

| Param | Type | Mô tả |
|---|---|---|
| `status` | `open\|paid\|overdue` | Filter theo trạng thái nợ |

**Request**
```
GET /invoices/customers/cust-0001/debts?status=open
```

**Response `200`**
```json
[
  {
    "id": "debt-0001",
    "referenceCode": "INV-2605-00002",
    "originalAmount": 750000.00,
    "paidAmount": 200000.00,
    "remainingAmount": 550000.00,
    "status": "open",
    "issuedAt": "2026-05-07",
    "dueDate": "2026-06-07"
  }
]
```

---

### `POST /invoices/debts/:debtId/payments`
**Thu nợ (thanh toán một phần hoặc toàn bộ)**
Permission: `pos.invoice.write`

**Request body**
```json
{
  "amount": 200000,
  "paymentMethod": "cash",
  "staffId": "user-0001",
  "note": "Khách trả tiền mặt lần 1"
}
```

**Response `201` — thanh toán một phần**
```json
{
  "id": "debt-0001",
  "referenceCode": "INV-2605-00002",
  "originalAmount": 750000.00,
  "paidAmount": 200000.00,
  "remainingAmount": 550000.00,
  "status": "open"
}
```

**Response `201` — thanh toán đủ** *(auto-settle)*
```json
{
  "id": "debt-0001",
  "originalAmount": 750000.00,
  "paidAmount": 750000.00,
  "remainingAmount": 0.00,
  "status": "paid",
  "settledAt": "2026-05-07T14:00:00.000Z"
}
```

**Response `400` — vượt quá số nợ còn lại**
```json
{ "statusCode": 400, "message": "Payment amount (800000) exceeds remaining debt (550000)" }
```

---

### `GET /invoices/debts/:debtId/payments`
**Lịch sử thu nợ**
Permission: `pos.invoice.read`

**Response `200`**
```json
[
  {
    "id": "pay-0001",
    "debtId": "debt-0001",
    "amount": 200000.00,
    "paymentMethod": "cash",
    "staffId": "user-0001",
    "paidAt": "2026-05-07T14:00:00.000Z",
    "note": "Khách trả tiền mặt lần 1"
  }
]
```

---

## TKT-041 — Customer Module Extensions

### Common response shape — `Customer`

```json
{
  "id": "cust-0001",
  "organizationId": "org-0001",
  "name": "Nguyễn Văn A",
  "email": "nguyen.van.a@example.com",
  "phone": "0901234567",
  "address": "123 Lê Lợi, Q.1, TP.HCM",
  "status": "active",
  "code": null,
  "birthDate": "1990-03-15",
  "gender": "male",
  "nationalId": "012345678901",
  "groupId": "grp-0001",
  "assignedStaffId": "user-0001",
  "note": "Khách VIP",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

---

### `POST /customers`
**Tạo khách hàng mới**
Permission: `customer.write`

**Request body**
```json
{
  "name": "Nguyễn Văn A",
  "email": "nguyen.van.a@example.com",
  "phone": "0901234567",
  "address": "123 Lê Lợi, Q.1, TP.HCM"
}
```

**Response `201`** — trả về `Customer` object

---

### `GET /customers`
**Danh sách khách hàng (phân trang)**
Permission: `customer.read`

**Request**
```
GET /customers?page=1&limit=20
```

---

### `GET /customers/:id`
**Chi tiết khách hàng**
Permission: `customer.read`

**Response `200`** — `Customer` object với đầy đủ fields mới (birthDate, gender, nationalId, groupId, note)

---

### `PATCH /customers/:id`
**Cập nhật khách hàng**
Permission: `customer.write`

**Request body** *(tất cả optional)*
```json
{
  "name": "Nguyễn Văn An",
  "gender": "male",
  "birthDate": "1990-03-15",
  "nationalId": "012345678901",
  "groupId": "grp-0001",
  "assignedStaffId": "user-0001",
  "note": "Khách VIP, ưu tiên phục vụ"
}
```

**Enum `gender`:** `male | female | unspecified`

---

### `DELETE /customers/:id`
**Xóa khách hàng**
Permission: `customer.write`

**Response `204`**

---

### `POST /customers/groups`
**Tạo nhóm khách hàng**
Permission: `customer.write`

**Request body**
```json
{
  "name": "VIP",
  "description": "Khách hàng mua trên 10 triệu/tháng"
}
```

**Response `201`**
```json
{
  "id": "grp-0001",
  "name": "VIP",
  "description": "Khách hàng mua trên 10 triệu/tháng",
  "organizationId": "org-0001"
}
```

---

### `GET /customers/groups` · `GET /customers/groups/:id` · `PATCH /customers/groups/:id` · `DELETE /customers/groups/:id`
CRUD tiêu chuẩn. Permission: `customer.read` / `customer.write`.

---

## TKT-042 — Membership Card & Points

### Common response shape — `MembershipCard`

```json
{
  "id": "card-0001",
  "customerId": "cust-0001",
  "cardNumber": "MC-ORG1-000001",
  "tier": "gold",
  "points": 1500,
  "issuedAt": "2026-01-15",
  "expiresAt": "2027-01-15",
  "lomasCardNumber": null,
  "lomasTier": null,
  "isActive": true
}
```

**Enum `tier`:** `none | silver | gold | diamond`

---

### `POST /customers/:id/membership-card`
**Phát hành thẻ thành viên (1 thẻ / 1 customer)**
Permission: `customer.write`

**Request body**
```json
{
  "tier": "none",
  "issuedAt": "2026-05-07",
  "expiresAt": "2027-05-07",
  "lomasCardNumber": null,
  "lomasTier": null
}
```

**Response `201`** — `MembershipCard` object

**Response `400`** — đã có thẻ
```json
{ "statusCode": 400, "message": "Customer cust-0001 already has a membership card" }
```

---

### `GET /customers/:id/membership-card`
**Xem thông tin thẻ**
Permission: `customer.read`

**Response `200`** — `MembershipCard` object

---

### `PATCH /customers/:id/membership-card`
**Cập nhật tier / expiry / Lomas sync**
Permission: `customer.write`

**Request body** *(tất cả optional)*
```json
{
  "tier": "gold",
  "expiresAt": "2028-05-07",
  "lomasCardNumber": "LM-98765",
  "lomasTier": "platinum"
}
```

---

### `GET /customers/membership-cards/:cardId/points`
**Lịch sử điểm (phân trang)**
Permission: `customer.read`

**Query:** `?page=1&limit=20`

**Response `200`**
```json
{
  "data": [
    {
      "id": "ph-0001",
      "cardId": "card-0001",
      "type": "earn",
      "delta": 150,
      "invoiceId": "a1b2c3d4-0000-0000-0000-000000000001",
      "note": null,
      "createdAt": "2026-05-07T09:30:00.000Z"
    },
    {
      "id": "ph-0002",
      "cardId": "card-0001",
      "type": "redeem",
      "delta": -50,
      "invoiceId": null,
      "note": "Đổi ưu đãi",
      "createdAt": "2026-05-07T10:00:00.000Z"
    }
  ],
  "total": 2
}
```

**Enum `type`:** `earn | redeem | adjust`

---

### `POST /customers/membership-cards/:cardId/points`
**Điều chỉnh điểm thủ công**
Permission: `customer.write`

**Request body**
```json
{
  "type": "adjust",
  "delta": 200,
  "invoiceId": null,
  "note": "Bonus điểm tháng 5"
}
```

> `delta` âm khi `type=redeem`. `points` không bao giờ < 0.

**Response `201`** — `PointHistory` row + updated `card.points`

**Response `400`** — điểm không đủ để redeem
```json
{ "statusCode": 400, "message": "Insufficient points: available=30, requested=50" }
```

---

## TKT-045 — Promotion Entities

### `GET /promotions/discount-codes`
Permission: `pos.promotion.read`

**Response `200`**
```json
[
  {
    "id": "dc-0001",
    "code": "SALE10",
    "discountType": "percentage",
    "discountValue": 10,
    "minOrderValue": 200000.00,
    "maxUses": 100,
    "usedCount": 23,
    "validFrom": "2026-05-01T00:00:00.000Z",
    "validTo": "2026-05-31T23:59:59.000Z",
    "isActive": true
  }
]
```

**Enum `discountType`:** `percentage | fixed_amount`

---

### `POST /promotions/discount-codes`
Permission: `pos.promotion.write`

**Request body**
```json
{
  "code": "SALE10",
  "discountType": "percentage",
  "discountValue": 10,
  "minOrderValue": 200000,
  "maxUses": 100,
  "validFrom": "2026-05-01T00:00:00.000Z",
  "validTo": "2026-05-31T23:59:59.000Z"
}
```

---

### `POST /promotions/discount-codes/:code/validate`
**Validate mã giảm giá trước khi apply**
Permission: `pos.promotion.read`

**Request body**
```json
{ "orderValue": 500000 }
```

**Response `200`** — hợp lệ
```json
{
  "valid": true,
  "code": "SALE10",
  "discountType": "percentage",
  "discountValue": 10,
  "discountAmount": 50000.00
}
```

**Response `400`** — hết lượt dùng
```json
{ "statusCode": 400, "message": "Discount code SALE10 has reached maximum uses (100)" }
```

**Response `400`** — chưa đến ngày hoặc đã hết hạn
```json
{ "statusCode": 400, "message": "Discount code SALE10 is not yet valid or has expired" }
```

---

### `GET /promotions/vouchers`
**Danh sách vouchers**
Permission: `pos.promotion.read`

**Response `200`**
```json
[
  {
    "id": "vchr-0001",
    "code": "VCH-GIFT-001",
    "faceValue": 100000.00,
    "customerId": "cust-0001",
    "validFrom": "2026-05-01T00:00:00.000Z",
    "validTo": "2026-12-31T23:59:59.000Z",
    "isUsed": false,
    "redeemedInvoiceId": null,
    "isActive": true
  }
]
```

---

### `POST /promotions/vouchers`
Permission: `pos.promotion.write`

**Request body**
```json
{
  "code": "VCH-GIFT-001",
  "faceValue": 100000,
  "customerId": "cust-0001",
  "validFrom": "2026-05-01T00:00:00.000Z",
  "validTo": "2026-12-31T23:59:59.000Z"
}
```

> `customerId = null` → generic voucher, bất kỳ ai dùng được.

---

### `POST /promotions/vouchers/:code/validate`
**Validate voucher**
Permission: `pos.promotion.read`

**Request body**
```json
{ "customerId": "cust-0001" }
```

**Response `200`** — hợp lệ
```json
{
  "valid": true,
  "code": "VCH-GIFT-001",
  "faceValue": 100000.00
}
```

**Response `400`** — voucher đã dùng
```json
{ "statusCode": 400, "message": "Voucher VCH-GIFT-001 has already been used" }
```

**Response `400`** — sai khách hàng
```json
{ "statusCode": 400, "message": "Voucher VCH-GIFT-001 is assigned to a different customer" }
```

---

### `GET /promotions/programs`
**Danh sách chương trình khuyến mãi**
Permission: `pos.promotion.read`

**Response `200`**
```json
[
  {
    "id": "promo-0001",
    "name": "Mua 2 tặng 1 áo thun",
    "type": "buy_x_get_y",
    "conditions": {
      "min_order_value": 500000,
      "required_item_ids": ["item-0001"],
      "required_customer_tier": "none",
      "can_stack": false
    },
    "benefits": {
      "discount_type": "fixed_amount",
      "discount_value": 200000,
      "free_item_id": "item-0001",
      "free_quantity": 1
    },
    "validFrom": "2026-05-01T00:00:00.000Z",
    "validTo": "2026-05-31T23:59:59.000Z",
    "applicableBranchIds": [],
    "isActive": true
  }
]
```

**Enum `type`:** `order_discount | gift_product | buy_x_get_y | product_discount`

---

### `POST /promotions/programs`
Permission: `pos.promotion.write`

**Request body**
```json
{
  "name": "Giảm 5% cho đơn từ 500k",
  "type": "order_discount",
  "conditions": {
    "min_order_value": 500000,
    "can_stack": true
  },
  "benefits": {
    "discount_type": "percentage",
    "discount_value": 5,
    "free_item_id": null,
    "free_quantity": 0
  },
  "validFrom": "2026-05-01T00:00:00.000Z",
  "validTo": "2026-05-31T23:59:59.000Z",
  "applicableBranchIds": ["branch-0001"]
}
```

---

### `PATCH /promotions/discount-codes/:id` · `PATCH /promotions/vouchers/:id` · `PATCH /promotions/programs/:id`
Update tương ứng. Chỉ các field gửi lên mới được update.

### `DELETE /promotions/discount-codes/:id` · `DELETE /promotions/vouchers/:id` · `DELETE /promotions/programs/:id`
**Soft delete** — set `isActive = false`, không xóa khỏi DB.

---

## TKT-046 — Promotion Apply Service

### `POST /promotions/invoices/:invoiceId/apply`
**Áp dụng ưu đãi vào draft invoice**
Permission: `pos.promotion.write`

**Request body**
```json
{
  "type": "discount_code",
  "code": "SALE10"
}
```

**Enum `type`:** `discount_code | voucher | promotion`

**Ví dụ — apply voucher**
```json
{
  "type": "voucher",
  "code": "VCH-GIFT-001"
}
```

**Ví dụ — apply chương trình**
```json
{
  "type": "promotion",
  "code": "promo-0001"
}
```

**Response `201`** — invoice sau khi recalculate discount
```json
{
  "id": "a1b2c3d4-0000-0000-0000-000000000001",
  "subtotal": 800000.00,
  "discountAmount": 80000.00,
  "amountDue": 720000.00,
  "appliedPromotions": [
    {
      "id": "ip-0001",
      "promotionType": "discount_code",
      "refId": "dc-0001",
      "discountAmount": 80000.00,
      "note": "SALE10"
    }
  ]
}
```

**Response `400`** — invoice không phải draft
```json
{ "statusCode": 400, "message": "Invoice a1b2c3d4 is not a draft" }
```

**Response `400`** — stacking conflict
```json
{ "statusCode": 400, "message": "Cannot stack promotions: an existing promotion does not allow stacking" }
```

**Response `400`** — voucher sai khách hàng
```json
{ "statusCode": 400, "message": "Voucher VCH-GIFT-001 is assigned to a different customer" }
```

**Response `400`** — đơn hàng chưa đạt min_order_value
```json
{ "statusCode": 400, "message": "Order value (300000) does not meet minimum required (500000)" }
```

---

### `DELETE /promotions/invoices/:invoiceId/:promotionId`
**Gỡ ưu đãi khỏi draft invoice**
Permission: `pos.promotion.write`

**Response `200`** — invoice sau khi recalculate
```json
{
  "id": "a1b2c3d4-0000-0000-0000-000000000001",
  "subtotal": 800000.00,
  "discountAmount": 0.00,
  "amountDue": 800000.00,
  "appliedPromotions": []
}
```

> Nếu promotion là voucher → revert `voucher.is_used = false`.
> Nếu promotion là discount_code → revert `discount_code.used_count--`.

---

## TKT-044 — Purchase History ❌ Not Implemented

> **Trạng thái:** Chưa implement. Endpoints dưới đây là spec dự kiến.

### `GET /customers/:id/invoices` *(planned)*

**Query params:** `date_from`, `date_to`, `status`, `branch_id`, `page`, `limit`

**Response dự kiến `200`**
```json
{
  "data": [
    {
      "code": "INV-2605-00001",
      "issuedAt": "2026-05-07T09:30:00.000Z",
      "branchId": "branch-0001",
      "branchName": "Chi nhánh Quận 1",
      "subtotal": 800000.00,
      "discountAmount": 50000.00,
      "amountDue": 750000.00,
      "paymentMethod": "cash",
      "status": "paid"
    }
  ],
  "total": 1
}
```

### `GET /customers/:id/invoices/:invoiceId` *(planned)*

**Response dự kiến `200`** — invoice detail với `items[]` dùng snapshot fields (không JOIN sang items table).

---

## Error Codes Summary

| HTTP | Mô tả |
|---|---|
| `400` | Validation lỗi, business rule vi phạm |
| `401` | Thiếu / sai token |
| `403` | Không có permission |
| `404` | Resource không tồn tại hoặc không thuộc org |
| `409` | Conflict (trùng unique key) |
| `500` | Lỗi hệ thống (stock failure, external service) |

## Enums Reference

| Enum | Values |
|---|---|
| `InvoiceStatus` | `draft \| pending \| paid \| debt \| cancelled` |
| `InvoicePaymentMethod` | `cash \| bank_transfer \| card \| debt` |
| `DebtStatus` | `open \| paid \| overdue` |
| `DebtDocumentType` | `credit_invoice \| payment_receipt \| adjustment` |
| `DebtPaymentMethod` | `cash \| bank_transfer` |
| `MembershipTier` | `none \| silver \| gold \| diamond` |
| `PointType` | `earn \| redeem \| adjust` |
| `Gender` | `male \| female \| unspecified` |
| `DiscountType` | `percentage \| fixed_amount` |
| `PromotionType` | `order_discount \| gift_product \| buy_x_get_y \| product_discount` |
| `InvoicePromotionType` | `discount_code \| voucher \| promotion` |
