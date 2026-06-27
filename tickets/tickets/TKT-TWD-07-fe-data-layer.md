# TKT-TWD-07 FE data layer (service + hooks + query keys)

## Epic

[EPIC-25062026 Kho tạm theo hướng phiên](../epics/EPIC-25062026-temp-warehouse-session-direction.md)

## Summary

Cập nhật tầng data pos-web cho mô hình 2 phiên: `getActiveSession` nhận `direction`; `addLine` gửi `direction` + location tùy chọn; thay `closeSession(sessionId, mode)` bằng `closeBranchSessions(branchId, mode)` gọi `POST sessions/close`. Tuân thủ pos-web CLAUDE.md: API chỉ ở `services/`, hook React Query ở `hooks/react-query/`, queryKey ở `react-query-key.constant.ts`.

## Deliverables

- `apps/pos-web/src/services/temp-warehouse.service.ts` — `getActiveSession(branchId, direction)`; `addLine` body gồm `direction`/`warehouseLocationId?`/`showroomLocationId?`; `closeBranchSessions(branchId, mode)`; gỡ `closeSession(sessionId, mode)`.
- `apps/pos-web/src/hooks/react-query/use-query-temp-warehouse.ts` — `useTempWarehouseActiveSession(branchId, direction)`; close mutation theo `branchId`.
- `apps/pos-web/src/constants/react-query-key.constant.ts` — `TEMP_WAREHOUSE_KEYS.ACTIVE(branchId, direction)`.
- `apps/pos-web/src/dtos/temp-warehouse.dto.ts` — cập nhật params nếu cần (addLine/close).

## Acceptance Criteria

- [ ] `getActiveSession(branchId, direction)` gọi `GET sessions/active?branchId=&direction=`; map 404 `TEMP_WAREHOUSE_NO_ACTIVE_SESSION` → `null` (giữ hành vi cũ).
- [ ] `useTempWarehouseActiveSession(branchId, direction)` key gồm cả `direction`; gọi 2 lần (w2s/s2w) cho 2 phiên.
- [ ] `addLine` truyền `direction` (bắt buộc) + location khi user đã chọn kho cho hướng đó.
- [ ] Close mutation gọi `closeBranchSessions(branchId, mode)`; `closeSession(sessionId,…)` bị gỡ, không còn nơi gọi.
- [ ] queryKey lấy từ `react-query-key.constant.ts` (không hard-code); API chỉ trong `services/`.

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` (tsc) xanh.
- [ ] Tuân thủ checklist pos-web CLAUDE.md (named export, không `index.ts`, `@erp/pos/...` alias).
- [ ] Không gọi `http` trực tiếp ngoài `services/`.

## Tech Approach

```ts
// services/temp-warehouse.service.ts
getActiveSession: async (branchId: string, direction: TempWarehouseDirection): Promise<TempWarehouseSession | null> => {
  try {
    return await call(() => http.get<TempWarehouseSession>(
      `${BASE}/sessions/active?branchId=${encodeURIComponent(branchId)}&direction=${direction}`));
  } catch (err) {
    if (err instanceof TempWarehouseApiError && err.statusCode === 404 && err.code === 'TEMP_WAREHOUSE_NO_ACTIVE_SESSION') return null;
    throw err;
  }
},
closeBranchSessions: (branchId: string, mode: TempWarehouseCloseMode): Promise<CloseBranchSessionsResult> => {
  const body: CloseTempWarehouseSessionBody = { branchId, mode };
  return call(() => http.post<CloseBranchSessionsResult>(`${BASE}/sessions/close`, body));
},
```

```ts
// react-query-key.constant.ts
ACTIVE: (branchId: string, direction: string) => ['temp-wh', 'active', branchId, direction] as const,
```

```ts
// use-query-temp-warehouse.ts
export function useTempWarehouseActiveSession(branchId: string | null, direction: TempWarehouseDirection) {
  return useQuery({
    queryKey: TEMP_WAREHOUSE_KEYS.ACTIVE(branchId ?? '', direction),
    queryFn: () => tempWarehouseService.getActiveSession(branchId as string, direction),
    enabled: Boolean(branchId), staleTime: 10_000,
  });
}
```

## Testing Strategy

- `tsc` build; verify hành vi ở TWD-08 (UI) + smoke trên app thật.

## Dependencies

- Depends on: TKT-TWD-06
- Blocks: TKT-TWD-08
