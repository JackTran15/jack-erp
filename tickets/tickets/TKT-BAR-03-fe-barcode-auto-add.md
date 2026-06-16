# TKT-BAR-03 FE: barcode-priority search + auto-add wiring

## Epic

[EPIC-16062026 POS barcode-priority search + auto-add](../epics/EPIC-16062026-pos-barcode-auto-add.md)

## Summary

Wire ô tìm hàng (`ProductSearchInput`) để **ưu tiên tra mã vạch/SKU qua server** mỗi khi đổi input (debounced) và khi Enter. Khớp đúng 1 → `addProductByItem(line, 1)` (auto-add, quét lại +1), input tự xóa, dropdown đóng. Không khớp / nhiều khớp → giữ hành vi cũ: đổi input ra gợi ý tên/SKU client-side, Enter chạy `addProductByQuery`. Phải có guard chống thêm trùng giữa hai đường "đổi input" và "Enter" trên cùng một chuỗi.

## Deliverables

- `apps/pos-web/src/dtos/catalog.dto.ts` — thêm `LookupCatalogParams { branchId: string; code: string }` (nếu cần shape params; hoặc truyền tham số rời).
- `apps/pos-web/src/services/catalog.service.ts` — thêm `lookupByCode(branchId, code): Promise<PosCatalogLine[]>` → `GET /pos/branches/:id/catalog/lookup?code=...` (dùng `http`, `encodeURIComponent`).
- `apps/pos-web/src/constants/react-query-key.constant.ts` — thêm `CATALOG_KEYS.LOOKUP(branchId, code)`.
- `apps/pos-web/src/hooks/react-query/use-query-catalog.ts` — thêm `useLookupCatalogByCode()` (imperative `queryClient.fetchQuery`, mirror `useSearchPosBranchCatalog`).
- `apps/pos-web/src/hooks/page-hooks/checkout/use-checkout-barcode-auto-add.ts` (new) — `useCheckoutBarcodeAutoAdd()` trả `tryAutoAdd(code): Promise<boolean>` (lookup → nếu đúng 1 line thì `addProductByItem(line, 1)` + return `true`; else `false`) + dedupe guard.
- `apps/pos-web/src/components/page-components/Checkout/CheckoutLeftPane/POSToolbar/ProductSearchInput/ProductSearchInput.tsx` — bọc `search` adapter + đổi `onSubmitQuery` để gọi `tryAutoAdd` trước; reset dedupe khi input về rỗng.

## Acceptance Criteria

- [ ] Đổi input (sau debounce) khớp đúng 1 mã vạch/SKU → tự thêm dòng qty 1, input xóa, dropdown đóng (`search` trả `[]`).
- [ ] Enter khi chưa kịp debounce → cũng `tryAutoAdd`; khớp 1 → add; không khớp → `addProductByQuery()` (hành vi cũ).
- [ ] Một lần quét (đổi input rồi Enter cùng chuỗi `q`, hoặc debounce nổ sau khi Enter đã add) chỉ thêm **đúng 1 lần** — dedupe theo chuỗi query, reset khi input về `""`.
- [ ] Quét lại cùng mã (chuỗi đi qua `""` rồi nhập lại) → dòng hiện có **+1** (kế thừa merge của `addProduct`).
- [ ] Input gõ một phần (`lap`) không khớp tuyệt đối → **không** auto-add; dropdown gợi ý tên/SKU giữ nguyên.
- [ ] >1 match exact → không auto-add; rơi về dropdown / `addProductByQuery` như cũ.
- [ ] Item khớp nhưng tồn 0 (line `defaultLocationId === ''` / qty 0) → `addProductByItem` hiện `OUT_OF_STOCK` ("Hết tồn."), không thêm dòng (kế thừa guard hiện có, không sửa).
- [ ] Enter khi input rỗng → no-op (không gọi lookup, không bắn `addProductByQuery` với query rỗng → tránh lỗi giả "nhiều kết quả").
- [ ] Tuân thủ pos-web CLAUDE.md: service-only-in-react-query-hook, queryKey từ constant, named export, không `index.ts`, import `@/` alias.

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` (tsc) pass.
- [ ] Verify thủ công tại CheckoutPage: (1) quét mã vạch tồn tại → auto-add; (2) gõ SKU chính xác → auto-add; (3) gõ `lap` → dropdown, không add; (4) quét mã tồn 0 → "Hết tồn."; (5) quét đúp cùng item → +1 mỗi lần, không double từ race change/Enter.
- [ ] Không refactor ngoài phạm vi; không tạo `index.ts`; không gọi `http` trực tiếp trong component/page/hook-util.

## Tech Approach

Service:

```ts
// catalog.service.ts (thêm vào object catalogService)
lookupByCode: (branchId: string, code: string): Promise<PosCatalogLine[]> =>
  http.get<PosCatalogLine[]>(
    `/pos/branches/${encodeURIComponent(branchId)}/catalog/lookup?code=${encodeURIComponent(code)}`,
  ),
```

Query key + imperative lookup (mirror `useSearchPosBranchCatalog`):

```ts
// react-query-key.constant.ts → CATALOG_KEYS
LOOKUP: (branchId: string, code: string) =>
  ["catalog", "lookup", branchId, code] as const,

// use-query-catalog.ts
export function useLookupCatalogByCode() {
  const queryClient = useQueryClient();
  return useCallback(
    (branchId: string, code: string) =>
      queryClient.fetchQuery({
        queryKey: CATALOG_KEYS.LOOKUP(branchId, code),
        queryFn: () => catalogService.lookupByCode(branchId, code),
        staleTime: 30_000,
      }),
    [queryClient],
  );
}
```

Page-hook với dedupe guard:

```ts
// use-checkout-barcode-auto-add.ts
export function useCheckoutBarcodeAutoAdd() {
  const branchId = usePosBranchStore((s) => s.branchId) ?? "";
  const lookup = useLookupCatalogByCode();
  const { addProductByItem } = useCheckoutCartActions();
  const handledRef = useRef<string | null>(null);

  // Gọi khi input về rỗng → mở lại phiên quét mới (cho phép quét lại cùng mã).
  const resetGuard = useCallback(() => { handledRef.current = null; }, []);

  const tryAutoAdd = useCallback(
    async (raw: string): Promise<boolean> => {
      const code = raw.trim();
      if (!code || !branchId) return false;
      if (handledRef.current === code) return false; // dedupe change↔Enter trên cùng chuỗi
      handledRef.current = code;
      const lines = await lookup(branchId, code);
      if (lines.length === 1) {
        addProductByItem(lines[0]!, 1); // addProductByItem tự xóa input → kích hoạt resetGuard
        return true;
      }
      return false;
    },
    [branchId, lookup, addProductByItem],
  );

  return { tryAutoAdd, resetGuard };
}
```

Wiring trong `ProductSearchInput` (giữ dropdown cũ làm fallback):

```tsx
const { toolbar, setToolbar, productSearchAdapter } = useCheckoutCatalog();
const { addProductByItem, addProductByQuery } = useCheckoutCartActions();
const { tryAutoAdd, resetGuard } = useCheckoutBarcodeAutoAdd();

// reset dedupe khi input rỗng (mở phiên quét mới)
const handleValueChange = (q: string) => {
  if (!q.trim()) resetGuard();
  setToolbar((s) => ({ ...s, query: q }));
};

// "đổi input": ưu tiên barcode/SKU, khớp 1 → đã add (search trả []); else dropdown cũ
const search = async (q: string) => {
  const added = await tryAutoAdd(q);
  if (added) return [];
  return productSearchAdapter(q);
};

// Enter: tra trước; khớp 1 → add; else giữ addProductByQuery cũ
const onSubmitQuery = (q: string) => {
  if (!q.trim()) return true;
  void tryAutoAdd(q).then((added) => { if (!added) addProductByQuery(); });
  return true;
};
```

> `onSelect` (click 1 gợi ý trong dropdown) giữ nguyên `addProductByItem(item)`. Nút icon `Quét mã vạch` vẫn chỉ là UI (ngoài scope).

## Testing Strategy

- Không có test framework chạy thật cho pos-web (theo CLAUDE.md `test` chỉ echo). Verify = `build` (tsc) + flow thủ công ở DoD. Nếu thêm spec vitest ad-hoc cho `use-checkout-barcode-auto-add` (dedupe + branch theo length) thì giữ cục bộ, không bắt buộc.

## Dependencies

- Depends on: TKT-BAR-01 (endpoint chạy).
- Blocks: (none).
