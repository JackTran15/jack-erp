# TKT-DUE-07 FE prefill modal "Hạn thanh toán" từ org default

## Epic

[EPIC-16062026 POS công nợ — Hạn thanh toán](../epics/EPIC-16062026-pos-debt-due-date.md)

## Summary

Khi mở modal "Hạn thanh toán" mà chưa có giá trị, **prefill** `Số ngày được nợ` từ org `defaultCreditDays` (TKT-DUE-03), tự suy ra `Hạn thanh toán`. Thu ngân vẫn sửa được; giá trị nhập per-invoice luôn thắng prefill.

## Deliverables

- `apps/pos-web/src/hooks/react-query/` — hook TanStack Query đọc org pos-settings (`defaultCreditDays`) qua `erpApi`/`requireErpData`, queryKey `["org-pos-settings"]`.
- `apps/pos-web/.../PaymentDueDialog/PaymentDueDialog.tsx` hoặc `DebtCheckRow.tsx` — khi mở modal lần đầu (chưa có `paymentDueDate`/`creditDays` trong draft), khởi tạo `days` = `defaultCreditDays` và tính `date` tương ứng.

## Acceptance Criteria

- [ ] Org có `defaultCreditDays = 30` + chưa chọn gì → mở modal thấy `Số ngày được nợ = 30`, `Hạn thanh toán` = hôm nay + 30.
- [ ] Org chưa set (`null`) → modal trống như hiện tại.
- [ ] Thu ngân sửa thành 9 → giá trị 9 được giữ; mở lại modal vẫn là 9 (không bị prefill đè lên giá trị đã chọn của hóa đơn này).
- [ ] Đổi sang hóa đơn/khách khác (draft reset) → prefill lại từ org default.
- [ ] Hook đọc org settings cache hợp lý (không refetch mỗi lần mở modal).

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` (tsc) xanh.
- [ ] Verify thủ công: set org default ở backoffice/PATCH → POS prefill đúng; override per-invoice giữ nguyên.
- [ ] Server data ở TanStack Query (không nhét vào Zustand).
- [ ] FE strings tiếng Việt.

## Tech Approach

- Prefill chỉ chạy khi draft **chưa** có giá trị (`paymentDueDate == null && creditDays == null`) để không đè per-invoice override.
- Hook:

```ts
export function useOrgPosSettings() {
  return useQuery({
    queryKey: ["org-pos-settings"],
    queryFn: () => requireErpData(erpApi.organizations.getCurrentPosSettings()),
    staleTime: 5 * 60_000,
  });
}
```

> Tên method client lấy theo schema generated (TKT-DUE-05); chỉnh đúng tên thực tế khi nối.

## Testing Strategy

- Manual: set/clear org default → quan sát prefill; override per-invoice.

## Dependencies

- Depends on: TKT-DUE-03 (endpoint), TKT-DUE-05 (client).
- Blocks: TKT-DUE-08.
