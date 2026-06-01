# TKT-SUP-06 OpenAPI regen + end-to-end verification

## Epic

[EPIC-29052026 Supplier & Supplier Group management](../epics/EPIC-29052026-supplier-management.md)

## Layer

🟦🟩 Fullstack (verification).

## Summary

Chốt epic: regen API client (nếu có thay đổi surface typed), chạy migration trên DB sạch, và verify end-to-end cả 2 màn theo mockup. Đảm bảo dữ liệu cũ + `supplier_debts` không bị ảnh hưởng.

## Deliverables

- Chạy API (:4000) → `pnpm openapi:generate`; commit `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` nếu có diff (không sửa tay file generated).
- (Tuỳ chọn) e2e nhẹ cho 2 entity nếu pattern e2e hiện có dễ mở rộng (`apps/api/test/e2e`): tạo nhóm + provider auto-code, assert list resolved name.

## Acceptance Criteria

- [ ] `pnpm migration:run` trên DB sạch tạo đủ schema; provider/`supplier_debts` cũ vẫn truy vấn được.
- [ ] `GET /admin/entities/provider-groups` và `/admin/entities/inventory-providers` trả config mới.
- [ ] Luồng UI: tạo nhóm cha→con; tạo NCC tổ chức + cá nhân (auto-code); sửa; list hiển thị đúng cột type/nhóm/là khách hàng.
- [ ] `pnpm build` (workspace) + `pnpm --filter @erp/api test` xanh.
- [ ] API client diff (nếu có) đã commit; không drift `migration:generate`.

## Definition of Done

- [ ] PR cuối epic (hoặc gộp verify vào các PR trước) với screenshot 2 màn đối chiếu mockup.
- [ ] Ghi chú "is customer chỉ là cờ, chưa auto tạo bản ghi khách hàng" trong PR.

## Tech Approach

- E2E chạy serial trên `erp_test`; nếu teardown Kafka treo gây "suite failed" giả thì đọc output thật.

## Dependencies

- Requires: TKT-SUP-01..05.
