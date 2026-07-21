# TKT-DFB-04 `pnpm openapi:generate` + snapshot

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Chuyển tiền liên chi nhánh (GĐ4)](../epics/EPIC-15072026-deposit-fund-inter-branch.md)

## Summary

Các endpoint mới của GĐ4 (`POST /deposit-transfers`, `POST /deposit-transfers/:id/confirm`, `POST /deposit-transfers/:id/cancel`, `GET /deposit-transfers`, `GET /deposit-transfers/in-transit`, `GET /deposit/dashboard`) phải xuất hiện trong OpenAPI để FE (TKT-DFB-05) consume qua `@erp/api-client` sinh tự động. Ticket này chạy `pnpm openapi:generate` với API đang chạy, rồi commit `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts`.

## Deliverables

- `apps/api/openapi.snapshot.json` — cập nhật (thêm 6 path + DTO của DFB-02/DFB-03).
- `packages/api-client/src/generated/schema.ts` — **sinh lại**, không hand-edit.

## Acceptance Criteria

- [ ] API chạy `:4000`, `pnpm openapi:generate` chạy thành công (regen từ `/docs-json`).
- [ ] Snapshot chứa đủ 6 path GĐ4 với request/response DTO (`CreateDepositTransferDto`, `ConfirmDepositTransferDto`, `CancelDepositTransferDto`, `ListDepositTransfersQuery`, `InTransitReportDto`, `OrgBalanceDashboardDto`, …) và enum `DepositTransferStatus`.
- [ ] `schema.ts` sinh lại khớp snapshot; **không** sửa tay file generated.
- [ ] Diff snapshot **chỉ** gồm bề mặt API GĐ4 (không kéo theo endpoint không liên quan — nếu có drift lạ, điều tra trước khi commit).
- [ ] `pnpm --filter @erp/api-client build` xanh sau regen.

## Definition of Done

- [ ] `pnpm openapi:generate` đã chạy; `openapi.snapshot.json` + `schema.ts` được commit cùng nhau.
- [ ] `pnpm build` (workspace) xanh — FE type-check thấy client mới.
- [ ] Không hand-edit file generated.
- [ ] Không có tiếng Việt trong backend source / DTO (chỉ FE consume mới hiển thị tiếng Việt).

## Tech Approach

```bash
# 1) Chạy API (đã có DFB-02/DFB-03 merge)
make dev-api            # NestJS :4000

# 2) Regen client + snapshot
pnpm openapi:generate   # đọc /docs-json → apps/api/openapi.snapshot.json + packages/api-client generated

# 3) Verify + build
pnpm --filter @erp/api-client build
```

Kiểm tra `git diff --stat apps/api/openapi.snapshot.json packages/api-client/src/generated/schema.ts` chỉ chạm 2 file này; nếu snapshot có thay đổi ngoài 6 path GĐ4 → có endpoint khác chưa commit hoặc drift, dừng lại điều tra.

## Testing Strategy

- Không có unit test riêng. Verification = build `@erp/api-client` xanh + grep snapshot có `/deposit-transfers` và `/deposit/dashboard`.

## Dependencies

- Depends on: TKT-DFB-02, TKT-DFB-03 (endpoint phải tồn tại mới regen được).
- Blocks: TKT-DFB-05 (FE cần client mới).
