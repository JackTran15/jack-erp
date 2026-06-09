# TKT-IWT-03 Controller + Swagger DTO + inline quan hệ vào list/getById

## Epic

[EPIC-09062026 Chuyển kho giữa các kho trong cùng chi nhánh](../epics/EPIC-09062026-inter-warehouse-transfer.md)

## Layer

🟦 Backend only (controller + response shape).

## Summary

Cập nhật request contract HTTP và response. Mở rộng DTO inline trong `stock-transfer.controller.ts` để nhận field mới, giữ guard/permission cũ; và **inline** quan hệ (Kho xuất/Kho nhập, Vị trí xuất/nhập, Người vận chuyển) vào từng row của `getById`/`list` để FE render trực tiếp — KHÔNG trả map gốc `{[id]: X}` (xem [[feedback_inline_relations_over_root_map]]).

## Deliverables

- `apps/api/src/modules/inventory/transfer/stock-transfer.controller.ts`:
  - Mở rộng class `TransferLineDto`: thêm `@IsUUID() sourceStorageId`, `@IsUUID() destinationStorageId`, `@IsOptional() @IsNumber() @Min(0) unitPrice?`. Giữ `sourceLocationId?`/`destinationLocationId?` optional.
  - Mở rộng class `CreateTransferDto`: thêm `@IsOptional() @IsUUID() transporterUserId?`, `@IsOptional() @IsArray() @IsUUID('all', { each: true }) attachmentIds?`, `@IsOptional() @IsISO8601() transferredAt?`. (Global `whitelist:true` → phải khai báo đủ field.) `sourceBranchId`/`destinationBranchId` không còn bắt buộc từ client — service set theo `actor.branchId`; bỏ khỏi DTO hoặc để optional.
  - `@ApiProperty`/`@ApiPropertyOptional` cho mọi field mới (Swagger English).
  - Giữ `@RequirePermission('inventory.transfer.create')` + `@RequireBranchScope()` trên `create`/`update`; permission `read`/`post`/`cancel` giữ nguyên.
  - `getById`/`list`: đảm bảo response mỗi line có inline `sourceStorage {id,name}`, `destinationStorage {id,name}`, `sourceLocation {id,code,name}`, `destinationLocation {id,code,name}`, `unitPrice`, `lineValue`; header có inline `transporter {id, code, fullName}` (resolve từ `transporterUserId`). Dùng eager relations sẵn (storage/location đã `eager:true` ở entity) + resolve transporter trong service.

## Acceptance Criteria

- [ ] `POST /inventory/stock/transfers` nhận đủ field mới; field lạ bị reject (`forbidNonWhitelisted`).
- [ ] `GET /inventory/stock/transfers/:id` trả mỗi line kèm storage/location/unitPrice/lineValue inline; header kèm transporter inline + attachmentIds.
- [ ] `GET /inventory/stock/transfers` (list) trả đủ field mới để FE hiển thị cột.
- [ ] Không cross-tenant leak: mọi response lọc theo `actor.organizationId`.

## Definition of Done

- [ ] `pnpm --filter @erp/api build` + `lint` pass; Swagger `/docs` hiển thị schema mới.
- [ ] Source/Swagger tiếng Anh.
- [ ] Không sửa permission seed (tái dùng `inventory.transfer.*`).

## Tech Approach

- Resolve transporter theo lô: thu thập distinct `transporterUserId` → 1 query users → map inline vào header (tránh N+1).
- Storage/location đã `@ManyToOne(..., { eager: true })` nên list/getById tự nạp; chỉ cần chọn field cần trả.

## Dependencies

- Requires: TKT-IWT-02.
- Blocks: TKT-IWT-04.
