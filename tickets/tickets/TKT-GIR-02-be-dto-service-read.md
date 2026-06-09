# TKT-GIR-02 BE: DTO + service persist + read-path join lines.location

## Epic

[EPIC-08062026 Phiếu xuất kho — round-trip đầy đủ trường](../epics/EPIC-08062026-goods-issue-form-roundtrip.md)

## Layer

🟦 Backend — DTO + service + read query. **KHÔNG migration** (cột do TKT-GIR-01 tạo).

## Summary

Hai phần:
1. **Persist** `deliverer`, `references`, `occurredAt` từ body tạo phiếu xuất kho vào entity.
2. **Read fix (lỗi gốc Kho/Vị trí trống)**: v2 search handler chỉ join `lines.item`, thiếu `lines.location` → mỗi dòng trả về không có `location`, FE không có `code`/`storageId` để hiện Kho + Vị trí. Thêm join `lines.location`. Bảo đảm read trả đủ `deliverer`/`references`/`occurredAt` + (đã có) `provider`/`targetBranch`.

## Deliverables

- `apps/api/src/modules/inventory/goods-issue/dto/create-goods-issue.dto.ts` (controller `CreateGoodsIssueDto`) — thêm field validated:
  ```ts
  @IsOptional() @IsString()        deliverer?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) references?: string[];
  @IsOptional() @IsDateString()    occurredAt?: string;
  ```
  (giữ nguyên `providerId`, `targetBranchId`, `purpose`, `lines[]`…)
- `apps/api/src/modules/inventory/goods-issue/goods-issue.service.ts`:
  - `CreateGoodsIssueDto` (service interface) + `createAndPost`: đọc & set `gi.deliverer = dto.deliverer ?? null`, `gi.references = dto.references ?? []`, `gi.occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : null`.
- `apps/api/src/modules/inventory/goods-issue/queries/search-goods-issues-v2.handler.ts` — thêm `.leftJoinAndSelect('lines.location', 'lineLocation')` (cạnh `lines.item`). Không cần join `location.storage` — FE map tên kho từ `location.storageId` qua danh sách storages đã có.
- (Kiểm tra) `getById`/`list` v1 đã eager `lines.location` → giữ; xác nhận `location.storageId` có trong payload.

## Acceptance Criteria

- [ ] POST tạo phiếu có `deliverer`/`references[]`/`occurredAt` → 3 trường được persist; bỏ trống → `deliverer`/`occurredAt` null, `references` `[]`.
- [ ] GET/`search` trả về `deliverer`, `references`, `occurredAt`, `provider`, `targetBranch`, và mỗi dòng có `location{ id, code, storageId }`.
- [ ] v2 `search` không còn trả dòng thiếu `location`.
- [ ] Mọi query lọc `actor.organizationId` (+ `branchId` theo scope); không rò chéo tenant.
- [ ] Idempotent: thừa hưởng `IdempotencyInterceptor` (không tự xử lại).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh; `goods-issue.service.spec.ts` thêm case: persist 3 trường + read trả đủ.
- [ ] Sau đổi DTO: chuẩn bị cho TKT-GIR-03 (`openapi:generate`).
- [ ] Không Vietnamese trong source backend; `whitelist:true` nên DTO khai báo đủ field.
- [ ] Không schema change ngoài cột TKT-GIR-01.

## Tech Approach

```ts
// createAndPost(dto, actor)
const gi = this.giRepo.create({
  // …existing: locationId, providerId, purpose, reasonId, targetBranchId, referenceType/Id, notes
  deliverer: dto.deliverer ?? null,
  references: dto.references ?? [],
  occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : null,
  lines: …,
});
```
```ts
// search-goods-issues-v2.handler.ts
.leftJoinAndSelect('gi.lines', 'lines')
.leftJoinAndSelect('lines.item', 'lineItem')
.leftJoinAndSelect('lines.location', 'lineLocation')   // ← thêm
```

## Testing Strategy

- Unit (`goods-issue.service.spec.ts`): create với đủ field → assert entity lưu `deliverer/references/occurredAt`; mock repo create.
- E2E để ở TKT-GIR-05 (round-trip thật + v2 search có `lines.location`).

## Dependencies

- Depends on: TKT-GIR-01.
- Blocks: TKT-GIR-03 (OpenAPI), TKT-GIR-04 (FE).
