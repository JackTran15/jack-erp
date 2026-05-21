# TKT-CV-12 OpenAPI regen + E2E (manual flow)

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only — gate cuối Phase 1.

## Summary

Regenerate API client từ OpenAPI + viết automated E2E test cho toàn bộ manual flow voucher (không auto-create). Đây là DoD gate của Phase 1.

## Deliverables

- `pnpm openapi:generate` → commit `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts`.
- E2E suite trong `apps/api/test/e2e/cash-vouchers-phase1.e2e-spec.ts`:
  - Phiếu thu: create DRAFT → post → balance tăng + ledger phản ánh row → reverse → balance khôi phục.
  - Phiếu chi: create → post → balance giảm (+ insufficient-balance 400 case) → reverse.
  - Sổ tiền mặt: opening/running/closing chính xác sau vài voucher; cursor pagination.
  - Kiểm kê: variance > 0 tạo Phiếu thu, variance < 0 tạo Phiếu chi, variance = 0 không tạo.
  - Multi-tenant: org A không thấy voucher org B.

## Acceptance Criteria

- [x] `openapi.snapshot.json` + generated schema commit kèm, không hand-edit file generated.
- [x] E2E chạy xanh trên cấu hình DB e2e (xem memory `project_e2e_test_db_setup` — env DB tường minh + pre-seed `erp_test`).
- [x] Mỗi acceptance criteria Phase 1 của EPIC có ít nhất 1 assertion E2E tương ứng.
- [x] Teardown sạch (không treo Kafka → "suite failed" giả — xem memory `project_e2e_test_db_setup`).

## Definition of Done

- [x] E2E suite pass trong CI; ledger/balance/JE assertions đầy đủ.
- [x] OpenAPI artifact committed.
- [x] Cập nhật `docs/architecture-cash-flow.md` (section voucher document layer) + `tickets/README.md` (đăng ký epic + graph).

## Tech Approach

- Dùng harness E2E hiện có (`apps/api/test/e2e/jest-e2e.config.ts`).
- Seed org + admin + cash_account + COA trước mỗi suite.
- API phải đang chạy `:4000` khi `openapi:generate`.

## Dependencies

- Phụ thuộc: TKT-CV-03, TKT-CV-04, TKT-CV-05, TKT-CV-06, TKT-CV-07.
- Blocks: Phase 2 start.
