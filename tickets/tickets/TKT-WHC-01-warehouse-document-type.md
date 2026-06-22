# TKT-WHC-01 DocumentType.WAREHOUSE + numbering config

## Epic

[EPIC-21062026 Warehouse Code Auto-Generation](../epics/EPIC-21062026-warehouse-code-autogen.md)

## Summary

Thêm loại tài liệu `WAREHOUSE` để `DocumentNumberingService` có thể sinh mã kho. Đây là nền tảng cho mọi ticket còn lại (auto-gen, branch flow, backfill). Format: prefix `WH`, liên tục (continuous), 6 chữ số, không reset → `WH000001`. Không cần seed rule riêng: `ensureDefaultActiveRule` tự tạo rule org-level từ `DEFAULT_DOC_NUMBER_CONFIG` ở lần `generate` đầu tiên.

## Deliverables

- `packages/shared-interfaces/src/document-numbering/index.ts` — thêm `WAREHOUSE = 'WAREHOUSE', // WH` vào enum `DocumentType`.
- `apps/api/src/modules/document-numbering/document-numbering.service.ts` — thêm `[DocumentType.WAREHOUSE]: { prefix: 'WH', continuous: true }` vào `DEFAULT_DOC_NUMBER_CONFIG` (record này là exhaustive theo `DocumentType`, thiếu entry sẽ lỗi type-check).
- Rebuild shared: `pnpm --filter @erp/shared-interfaces build` (postinstall/`build:shared`).

## Acceptance Criteria

- [ ] `DocumentType.WAREHOUSE` tồn tại và build được ở cả `@erp/shared-interfaces` và `@erp/api`.
- [ ] `DEFAULT_DOC_NUMBER_CONFIG` có entry `WAREHOUSE` (prefix `WH`, continuous) — type `Record<DocumentType, …>` không báo thiếu key.
- [ ] Gọi `generate(DocumentType.WAREHOUSE, branchId, actor)` lần đầu (chưa có rule) tự tạo rule org-level và trả về `WH000001`.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` xanh (đặc biệt `document-numbering.service.spec.ts`).
- [ ] Không Vietnamese trong source backend.
- [ ] Shared package đã rebuild để các app tiêu thụ enum mới.

## Tech Approach

```ts
// packages/shared-interfaces/src/document-numbering/index.ts
export enum DocumentType {
  // ...
  DELIVERY_PARTNER = 'DELIVERY_PARTNER', // DTGH
  WAREHOUSE = 'WAREHOUSE', // WH
}
```

```ts
// document-numbering.service.ts — DEFAULT_DOC_NUMBER_CONFIG
[DocumentType.WAREHOUSE]: { prefix: 'WH', continuous: true },
```

## Testing Strategy

- Unit (`document-numbering.service.spec.ts`): thêm case generate `WAREHOUSE` lần đầu → `WH000001`, lần kế → `WH000002` (counter org-level, never reset).

## Dependencies

- Depends on: —
- Blocks: TKT-WHC-02, TKT-WHC-03, TKT-WHC-04, TKT-WHC-05
