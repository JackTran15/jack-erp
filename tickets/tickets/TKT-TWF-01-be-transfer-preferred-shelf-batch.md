# TKT-TWF-01 BE: transfer preferred-shelf-batch endpoint (source+dest)

## Epic

[EPIC-21062026 Chuyển kho — chọn kho + auto-fill](../epics/EPIC-21062026-transfer-warehouse-fill.md)

## Summary

Add a dedicated endpoint that resolves, per (item, sourceStorage, destStorage), the preferred shelf at **both** the source and destination storage in a single call — so the transfer form can fill both Vị trí columns at once. Reuses the existing `getPreferredShelf(itemId, storageId, actor)` resolution (which already falls back to the item's most-used accessible shelf). Does not reuse `/preferred-shelf/batch` (single storage).

## Deliverables

- `apps/api/src/modules/inventory/location/dto/batch-transfer-preferred-shelf.dto.ts` (new):
  - `TransferPreferredShelfPairDto { itemId, sourceStorageId, destStorageId }` (all `@IsUUID`).
  - `BatchTransferPreferredShelfRequestDto { pairs: TransferPreferredShelfPairDto[] }` (`@ArrayNotEmpty`, `@ArrayMaxSize(200)`, `@ValidateNested`).
  - `BatchTransferPreferredShelfRowDto { itemId, sourceStorageId, destStorageId, sourceShelf: PreferredShelfResponseDto | null, destShelf: PreferredShelfResponseDto | null }`.
  - `BatchTransferPreferredShelfResponseDto { data: BatchTransferPreferredShelfRowDto[] }`.
- `apps/api/src/modules/inventory/location/inventory-location-stock.service.ts` — `getPreferredShelfTransferBatch(pairs, actor)`: dedupe by `itemId:sourceStorageId:destStorageId`, resolve each via two `getPreferredShelf` calls (source + dest), re-expand to request order.
- `apps/api/src/modules/inventory/location/inventory-location-stock.controller.ts` — `POST preferred-shelf/transfer-batch`, `@RequirePermission('inventory.read')`, `@Actor()`, returns `BatchTransferPreferredShelfResponseDto`.
- `pnpm openapi:generate` → commit the generated `@erp/api-client` schema (the operation `InventoryLocationStockController_..._transferBatch`).

## Acceptance Criteria

- [ ] `POST /inventory/locations/preferred-shelf/transfer-batch` with `pairs:[{itemId, sourceStorageId, destStorageId}]` returns `data:[{itemId, sourceStorageId, destStorageId, sourceShelf, destShelf}]`.
- [ ] `sourceShelf` resolves against `sourceStorageId`, `destShelf` against `destStorageId`, each via `getPreferredShelf` (org/branch-scoped); either may be `null`.
- [ ] Duplicate pairs resolved once; response preserves request order/length.
- [ ] Org scoping intact (only `actor.organizationId`); branch honored where `getPreferredShelf` already does.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + lint pass; spec covers source+dest resolution + dedupe + null shelf.
- [ ] No new entity/migration; `synchronize` stays false.
- [ ] `openapi:generate` run; generated `schema.ts` committed (not hand-edited).
- [ ] No Vietnamese in backend source.

## Tech Approach

```ts
async getPreferredShelfTransferBatch(
  pairs: TransferPreferredShelfPairDto[],
  actor: ActorContext,
): Promise<BatchTransferPreferredShelfRowDto[]> {
  const keyOf = (p: TransferPreferredShelfPairDto) =>
    `${p.itemId}:${p.sourceStorageId}:${p.destStorageId}`;
  const unique = new Map(pairs.map((p) => [keyOf(p), p]));
  const resolved = await Promise.all(
    [...unique.values()].map(async (p) => ({
      key: keyOf(p),
      sourceShelf: await this.getPreferredShelf(p.itemId, p.sourceStorageId, actor),
      destShelf: await this.getPreferredShelf(p.itemId, p.destStorageId, actor),
    })),
  );
  const byKey = new Map(resolved.map((r) => [r.key, r]));
  return pairs.map((p) => ({
    itemId: p.itemId,
    sourceStorageId: p.sourceStorageId,
    destStorageId: p.destStorageId,
    sourceShelf: byKey.get(keyOf(p))!.sourceShelf,
    destShelf: byKey.get(keyOf(p))!.destShelf,
  }));
}
```

## Testing Strategy

- Unit (`inventory-location-stock.service.spec.ts` or a new spec): mock `getPreferredShelf` to return distinct shelves per storage; assert source/dest mapping, dedupe, null passthrough.

## Dependencies

- Depends on: existing `getPreferredShelf`.
- Blocks: TKT-TWF-02.
