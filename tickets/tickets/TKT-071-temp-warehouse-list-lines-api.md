# TKT-071 Temp warehouse — list lines API

## Epic

[EPIC-15052026 Temporary Warehouse Session](../epics/EPIC-15052026-temporary-warehouse-session.md)

## Summary

Endpoint `GET /inventory/temp-warehouse/lines`: trả về line trong session, hỗ trợ 2 mode:

- **Raw mode** (`hideOffsetting=false`, default): trả danh sách line như đang lưu (kèm filter `status`, `direction`).
- **Netted mode** (`hideOffsetting=true`): aggregate by `itemId` → 1 row/item với tổng W2S, tổng S2W, net quantity, net direction. Dùng để xem nhanh chênh lệch trước khi close session.

## Deliverables

- `TempWarehouseSessionService.listLines(query, actor)` (raw mode).
- `TempWarehouseSessionService.listNettedLines(query, actor)` (aggregated mode).
- `TempWarehouseController.listLines()` — `GET /inventory/temp-warehouse/lines`.
- DTO `apps/api/src/modules/inventory/temp-warehouse/dto/list-lines.query.ts`.
- Response interface `NettedLineView` trong service file hoặc shared-interfaces.

## Acceptance Criteria

- [ ] Query params:
  - `branchId` (required nếu không truyền `sessionId`)
  - `sessionId` (required nếu không truyền `branchId`)
  - `hideOffsetting` (boolean, default `false`)
  - `status` (filter raw mode, default `ACTIVE`; `'ALL'` để lấy hết)
  - `direction` (filter raw mode, optional)
  - `page`, `pageSize` (raw mode pagination only)
- [ ] Khi `branchId` truyền mà không có session `ACTIVE` → trả `{ data: [], total: 0, sessionId: null }` (không lỗi).
- [ ] Raw mode trả `PaginatedResponse<TempWarehouseLineEntity>` + `sessionId` field.
- [ ] Netted mode trả `{ sessionId, items: NettedLineView[] }` (không paginate):

  ```ts
  interface NettedLineView {
    itemId: string;
    totalW2s: number;          // tổng quantity của lines direction=W2S, status=ACTIVE
    totalS2w: number;          // tổng quantity của lines direction=S2W, status=ACTIVE
    netQuantity: number;       // abs(totalW2s - totalS2w)
    netDirection: TempWarehouseDirection | null;  // null nếu net = 0
    lineIdsW2s: string[];      // id của các line W2S đang ACTIVE (giúp UI drill-down)
    lineIdsS2w: string[];
  }
  ```

- [ ] Multi-tenant: chỉ trả về line thuộc `actor.organizationId`.
- [ ] Netted mode chỉ tính `status=ACTIVE` + `status=AUTO_BALANCED`; không tính `DELETED`.

## Definition of Done

- [ ] Unit test:
  - Raw mode trả đúng filter `status`/`direction`.
  - Netted mode: item A có W2S=10, S2W=8 → `netQuantity=2, netDirection=W2S`.
  - Netted mode: item B có W2S=5, S2W=5 → `netQuantity=0, netDirection=null`.
  - Netted mode: item C chỉ có W2S → vẫn trả `totalS2w=0`.
  - DELETED lines bị loại khỏi cả 2 mode (trừ khi raw mode có `status=ALL`).
- [ ] OpenAPI có cả 2 response schema.

## Tech Approach

### Netted aggregation SQL (TypeORM raw query)

```sql
SELECT
  item_id,
  SUM(CASE WHEN direction = 'warehouse_to_showroom' THEN quantity ELSE 0 END) AS total_w2s,
  SUM(CASE WHEN direction = 'showroom_to_warehouse' THEN quantity ELSE 0 END) AS total_s2w,
  ARRAY_AGG(id) FILTER (WHERE direction = 'warehouse_to_showroom') AS line_ids_w2s,
  ARRAY_AGG(id) FILTER (WHERE direction = 'showroom_to_warehouse') AS line_ids_s2w
FROM temp_warehouse_lines
WHERE session_id = $1
  AND organization_id = $2
  AND status IN ('ACTIVE', 'AUTO_BALANCED')
GROUP BY item_id
ORDER BY item_id;
```

Sau đó map sang `NettedLineView` và compute `netQuantity`, `netDirection`.

## Dependencies

- Phụ thuộc: TKT-068.
- Blocks: TKT-073.
