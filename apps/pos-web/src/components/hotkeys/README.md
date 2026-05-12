# Hệ thống phím tắt POS (`apps/pos-web/src/components/hotkeys`)

Toàn bộ phím tắt của ứng dụng POS được khai báo và quản lý ở thư mục này. POS web được phát triển theo phong cách **MISA** — cashier thao tác chủ yếu bằng bàn phím, hạn chế tối đa chuột. Vì vậy phím tắt là tính năng load-bearing, không phải "nice to have".

> **TL;DR cho người mới:**
> 1. Mở `keys.ts` xem phím nào đã dùng.
> 2. Muốn thêm phím → thêm 1 entry vào `POS_HOTKEYS`, rồi gọi `usePosHotkey(POS_HOTKEYS.<ns>.<action>, callback)` trong component/hook.
> 3. Đừng dùng trực tiếp `useHotkey` của `@tanstack/react-hotkeys` — luôn đi qua `usePosHotkey` để có description tiếng Việt + tránh scatter phím trần khắp codebase.

---

## Vì sao có lớp này

`@tanstack/react-hotkeys` đã cung cấp `useHotkey` rất tốt — singleton manager, type-safe key string (`Hotkey`), `enabled` flag, `target` scoping, devtools. Lớp `usePosHotkey` chỉ thêm 3 thứ:

1. **Single source of truth (`keys.ts`)** — mọi phím tắt POS đều liệt kê trong `POS_HOTKEYS`. Khi review PR, người review nhìn 1 file biết đủ phím đang dùng, không phải grep cả monorepo.
2. **Description tiếng Việt gắn vào registration metadata** — `usePosHotkey` tự forward `def.description` vào `meta.description` của TanStack. Devtools và help-overlay tương lai đều dùng metadata này.
3. **Default `ignoreInputs: false`** — POS cần phím tắt fire **kể cả khi cashier đang gõ trong input** (vd: đang gõ tiền khách → bấm F9 hoàn tất). TanStack mặc định `ignoreInputs: true` cho F-keys; ta override mặc định này ở `HotkeysProvider` (xem `apps/pos-web/src/App.tsx`) và lặp lại trong `usePosHotkey` để defensive.

---

## Cấu trúc thư mục

```
apps/pos-web/src/components/hotkeys/
├── keys.ts            # Registry POS_HOTKEYS — single source of truth
├── usePosHotkey.ts    # Wrapper mỏng quanh useHotkey + metadata
├── index.ts           # Barrel export
└── README.md          # File bạn đang đọc
```

`@erp/pos/components/hotkeys` (import alias) trỏ thẳng vào barrel `index.ts`.

---

## Phím tắt hiện có

### Trang Checkout (`CheckoutPageV2`)

| Phím | Chức năng | Điều kiện kích hoạt |
|------|-----------|---------------------|
| **F3**  | Focus ô tìm hàng hóa (POSToolbar) | Mọi lúc |
| **F4**  | Focus ô tìm khách hàng (PaymentSummaryPanel) | Mọi lúc |
| **F9**  | Hoàn tất hóa đơn & in | Cart có ≥1 dòng hàng |
| **F10** | Lưu hóa đơn tạm | Không ở chế độ Đổi/Trả (`isReturnExchangeInvoice === false`) |
| **F12** | Focus ô "Số tiền" của dòng thanh toán đầu tiên | Mọi lúc |

> **Lưu ý:** F3 / F12 mặc định trên trình duyệt là "Tìm trong trang" / "Mở DevTools". `HotkeysProvider` được cấu hình `preventDefault: true` ở mức global nên các phím này sẽ bị chặn behavior native. Trong dev, dùng menu trình duyệt hoặc `Cmd+Opt+I` (Mac) / `Ctrl+Shift+I` (Win/Linux) để mở DevTools.

---

## Flow MISA chuẩn (Phase 1)

Triển khai hiện tại hỗ trợ flow keyboard-only sau, **không cần chạm chuột**:

```
B1: F3 → gõ tên SP → ↓ chọn SP → Enter        (thêm SP vào cart)
B2: gõ số lượng → Enter                       (focus tự nhảy về ô tìm SP)
B3: lặp B1+B2 cho từng SP
B4: F12                                       (focus ô "Số tiền" dòng đầu)
B5: gõ tiền khách đưa → Enter                 (Enter rời input → tiền thừa hiển thị)
B6: F9                                        (hoàn tất + in hóa đơn)
```

Logic phụ trợ (không phải hotkey, nhưng cần thiết để flow chạy):
- Sau khi `Enter` chọn SP, focus tự động chuyển sang ô SL của dòng vừa thêm (do `CheckoutPageV2` set `pendingQtyFocusLineId`, `InvoiceLineItemRow` consume).
- Enter trên ô SL gọi `onCommitQty` → focus quay về `productSearchRef`.

---

## Thêm phím tắt mới — quy trình 4 bước

**Bước 1.** Thêm entry vào `keys.ts`. Nếu là feature mới, tạo namespace mới:

```ts
export const POS_HOTKEYS = {
  checkout: { /* ... */ },
  returnGoods: {
    confirmReturn: { key: "F8", description: "Xác nhận trả hàng" },
  },
} as const;
```

**Bước 2.** Trong hook hoặc component, gọi `usePosHotkey`:

```tsx
import { POS_HOTKEYS, usePosHotkey } from "@erp/pos/components/hotkeys";

export function ReturnGoodsPage() {
  const handleConfirm = () => { /* ... */ };

  usePosHotkey(POS_HOTKEYS.returnGoods.confirmReturn, handleConfirm);

  return <div>...</div>;
}
```

**Bước 3.** (Optional) Truyền options để scope:

```tsx
// Chỉ active khi có item được chọn
usePosHotkey(POS_HOTKEYS.returnGoods.confirmReturn, handleConfirm, {
  enabled: hasSelectedItems,
});

// Scope vào 1 element cụ thể (vd: dialog content)
const dialogContentRef = useRef<HTMLDivElement>(null);
usePosHotkey(POS_HOTKEYS.foo.action, doSomething, {
  target: dialogContentRef,
});
```

**Bước 4.** Cập nhật bảng "Phím tắt hiện có" trong README này.

---

## Scoping

`@tanstack/react-hotkeys` mặc định bind listener vào `document`. Có 3 cách giới hạn phạm vi:

### 1. `enabled` flag — tắt mềm

```tsx
usePosHotkey(POS_HOTKEYS.checkout.completeCheckout, onCheckout, {
  enabled: hasCartItems,
});
```

Khi `enabled: false`, registration vẫn tồn tại (xuất hiện trong devtools) nhưng callback không fire. Toggle `enabled` không gây re-register — TanStack dùng `setOptions` cập nhật tại chỗ.

**Dùng khi:** phím luôn "tồn tại về logic" nhưng tạm thời không khả dụng (vd: F9 khi cart rỗng).

### 2. `target` ref — scope vào element

```tsx
const dialogRef = useRef<HTMLDivElement>(null);

usePosHotkey(POS_HOTKEYS.dialog.confirm, handleConfirm, {
  target: dialogRef,
});

return <div ref={dialogRef}>{/* ... */}</div>;
```

Phím chỉ fire khi event xảy ra trong cây con của element này.

**Dùng khi:** dialog/popover cần phím riêng không conflict với trang nền.

### 3. Conditional render

Nếu component có `usePosHotkey` chỉ được mount khi điều kiện thỏa mãn, registration tự động bị gỡ khi unmount. Đây thực ra là cách tự nhiên nhất khi feature đi kèm route hoặc dialog open/close.

---

## Chống xung đột

`@tanstack/react-hotkeys` dùng singleton `HotkeyManager`. Khi 2 chỗ register **cùng key trên cùng target**:

- Mặc định cả hai callback đều fire (theo thứ tự đăng ký).
- `conflictBehavior` option có thể đổi sang `"throw" | "warn" | "replace"` để quản lý.

**Quy tắc trong codebase này:**

1. **Trước khi thêm phím mới, mở `keys.ts` xem đã có ai dùng phím đó chưa.** Nếu có:
   - Cùng feature → có thể là code cũ chưa cleanup → refactor lại.
   - Khác feature → suy nghĩ kỹ về scope. Có thể dùng `target` để giới hạn vào element/dialog tương ứng. Nếu vẫn xung đột về logic, đổi phím.

2. **Một phím — một chức năng cùng phạm vi.** Không có ngoại lệ trong phase hiện tại.

3. **Khi feature có nhiều dialog/popover overlap**, scope hotkey vào ref của container thay vì bind global.

4. **Phím native trình duyệt** (F3, F5, F12, Mod+S, Mod+W…): luôn `preventDefault: true` (đã là default trong `HotkeysProvider`). Cẩn thận khi override.

---

## Khi nào không nên dùng `usePosHotkey`

Hệ thống này cho **global / page-level shortcuts** — phím tắt người dùng học thuộc lòng (F-keys, Mod+letter, etc.). Một số trường hợp **không nên** đi qua `usePosHotkey`:

- **Enter trong form / input** để submit: dùng natural form submission hoặc `onKeyDown` cục bộ. Ví dụ: `InvoiceLineItemRow` xử lý Enter trên ô SL bằng `onKeyDown` riêng — không phải global hotkey.
- **Esc trong dialog**: dialog primitives (`AppDialog`, Radix Dialog) đã tự bắt Esc qua `onOpenChange`. Đừng đăng ký lại.
- **Mũi tên ↑/↓ trong dropdown/list**: dùng `onKeyDown` cục bộ trên container (vd: `SearchPopover` đã làm thế).

Quy tắc rút gọn: **nếu phím chỉ có ý nghĩa khi user đang focus 1 element cụ thể, dùng `onKeyDown` cục bộ. Nếu phím là "global, hoạt động ở bất kỳ đâu trong trang", dùng `usePosHotkey`.**

---

## Bẫy thường gặp

### `ignoreInputs` — phím tắt không fire khi input đang focus

Mặc định của TanStack: F-keys không fire khi input đang focus. POS cần ngược lại (cashier đang gõ tiền → F9 vẫn fire). Ta override `ignoreInputs: false` ở 2 chỗ:
- `HotkeysProvider` trong `App.tsx` (default cho mọi `usePosHotkey`).
- `usePosHotkey` (defensive, trường hợp `HotkeysProvider` bị quên).

Nếu bạn cần phím **không** fire trong input (rare), truyền `options.ignoreInputs = true`.

### Stale closure trong callback

TanStack tự sync callback mỗi render. Không cần wrap callback bằng `useCallback` chỉ để tránh stale closure — cứ truyền inline:

```tsx
const [count, setCount] = useState(0);

usePosHotkey(POS_HOTKEYS.foo.bar, () => {
  // `count` luôn là giá trị mới nhất, không stale
  console.log(count);
});
```

### Phím tắt fire trùng khi mount 2 component cùng key

Đây là vấn đề logic, không phải bug của thư viện. Xem mục "Chống xung đột" ở trên.

### F11, Mod+W, Mod+T (không chặn được)

Một số phím trình duyệt không thể `preventDefault` được (vd: `Mod+W` đóng tab, `Mod+T` mở tab mới, `F11` toàn màn hình ở vài browser). Tránh dùng các phím này.

---

## Mở rộng tương lai (Phase 2+)

Các hướng đã suy tính nhưng chưa làm trong phase 1:

- **Help-overlay** (Shift+? hoặc F1): dùng `useHotkeyRegistrations` của TanStack đọc toàn bộ phím đang register, render bảng phím + description. Vì mọi entry đều có `meta.description` (gắn bởi `usePosHotkey`), overlay sẽ tự động lên list mới — không cần maintain hardcoded.
- **Phím chuỗi (Vim-style)**: ví dụ `g` rồi `c` để "go to checkout". Dùng `useHotkeySequence` của TanStack.
- **Recorder UI** cho user customize phím tắt: `useHotkeyRecorder` + `useHotkeySequenceRecorder` đã sẵn sàng.
- **Mở rộng `POS_HOTKEYS`** cho feature Return / Exchange / FastStockTransfer khi chúng cần phím riêng.

---

## Tham chiếu nhanh

- **Thư viện**: [`@tanstack/react-hotkeys`](https://tanstack.com/hotkeys/latest/docs/framework/react/react-hotkeys) (v0.10.0, alpha — vẫn ổn định cho production POS use case).
- **`HotkeyOptions` đầy đủ**: xem `node_modules/@tanstack/hotkeys/dist/hotkey-manager.d.ts` — có `conflictBehavior`, `eventType` (keydown/keyup), `requireReset`, `stopPropagation`, `platform`, …
- **`Hotkey` type union**: xem `node_modules/@tanstack/hotkeys/dist/hotkey.d.ts` — autocomplete đầy đủ F1–F12, Mod+S, Alt+Shift+letter, v.v.
- **Tài liệu MISA POS** (tham khảo): https://help.sapo.vn (không dùng) — POS web theo MISA, không phải Sapo.
