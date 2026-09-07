---
feature: pos-barcode-focus
adr_count: 1
---

# Logical design — POS barcode scan input keeps keyboard focus

## Approach

Tái dùng nguyên vẹn signal-counter đã có: `usePosCheckoutUiStore.requestProductSearchFocus()`
tăng `productSearchFocusSeq`, và `ProductSearchInput` đã có sẵn `useEffect` lắng
nghe giá trị đó để `.focus()` + `.select()`. Không cần sửa `ProductSearchInput`
hay `PosSearchPopover`.

Hai điểm gọi mới:
1. `CheckoutPage.tsx` — thêm một `useEffect` gọi `requestProductSearchFocus()` mỗi
   lần mount (dependency array rỗng `[]`).
2. `finalizeCheckoutAndPrint` (`use-checkout-actions.ts`) — gọi
   `requestProductSearchFocus()` ngay sau `resetCheckoutUiDraft()` (trước khi in),
   rồi gọi lại lần nữa ngay sau `await printReceiptIfNeeded(...)`.

## Alternatives rejected

| Option | Why not |
| ------ | ------- |
| Gọi trực tiếp `focus.refs.productSearch.current?.focus()` từ `use-checkout-actions.ts` | Hook này không có quyền truy cập `refs` (chỉ `CheckoutPage` giữ `useCheckoutFocusManager`); phải prop-drill thêm một tham số xuyên qua toàn bộ chain hook, trong khi store đã là kênh sẵn có để "yêu cầu focus" từ nơi không giữ ref — đúng lý do pattern signal-counter được tạo ra ban đầu. |
| Thêm `autoFocus` prop tĩnh lên `<input>` trong `PosSearchPopover` | Chỉ giải quyết AC-01 (mount lần đầu), không giải quyết AC-02 (mount lại — React không remount input nếu component cha không unmount) và hoàn toàn không giải quyết AC-03/AC-04 (focus sau giao dịch). |
| Dùng `document.activeElement` polling hoặc `MutationObserver` để tự phát hiện mất focus rồi focus lại | Cơ chế mới, phức tạp hơn hẳn, và có thể cướp focus không mong muốn khỏi các dialog khác (customer search, payment amount) đang cố tình giữ focus. |

## Domain model

Không có domain model mới — đây là thay đổi hành vi UI thuần tuý trên state đã tồn tại (`productSearchFocusSeq`).

## Contracts

Không có API/contract nào thay đổi — chỉ frontend, không đụng backend.

## State ownership

| State | Owner | Lifetime |
| ----- | ----- | -------- |
| `productSearchFocusSeq` | `usePosCheckoutUiStore` (đã có) | Toàn phiên POS, không đổi lifetime |

## Error taxonomy

| Condition | Failure subtype | UI |
| --------- | ---------------- | -- |
| `refs.productSearch.current` là `null` tại thời điểm effect chạy (input chưa mount) | Bỏ qua âm thầm | Không có lỗi hiển thị — `ProductSearchInput`'s effect tự bỏ qua nếu `inputRef.current` null; không throw |

## Cache & offline

Không áp dụng.

## Observability

Không thêm log/metric mới — hành vi focus không cần telemetry riêng theo yêu cầu hiện tại.

## ADRs

### ADR-01 — Focus qua signal-counter store, không qua ref trực tiếp

**Context:** Cần trigger focus từ hai nơi không đối xứng: `CheckoutPage` (có ref
qua `useCheckoutFocusManager`) và `finalizeCheckoutAndPrint` bên trong
`use-checkout-actions.ts` (không có ref, chỉ có quyền truy cập Zustand store qua
`.getState()`, đúng như cách nó đã gọi `resetActiveSessionAfterCheckout()` và
`resetCheckoutUiDraft()`).

**Decision:** Dùng `usePosCheckoutUiStore.getState().requestProductSearchFocus()`
ở cả hai nơi, tái dùng cơ chế `productSearchFocusSeq` đã tồn tại thay vì tạo cơ
chế mới hoặc prop-drill ref.

**Consequences:** Không cần đổi chữ ký hàm nào, không đụng
`useCheckoutFocusManager` hay `ProductSearchInput`. Nhược điểm nhỏ: hai lần gọi
liên tiếp gần nhau (ngay sau reset, rồi lại sau khi in) sẽ tăng seq hai lần —
vô hại vì effect chỉ quan tâm giá trị đổi, không quan tâm độ lớn.

**Status:** accepted
