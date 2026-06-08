# TKT-IIS-03 BE: openapi:generate + tests + DoD

## Epic

[EPIC-03062026 Inventory item server-side grouped search (v2)](../epics/EPIC-03062026-inventory-item-search-v2.md)

## Summary

Chốt phần backend: regenerate `@erp/api-client` từ endpoint mới (chuẩn bị cho FE làm sau), thêm test parity/scope/filter end-to-end, và gate Definition of Done của epic. **Không** đụng FE trong ticket này — chỉ commit snapshot + schema để FE consume về sau.

## Deliverables

- Chạy API (`make dev-api` / port 4000) rồi `pnpm openapi:generate`.
- `apps/api/openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` — cập nhật, **commit** (không sửa tay file generated). Xác nhận diff chỉ chứa `POST /v2/inventory-items/search` + schema `InventoryItemSearchV2Dto`/envelope grouped, không drift ngoài ý muốn.
- `apps/api/test/e2e/.../inventory-item-search-v2.e2e-spec.ts` (hoặc nối vào suite inventory hiện có) — round-trip thực qua `erp_test`.

## Acceptance Criteria

- [ ] `pnpm openapi:generate` đã chạy; snapshot + `schema.ts` commit; diff đúng phạm vi (chỉ endpoint mới).
- [ ] E2E: seed org (≥1 product nhiều variant + ≥1 orphan, trộn active/posVisible/brand/itemType) →
  - [ ] `POST /v2/inventory-items/search` không filter trả **đúng** `{ data, total, page, pageSize }` y hệt `GET /admin/entities/inventory-items/records` cùng org/page/pageSize (so từng field của `ProductGroupRow`, thứ tự `code ASC`, `total`).
  - [ ] `search` khớp `code`/`name`/`category.name`; `categoryId` lọc đúng; mỗi filter mới (`isActive`/`isPosVisible`/`brand`/`itemType`/`productId`) thu hẹp đúng + group rỗng biến mất.
  - [ ] Request của org A không trả dữ liệu org B (no cross-tenant leak).
  - [ ] Field lạ trong body → 400; `pageSize > 100` → 400.
- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api test:e2e` xanh (đọc output thật — teardown Kafka treo có thể giả "suite failed", xác nhận bằng test thực).

## Definition of Done (gate epic)

- [ ] Toàn bộ AC của TKT-IIS-01, TKT-IIS-02, TKT-IIS-03 đạt.
- [ ] `pnpm --filter @erp/api test` + `lint` + `test:e2e` xanh.
- [ ] Không schema change DB; `synchronize` false; không migration.
- [ ] `openapi.snapshot.json` + `schema.ts` đã commit; không sửa tay file generated.
- [ ] Backend source tiếng Anh; không tiếng Việt trong error/comment/Swagger/log.
- [ ] Không TODO/FIXME ngoài kế hoạch; endpoint cũ (`/admin/entities/inventory-items/records`, `/inventory/items/products`) không đổi hành vi.
- [ ] FE chưa đụng (đúng scope "backend only"); ghi chú endpoint mới sẵn sàng cho ticket FE sau.

## Tech Approach

- `openapi:generate` cần API đang chạy trên :4000 (đọc `/docs-json`). Sau khi generate, kiểm tra `git diff` của snapshot/schema chỉ thêm path `/v2/inventory-items/search` + component schema tương ứng.
- E2E theo chuẩn repo: chạy trên DB `erp_test` (`global-setup` tự tạo + migrate), serial (`maxWorkers: 1`, `forceExit: true`). Parity assert: gọi cả 2 endpoint trong cùng test, so sánh `data`/`total` sâu (deep-equal sau khi chuẩn hóa thứ tự).

## Testing Strategy

- E2E (`inventory-item-search-v2.e2e-spec.ts`): happy path + parity + từng filter + cross-tenant + validation (400). Tận dụng seed inventory hiện có nếu đủ phủ; nếu thiếu variant/orphan trộn trạng thái thì seed bổ sung trong test.

## Dependencies

- Depends on: [TKT-IIS-02](./TKT-IIS-02-be-cqrs-grouped-search-endpoint.md).
- Blocks: — (ticket cuối; FE là epic sau).
