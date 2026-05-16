# TKT-073 Temp warehouse — backoffice UI

## Epic

[EPIC-15052026 Temporary Warehouse Session](../epics/EPIC-15052026-temporary-warehouse-session.md)

## Summary

Trang backoffice `/admin/kho-tam` (Vietnamese UI) gồm 3 thành phần:

1. **Header session card** — hiển thị thông tin session ACTIVE của branch hiện tại (mở từ bao giờ, ai mở, số line). Nút "Đóng phiên kho tạm" mở modal close.
2. **Form thêm line** — chọn item (autocomplete), chọn chiều (radio W2S/S2W), nhập số lượng, chọn người vận chuyển (user picker), ghi chú. Submit → call `POST /lines`.
3. **Bảng line** — list line trong session, toggle "Hiển thị bù trừ" để chuyển raw/netted view. Action update / delete per line.

Modal đóng phiên có 3 lựa chọn (radio): "Bù trừ tự động" / "Tạo phiếu chuyển kho" / "Chỉ đóng phiên".

## Deliverables

- `apps/backoffice-web/src/pages/temp-warehouse/KhoTamPage.tsx`
- `apps/backoffice-web/src/pages/temp-warehouse/components/SessionHeader.tsx`
- `apps/backoffice-web/src/pages/temp-warehouse/components/AddLineForm.tsx`
- `apps/backoffice-web/src/pages/temp-warehouse/components/LineTable.tsx`
- `apps/backoffice-web/src/pages/temp-warehouse/components/NettedLineTable.tsx`
- `apps/backoffice-web/src/pages/temp-warehouse/components/CloseSessionModal.tsx`
- `apps/backoffice-web/src/pages/temp-warehouse/hooks/useTempWarehouse.ts` (TanStack Query hooks)
- Update `apps/backoffice-web/src/components/layout/navConfig.ts` — thêm `NavChild` "Kho tạm" dưới group "Kho".
- Update `apps/backoffice-web/src/App.tsx` — thêm `<Route path="/admin/kho-tam" element={<KhoTamPage />} />`.

## Acceptance Criteria

- [ ] Trang load: gọi `GET /inventory/temp-warehouse/sessions/active?branchId={activeBranch}`.
  - 200 → render session header + bảng line.
  - 404 → render banner "Chưa có phiên kho tạm. Thêm dòng để bắt đầu phiên mới."
- [ ] Submit form add line → `POST /lines` → invalidate query `["temp-warehouse-lines", branchId]` + `["temp-warehouse-session", branchId]` → reset form.
- [ ] Toggle "Hiển thị bù trừ" → switch giữa raw table và netted table không reload page.
- [ ] Netted table cột: Item | Tổng xuất (W2S) | Tổng nhập (S2W) | Chênh lệch | Hướng net.
- [ ] Raw table cột: Item | Chiều | Số lượng | Người vận chuyển | Ghi chú | Tạo lúc | Hành động (Sửa / Xoá).
- [ ] Sửa line: mở inline editor hoặc modal nhỏ với 3 field (qty/carrier/notes) → call `PATCH .../:id`.
- [ ] Xoá line: confirm dialog Vietnamese → call `DELETE .../:id`.
- [ ] Modal đóng phiên:
  - 3 radio mô tả rõ side-effect bằng tiếng Việt.
  - "Bù trừ tự động": "Hệ thống tự thêm dòng đối ứng để cân số. Không phát sinh phiếu chuyển kho."
  - "Tạo phiếu chuyển kho": "Hệ thống tạo tối đa 2 phiếu chuyển kho thực (kho chính ↔ showroom) và ghi vào tồn kho."
  - "Chỉ đóng phiên": "Đóng phiên kho tạm. Không thay đổi tồn kho."
  - Submit → `POST .../close` với mode tương ứng → invalidate queries → redirect/refresh.
- [ ] Format số/ngày theo `vi-VN` locale.
- [ ] All primitives từ `@erp/ui`; icons từ `lucide-react`.

## Definition of Done

- [ ] Smoke test thủ công trên dev server (`make dev-backoffice` + `make dev-api`):
  - Thêm 5 line W2S + 3 line S2W → toggle netted → đúng tổng.
  - Sửa 1 line → line cũ disappear khỏi raw view (chỉ `ACTIVE`), tổng update.
  - Close mode CREATE_TRANSFERS → API trả `transferIds`, UI hiển thị toast "Đã tạo 2 phiếu chuyển kho".
- [ ] Vào `/admin/inventory/stock-transfers` sau close CREATE_TRANSFERS → thấy 2 phiếu POSTED.
- [ ] No console errors / TanStack Query warnings.
- [ ] PR có screenshot 3 màn hình (empty state / có line / modal close).

## Tech Approach

### Routing & nav

```ts
// navConfig.ts (snippet)
{
  group: 'Kho',
  children: [
    ...,
    { path: '/admin/kho-tam', label: 'Kho tạm', icon: 'ArrowLeftRight' },
  ],
}
```

### Hooks file

```ts
// useTempWarehouse.ts
export function useActiveSession(branchId: string) {
  return useQuery({
    queryKey: ['temp-warehouse-session', branchId],
    queryFn: () => erpApi.GET('/inventory/temp-warehouse/sessions/active', { params: { query: { branchId } } }),
    retry: false,
  });
}

export function useTempWarehouseLines(branchId: string, hideOffsetting: boolean) {
  return useQuery({
    queryKey: ['temp-warehouse-lines', branchId, hideOffsetting],
    queryFn: () => erpApi.GET('/inventory/temp-warehouse/lines', {
      params: { query: { branchId, hideOffsetting } },
    }).then(requireErpData),
  });
}

export function useAddLine() { /* ...useMutation + invalidate... */ }
export function useUpdateLine() { /* ... */ }
export function useDeleteLine() { /* ... */ }
export function useCloseSession() { /* ... */ }
```

## Dependencies

- Phụ thuộc: TKT-070, TKT-071, TKT-072.
- Cần regenerate `@erp/api-client` sau khi backend xong: `pnpm openapi:generate`.
- Blocks: TKT-074.
