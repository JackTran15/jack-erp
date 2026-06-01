# TKT-SUP-03 Provider CRUD extension (code-gen, groupName, config)

## Epic

[EPIC-29052026 Supplier & Supplier Group management](../epics/EPIC-29052026-supplier-management.md)

## Layer

🟦 Backend only.

## Summary

Nâng cấp `InventoryProviderCrudService` để phục vụ form nhà cung cấp đầy đủ: tự sinh `code` (`NCC000001…`) qua `DocumentNumberingService`, resolve `groupName` cho list, validate `groupId` theo org, và viết lại `fields`/`filterDefinitions` của `INVENTORY_PROVIDER_ENTITY_CONFIG`. Generic path không qua DTO nên toàn bộ logic này phải nằm ở CRUD service, không phải `InventoryLocationService`.

## Deliverables

- `apps/api/src/modules/inventory/location/provider-crud.service.ts`:
  - Inject thêm `@InjectRepository(SupplierGroupEntity)` và `DocumentNumberingService`.
  - `beforeCreate`: normalize empty-string (`groupId`, `idCardIssueDate`, …) → undefined; nếu `!code` → `code = await docNumbering.generate(DocumentType.SUPPLIER, actor.branchId, actor)`; nếu có `groupId` → verify thuộc org.
  - `beforeUpdate`: verify `groupId` thuộc org (nếu set).
  - `configureListQuery` → `leftJoinAndSelect('entity.group','group')`; `getByIdRelations` → `['group']`; `transformListResults` → gắn `groupName = group?.name ?? ''`.
  - Giữ nguyên `validateBusinessRules` (chặn xoá khi còn item tham chiếu).
  - Viết lại `INVENTORY_PROVIDER_ENTITY_CONFIG.fields`:
    - **List-visible:** `code` (string, `readOnly:true` — auto-gen, ẩn khỏi form nhưng hiện ở list), `name` (required), `type` (enum `Object.values(ProviderType)`), `groupName` (readOnly), `phone`, `address`, `isActive` (bool), `isCustomer` (bool).
    - **Form-only (`hideInList:true`):** `groupId` (relation→`provider-groups`), `email`, `maxDebt` (number, `numberFormat:'money'`), `debtTermDays` (number), `bankName`, `bankAccountNumber`, `bankBranch`, `notes`, `taxCode`, `contactTitle`, `contactName`, `contactEmail`, `contactPhone`, `contactPosition`, `contactAddress`, `salutation`, `idCardNumber`, `idCardIssueDate` (date), `idCardIssuePlace`, `createdAt` (date).
    - `searchableFields:['code','name','email','phone','taxCode']`.
    - `filterDefinitions`: `type` select (Tổ chức/Cá nhân), `isActive` select, `isCustomer` select.
- `apps/api/src/modules/inventory/location/inventory-location.module.ts` — thêm `DocumentNumberingModule` vào `imports` (service đã được module đó export).
- (Tuỳ chọn) cập nhật `dto/create-provider.dto.ts`/`update-provider.dto.ts` thêm field mới — CHỈ cần nếu controller `inventory/providers` (path riêng, UI không dùng) phải nhận field mới; nếu không thì bỏ qua.

## Acceptance Criteria

- [ ] `POST /admin/entities/inventory-providers/records {type:'organization', name:'Test'}` (không gửi `code`) → 201, `code` auto = `NCC0000xx` (liên tục theo org).
- [ ] Gửi kèm `code` → giữ nguyên code đó (không override).
- [ ] List trả `groupName` resolved + cột `type`/`isCustomer`; filter theo `type`/`isActive`/`isCustomer` hoạt động.
- [ ] `groupId` không thuộc org → 400 ở create/update.
- [ ] Provider cũ vẫn list được (type backfill 'organization'); xoá provider còn item tham chiếu → 400 (giữ rule cũ).

## Definition of Done

- [ ] PR service + config + module import; `pnpm --filter @erp/api build` pass.
- [ ] Verify code-gen tạo đúng format `NCC` 6 chữ số; chạy 2 lần liên tiếp ra số tăng dần.
- [ ] Source tiếng Anh.

## Tech Approach

- `DocumentNumberingService.generate(DocumentType.SUPPLIER, branchId, actor)` đã có sẵn (prefix `NCC`, continuous, 6 digit, tự tạo rule mặc định) — KHÔNG tự viết max+1.
- Resolve `groupName` bằng hook `configureListQuery`/`transformListResults` (copy y hệt cách item-crud resolve `categoryName`).
- `maxDebt` numeric → trả string; FE tự `Number(...)`.

## Dependencies

- Requires: TKT-SUP-01 (cột mới + entity). Nên làm sau/cùng TKT-SUP-02 (cần repo `SupplierGroupEntity` để validate group).
- Blocks: TKT-SUP-05.
