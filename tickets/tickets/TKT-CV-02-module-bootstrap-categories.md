# TKT-CV-02 Cash vouchers — module bootstrap + categories

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only.

## Summary

Dựng skeleton `CashVouchersModule`: entity classes cho cả 6 bảng, DTOs (create/update/reverse/query), wiring module vào `accounting.module.ts`, đăng ký `cash-voucher-categories` qua `EntityRegistryService` (auto CRUD endpoint), và seed danh mục Mục thu/Mục chi mặc định.

## Deliverables

- Entity classes: `CashReceiptEntity`, `CashReceiptLineEntity`, `CashPaymentEntity`, `CashPaymentLineEntity`, `CashCountEntity`, `CashVoucherCategoryEntity` (reflect schema TKT-CV-01).
- DTO scaffolding (class-validator + `@ApiProperty`): `create/update/reverse/query` cho receipts, payments; `create/update/query` cho cash-counts. Mọi field được declare (global `whitelist: true, forbidNonWhitelisted: true`).
- `cash-vouchers.module.ts` + import vào `accounting.module.ts`.
- `EntityRegistryService.registerEntity(CONFIG, TOKEN)` cho `cash-voucher-categories` trong `OnModuleInit` với `ScopingPolicy.ORGANIZATION`, `deletionPolicy.SOFT`.
- Seeder mặc định: `THU_BAN_HANG`, `THU_NO_KH`, `THU_KHAC` (direction=IN); `CHI_MUA_HANG`, `CHI_NO_NCC`, `CHI_LUONG`, `CHI_KHAC` (direction=OUT).

## Acceptance Criteria

- [x] App boot không lỗi DI; `CashVouchersModule` load trong `accounting.module.ts`.
- [x] `/admin/entities/cash-voucher-categories/records` trả CRUD endpoint tự động (list/create/update/delete) qua generic platform.
- [x] Seed idempotent (chạy lại không nhân đôi — upsert theo `(organization_id, code)`).
- [x] DTOs validate đúng (vd thiếu `voucher_date` → 400; field lạ → 400 do `forbidNonWhitelisted`).
- [x] Entity money fields `numeric(18,2)` decimal transform đúng (string ↔ number).

## Definition of Done

- [x] PR có entity + DTO + module + registry + seeder; pass build + lint.
- [x] Smoke test: GET `/admin/entities/cash-voucher-categories/records` trả 7 row seed mặc định.
- [x] Source tiếng Anh (errors/comments/swagger).

## Tech Approach

- Theo NestJS module convention trong CLAUDE.md.
- Service logic (post/reverse/ledger/count) KHÔNG ở ticket này — chỉ skeleton + categories. Service ở TKT-CV-03..06.
- `CrudEntityConfig` cho categories: `fields` (code, name, direction, isActive, displayOrder), `searchableFields` (code, name), `permissions` (`accounting.cash_voucher_category.*`).

## Dependencies

- Phụ thuộc: TKT-CV-01 (schema), TKT-024 (generic CRUD platform).
- Blocks: TKT-CV-03, TKT-CV-04, TKT-CV-07.
