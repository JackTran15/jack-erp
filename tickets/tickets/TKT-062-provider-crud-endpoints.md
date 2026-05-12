# TKT-062 Provider CRUD endpoints

## Epic

[EPIC-010 Item Management Enhancement](../epics/EPIC-010-item-management-enhancement.md)

## Summary

Hiện tại `InventoryLocationController` chỉ có `GET /inventory/providers` và `GET /inventory/providers/:id`. UI form item có nút "+" cạnh picker NCC để tạo NCC inline → cần `POST /inventory/providers` và các endpoint mutation.

> **Kiểm tra trước khi làm**: Có thể `ProviderEntity` đã đăng ký qua generic CRUD platform (entityKey `inventory-providers`). Nếu có và đủ — đóng ticket. Nếu thiếu — implement bên dưới.

## Deliverables

- Bổ sung endpoint vào `InventoryLocationController` (hoặc tách controller riêng):
  - `POST   /inventory/providers`
  - `PATCH  /inventory/providers/:id`
  - `DELETE /inventory/providers/:id` (soft-delete qua `is_active = false` thay vì hard delete, vì có FK reference từ `item_providers` và `purchase_orders`).
- `CreateProviderDto` / `UpdateProviderDto`.
- `InventoryLocationService.createProvider/updateProvider/deactivateProvider`.

## Acceptance Criteria

- [ ] `POST` reject `code` trùng trong cùng org (`409 Conflict`).
- [ ] `POST` set default `isActive = true`.
- [ ] `DELETE` thực chất set `isActive = false` (soft). Provider có item link hoặc PO ref vẫn giữ lại.
- [ ] `PATCH` không cho đổi `code` nếu provider đang có PO chưa POSTED (cảnh báo, không chặn nếu admin xác nhận).
- [ ] `GET /inventory/providers?activeOnly=true` (option mới) trả về chỉ provider `is_active = true`.

## Definition of Done

- [ ] PR pass test + lint.
- [ ] Unit test reject duplicate code, soft-delete behavior.
- [ ] OpenAPI snapshot regenerate.

## Tech Approach

### DTO

```ts
class CreateProviderDto {
  @IsString() @MinLength(1) @MaxLength(50) code: string;
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpdateProviderDto extends PartialType(CreateProviderDto) {}
```

### Service

```ts
async createProvider(dto, actor) {
  const exists = await this.providerRepo.findOne({
    where: { organizationId: actor.organizationId, code: dto.code }
  });
  if (exists) throw new ConflictException(`Provider code "${dto.code}" already exists`);
  return this.providerRepo.save({
    ...dto, organizationId: actor.organizationId, createdBy: actor.userId
  });
}

async deactivateProvider(id, actor) {
  const p = await this.getProviderById(id, actor);
  p.isActive = false;
  return this.providerRepo.save(p);
}
```

### Permission

- `@RequirePermission('inventory.write')` cho mutation; read giữ nguyên `inventory.read`.

## Testing Strategy

- Unit: duplicate code → 409; soft-delete preserves row.
- Integration: create → patch → deactivate → list with activeOnly.

## Dependencies

- Phụ thuộc: không (xác nhận generic CRUD chưa cover).
- Blocks: TKT-061 (UX inline-create), TKT-065 (UI).
