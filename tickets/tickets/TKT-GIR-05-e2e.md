# TKT-GIR-05 E2E + test plan + DoD gate

## Epic

[EPIC-08062026 Phiếu xuất kho — round-trip đầy đủ trường](../epics/EPIC-08062026-goods-issue-form-roundtrip.md)

## Layer

🟪 Test — service/e2e + manual verify; cổng DoD cho epic.

## Summary

Chứng minh round-trip đầy đủ: tạo phiếu xuất kho với mọi trường → đọc lại trả về đúng từng trường, gồm `lines[].location` (Kho/Vị trí), `deliverer`, `references[]`, `occurredAt`, `provider`, `targetBranch`.

## Deliverables

- `apps/api/.../goods-issue.service.spec.ts` (unit): create-persists `deliverer`/`references`/`occurredAt`; v2 search query có join `lines.location`.
- E2E (`apps/api/test/e2e`, chạy `pnpm --filter @erp/api test:e2e`): POST tạo phiếu `TRANSFER_OUT` với `providerId`, `deliverer`, `references:['R1','R2']`, `occurredAt`, 2 dòng kho/vị trí khác nhau → GET/`search` trả đủ; assert mỗi dòng `location.code`/`storageId`; assert `provider`/`targetBranch` inline.
- Manual: tái hiện kịch bản `XK000002` — tạo rồi mở lại, screenshot trước/sau xác nhận 6 trường (Kho, Vị trí, Người giao, Đối tượng, Cửa hàng đích, Tham chiếu) hiển thị đúng.

## Acceptance Criteria

- [ ] E2E: round-trip đủ trường; dòng nhiều kho/vị trí phân biệt đúng.
- [ ] Đối tượng (provider) round-trip xác nhận đúng (loại trừ nghi vấn "không lưu" — thực chất là read/display).
- [ ] Phiếu cũ (pre-migration) vẫn đọc được (`occurredAt` null, `references` `[]`).
- [ ] Idempotency replay (`X-Idempotency-Key` lặp) trả phiếu cũ, không tạo trùng.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `test:e2e` xanh (e2e chạy serial, đọc output thật — teardown Kafka treo không tính là fail).
- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Snapshot OpenAPI committed (TKT-GIR-03).
- [ ] Không TODO/FIXME ngoài kế hoạch; không Vietnamese trong source backend.

## Testing Strategy

- Unit trước (nhanh), E2E sau (cross-layer, DB thật `erp_test`).
- Manual screenshot là bằng chứng FE round-trip.

## Dependencies

- Depends on: TKT-GIR-02 (BE), TKT-GIR-04 (FE).
