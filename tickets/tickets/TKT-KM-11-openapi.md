# TKT-KM-11 OpenAPI regen + api-client snapshot

## Epic

[EPIC-22072026 Khuyến mại — schema chuẩn hóa, domain engine & evaluate API](../epics/EPIC-22072026-promotion-programs-engine.md)

## Summary

Sinh lại `@erp/api-client` sau khi 4 ticket backend (KM-07, KM-08, KM-09, KM-10) đã thêm xong endpoint. Cổng chặn giữa backend và frontend — TKT-KM-12 trở đi phụ thuộc type sinh ra từ đây.

## Deliverables

- `openapi.snapshot.json` — cập nhật.
- `packages/api-client/src/generated/schema.ts` — cập nhật (**sinh tự động, cấm sửa tay**).

## Acceptance Criteria

- [ ] Chạy đúng quy trình: khởi động API (`make dev-api`) → `pnpm openapi:generate` → commit cả 2 file.
- [ ] Diff chỉ chứa endpoint mới của promotion/voucher. Nếu diff động tới module khác → dừng lại, tìm nguyên nhân (thường là ai đó đã đổi DTO mà chưa regen), **không** commit đè.
- [ ] Snapshot chứa đủ 12 route mới:
  - `POST /v2/promotions/search`, `GET /v2/promotions/{id}`, `POST /v2/promotions`, `PUT /v2/promotions/{id}`, `POST /v2/promotions/{id}/duplicate`, `PATCH /v2/promotions/{id}/status`, `DELETE /v2/promotions/{id}`, `POST /v2/promotions/evaluate`
  - `POST /v2/vouchers/search`, `POST /v2/vouchers`, `PUT /v2/vouchers/{id}`, `POST /v2/vouchers/{id}/duplicate`, `DELETE /v2/vouchers/{id}`
- [ ] Schema sinh ra có đủ enum promotion với **đúng** giá trị (đối chiếu `@erp/shared-interfaces`); nếu enum ra dạng `string` trần thì thiếu `@ApiProperty({ enum: ... })` ở DTO → quay lại sửa DTO rồi regen.
- [ ] `CreatePromotionDto` sinh ra có mọi trường của cả 5 hình thức, các trường điều kiện là optional.
- [ ] `pnpm build:shared` và `pnpm --filter @erp/backoffice-web build` xanh với client mới.

## Definition of Done

- [ ] `packages/api-client/src/generated/schema.ts` không bị sửa tay (kiểm bằng: chạy lại `openapi:generate` lần 2 → `git diff` rỗng).
- [ ] `pnpm build` toàn workspace xanh.
- [ ] Commit riêng cho bước regen, không trộn với thay đổi logic — dễ review và dễ revert.

## Tech Approach

```bash
make dev-api                      # terminal riêng, đợi API lắng nghe :4000
pnpm openapi:generate
git diff --stat openapi.snapshot.json packages/api-client/src/generated/schema.ts
```

Nếu `openapi:generate` báo không kết nối được `:4000`: kiểm tra `DISABLE_SWAGGER` và `NODE_ENV` — `/docs-json` bị tắt khi `NODE_ENV=production` hoặc `DISABLE_SWAGGER=1`.

## Testing Strategy

Không có test. Bảo chứng bằng build: nếu type sinh ra sai, TKT-KM-12 sẽ không compile.

## Dependencies

- Depends on: TKT-KM-07, TKT-KM-08, TKT-KM-09, TKT-KM-10
- Blocks: TKT-KM-12
