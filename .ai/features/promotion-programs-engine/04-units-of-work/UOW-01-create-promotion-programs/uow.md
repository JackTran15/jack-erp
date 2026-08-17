---
id: UOW-01
slug: create-promotion-programs
title: Marketing tạo, sửa, nhân bản và xóa CTKM đủ 5 hình thức
demoable: true
duration: 2d
depends_on: []
requirements: [US-01]
verifies: [AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20]
risk: high
status: in_progress
rollback: 2 migration mới có `down()` gỡ sạch 7 bảng + 15 enum; module cũ (`promotions` jsonb) không bị đụng nên POS vẫn chạy nguyên
---

# UOW-01 — Vòng đời CTKM qua API

Đường ghi end-to-end: schema → domain invariant → repository → command handler → HTTP.
Demo bằng REST client vì UI của hình thức nằm ở UOW-04; lát cắt này vẫn demo được vì nó tạo ra
dữ liệu thật, nhìn thấy được, và người dùng nghiệp vụ hiểu được kết quả.

## Demo script

1. `make dev-api`, đăng nhập lấy token có quyền `promotion.write`, đặt header `X-Branch-Id`.
2. `POST /v2/promotions` lần lượt 5 hình thức (`INVOICE_DISCOUNT`, `ITEM_DISCOUNT`,
   `TIERED_DISCOUNT`, `GIFT_ITEM`, `BUY_M_GET_N`) — mỗi lần nhận 201 kèm `code` dạng `KM00001`.
3. `GET /v2/promotions/{id}` từng cái, đối chiếu với body đã gửi: đủ `groups`, `lines`,
   `tiers`, `condition`, `branchIds`, `customerGroupIds`.
4. `PUT` đổi `type` → 400 `PROMOTION_TYPE_IMMUTABLE`.
5. `POST /{id}/duplicate` → `code` mới, `status = TRACKING`, số group/line/tier bằng bản gốc.
6. `PATCH /{id}/status` → `STOPPED`; `DELETE /{id}` → `GET` trả 404 nhưng dòng vẫn còn trong DB
   với `deleted_at`.
7. Gửi lại bước 2 với cùng `X-Idempotency-Key` và cùng body → `X-Idempotency-Status: REPLAYED`,
   DB vẫn 1 dòng. Đổi body giữ nguyên key → 409.
8. Đăng nhập tổ chức khác, `GET` cùng id → 404.

## In scope

- Schema chuẩn hóa: 7 bảng, 15 pg enum, `DocumentType.PROMOTION`, 3 permission key.
- Enum + DTO dùng chung trong `@erp/shared-interfaces`.
- Aggregate `PromotionProgram` với toàn bộ invariant BR-004 (trả **mọi** lỗi một lần).
- 7 TypeORM entity, repository ghi trọn aggregate trong một transaction, mapper hai chiều.
- 5 command + phần mutation của `promotion-v2.controller.ts`.

## Not in scope

- Đọc danh sách và lọc (UOW-03), tính khuyến mại (UOW-02), giao diện form (UOW-04).
- Voucher (UOW-06).

## Risks

| Risk | Mitigation |
|---|---|
| Mapper entity↔domain mất dữ liệu âm thầm khi round-trip | Test theo hướng round-trip: `toDomain(toPersistence(p))` phải `toEqual(p)` (T-01-04) |
| Lệch một giá trị enum giữa pg và TS → 500 lúc runtime | Enum TS là nguồn duy nhất, dùng thẳng trong `@Column({ type: 'enum' })`; lệch lộ ở lần insert đầu (T-01-02, T-01-04) |
| `ALTER TYPE … ADD VALUE` chung file với câu dùng giá trị mới → `55P04` | Tách file migration riêng, theo mẫu `AddGoodsReceiptToDocumentTypeEnum` (T-01-01) |
| Nhầm `promotion_programs.branch_id` (chi nhánh người tạo) với phạm vi áp dụng | Ghi rõ ở comment cột và ở A-05; branch scope chỉ đọc `promotion_branches` (T-01-04) |

## Definition of done

- [ ] AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20 pass
- [ ] `pnpm --filter @erp/api test -- promotion` xanh sau khi `build:shared` (T-07-01)
- [ ] `migration:run` → `revert` ×2 → `run` lại vẫn sạch trên DB có dữ liệu
- [ ] Không file nào dưới `domain/` import `@nestjs/*` hoặc `typeorm`
- [ ] Demo script chạy hết và được nghiệm thu ở gate G4
