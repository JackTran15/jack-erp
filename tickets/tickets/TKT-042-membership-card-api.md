# TKT-042 MembershipCard + PointHistory entities & API

## Epic

[EPIC-007 POS Invoice, Customer Loyalty & Promotions](../epics/EPIC-007-pos-invoice-customer-promotions.md)

## Summary

Tạo entities `MembershipCardEntity` và `PointHistoryEntity`, migration, service và API cho thẻ thành viên khách hàng. Bao gồm phát hành thẻ, tra cứu thông tin thẻ, điều chỉnh điểm, và lịch sử điểm.

## Deliverables

- 1 migration file: `1778200000000-AddMembershipCardAndPointHistory.ts`
- `MembershipCardEntity` (`modules/customer/membership-card.entity.ts`)
- `PointHistoryEntity` (`modules/customer/point-history.entity.ts`)
- `MembershipCardService` (`modules/customer/services/membership-card.service.ts`)
- Endpoints trong CustomerController hoặc controller riêng
- Enum: `MembershipTier` (`none | silver | gold | diamond`), `PointType` (`earn | redeem | adjust`)

## Implementation Status

✅ **COMPLETED** — 2026-05-07

Files delivered:
- `apps/api/src/modules/customer/membership-card.entity.ts` — enum `MembershipTier`
- `apps/api/src/modules/customer/point-history.entity.ts` — enum `PointType`
- `apps/api/src/modules/customer/services/membership-card.service.ts`
- `apps/api/src/modules/customer/dto/issue-membership-card.dto.ts`
- `apps/api/src/modules/customer/dto/adjust-points.dto.ts`
- `apps/api/src/modules/customer/customer.controller.ts` — membership card endpoints
- `apps/api/src/modules/customer/services/membership-card.service.spec.ts` — 22 unit tests

## Acceptance Criteria

- [x] `POST /customers/:id/membership-card` phát hành thẻ; chỉ 1 thẻ per customer (unique).
- [x] `GET /customers/:id/membership-card` trả về thông tin thẻ + tier + points.
- [x] `PATCH /customers/:id/membership-card` cập nhật tier, expiry, lomas ref.
- [x] `GET /membership-cards/:cardId/points` lịch sử điểm (paginated).
- [x] `POST /membership-cards/:cardId/points` điều chỉnh điểm thủ công (`type=adjust`).
- [x] UPDATE `points` và INSERT `point_history` luôn trong 1 DB transaction.
- [x] `points` không bao giờ âm — validate trước khi `redeem`.

## Definition of Done

- [x] PR có migration + entities + service + endpoints; pass CI lint + build + unit tests.
- [x] Unit test: issue card, earn points, redeem points (đủ/không đủ), adjust.
- [x] Atomicity test: mock DB failure → point_history không tồn tại.

## Tech Approach

### `membership_cards`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | from BaseEntity |
| `customer_id` | uuid FK | → customers — UNIQUE |
| `card_number` | varchar | unique per org, auto-gen |
| `tier` | enum | `none \| silver \| gold \| diamond` |
| `points` | int | running total, không âm |
| `issued_at` | date | |
| `expires_at` | date | nullable |
| `lomas_card_number` | varchar | nullable |
| `lomas_tier` | varchar | nullable |
| `is_active` | boolean | |

### `point_history`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | |
| `card_id` | uuid FK | → membership_cards |
| `invoice_id` | uuid FK | → invoices — nullable |
| `type` | enum | `earn \| redeem \| adjust` |
| `delta` | int | dương = tích, âm = tiêu |
| `note` | text | nullable |
| `created_at` | timestamptz | |
| `created_by` | uuid | |

### Atomic point update

```typescript
await dataSource.transaction(async (em) => {
  await em.increment(MembershipCardEntity, { id: cardId }, 'points', delta);
  await em.insert(PointHistoryEntity, { cardId, delta, type, invoiceId, ... });
});
```

### Card number format

`MC` + org prefix (2 ký tự) + 6 số. Hoặc dùng DB sequence tương tự customer code.

## Testing Strategy

- Unit: mock transaction; test earn, redeem (đủ điểm), redeem (thiếu điểm → throw), adjust.
- Integration: tạo customer → issue card → earn 100 points → redeem 50 → verify points=50 và point_history có 2 rows.

## Dependencies

- Requires: TKT-041 (CustomerEntity ổn định), TKT-038 (InvoiceEntity — cho FK point_history.invoice_id).
- Blocks: TKT-044 (purchase history hiển thị điểm).
