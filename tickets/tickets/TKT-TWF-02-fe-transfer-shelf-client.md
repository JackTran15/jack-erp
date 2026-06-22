# TKT-TWF-02 FE: getTransferPreferredShelfBatch client

## Epic

[EPIC-21062026 Chuyển kho — chọn kho + auto-fill](../epics/EPIC-21062026-transfer-warehouse-fill.md)

## Summary

Add the FE data-layer function for the new transfer endpoint, mirroring the existing `getPreferredShelfBatch` (typed `erpApi.POST` + `requireErpData`).

## Deliverables

- `apps/backoffice-web/src/api/inventory-location-preferences.ts`:
  - `TransferPreferredShelfPair { itemId, sourceStorageId, destStorageId }`.
  - `TransferPreferredShelfBatchRow { itemId, sourceStorageId, destStorageId, sourceShelf: PreferredShelf | null, destShelf: PreferredShelf | null }`.
  - `getTransferPreferredShelfBatch(pairs): Promise<TransferPreferredShelfBatchRow[]>` calling `erpApi.POST("/inventory/locations/preferred-shelf/transfer-batch", { body: { pairs } })`.

## Acceptance Criteria

- [ ] Returns the typed rows; reuses the existing `PreferredShelf` shape.
- [ ] Errors surface via `requireErpData` (HttpError) like the sibling function.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` passes (requires TWF-01's regenerated client types).

## Tech Approach

```ts
export async function getTransferPreferredShelfBatch(
  pairs: TransferPreferredShelfPair[],
): Promise<TransferPreferredShelfBatchRow[]> {
  const { data } = requireErpData<{ data: TransferPreferredShelfBatchRow[] }>(
    await erpApi.POST("/inventory/locations/preferred-shelf/transfer-batch", {
      body: { pairs },
    }),
  );
  return data;
}
```

## Dependencies

- Depends on: TKT-TWF-01 (endpoint + regenerated `@erp/api-client`).
- Blocks: TKT-TWF-03.
