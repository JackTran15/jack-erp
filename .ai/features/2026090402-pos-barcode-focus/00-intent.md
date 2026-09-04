---
feature: pos-barcode-focus
slug: 2026090402-pos-barcode-focus
owner: Akenzy
created: 2026-09-04
status: draft
---

# Intent — POS barcode scan input keeps keyboard focus

## Problem

Thu ngân quét mã vạch liên tục vào ô "Quét mã vạch (F3)" trên màn hình bán hàng POS.
Sau khi một hoá đơn được chốt (thanh toán xong, có thể kèm in hoá đơn qua
`window.print()`), focus không tự quay lại ô quét — thu ngân phải bấm chuột hoặc
bấm lại phím F3 trước khi quét mã tiếp theo. Tương tự, ngay sau khi đăng nhập /
chọn chi nhánh và vào màn hình bán hàng lần đầu, ô quét chưa có focus sẵn.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| ------- | ------------------ | ------------------ |
| Thu ngân POS | Sau khi bán xong hoặc sau khi vào màn hình bán hàng, phải click/F3 thủ công vào ô quét | Ô quét luôn có focus sẵn — sau khi vào màn hình bán hàng và ngay sau khi một giao dịch hoàn tất |

## Success signal

Sau khi `finalizeCheckoutAndPrint` hoàn tất một giao dịch (dù có in hay không), và
mỗi lần `CheckoutPage` được mount, `document.activeElement` là ô
"Quét mã vạch (F3)" (`PosSearchPopover` input được forward qua
`ProductSearchInput`) — kiểm chứng bằng kịch bản trình duyệt (ai-dlc-verify) chạy
qua ít nhất 2 giao dịch liên tiếp không cần thao tác chuột giữa hai lần quét.

## Out of scope

- Đổi hotkey F3 hoặc handler `use-checkout-hotkeys.ts` — chỉ đổi nơi *gọi* signal
  focus, không đổi cách bắt phím.
- Focus khi các dialog khác đang mở (`CustomerCreateDialog`,
  `ProductVariantSelectionModal`, v.v.) — các dialog này đã tự quản lý focus của
  chúng, không đụng tới.
- Đổi hành vi `window.print()` (hộp thoại in của trình duyệt) — chỉ đảm bảo focus
  quay lại ô quét sau khi hộp thoại đó đóng, không thay cơ chế in.
- POS login / branch-select form tự focus ô của chính nó — không thuộc phạm vi.

## Constraints

| Kind     | Detail |
| -------- | ------ |
| Platform | Chỉ `apps/pos-web`; không đụng `backoffice-web`. |
| Pattern  | Phải tái dùng signal-counter đã có (`productSearchFocusSeq` /
  `requestProductSearchFocus()` trong `checkout-ui.store.ts`) thay vì thêm cơ chế
  focus mới — đây là pattern đã dùng ở 4 nơi khác trong checkout flow. |

## Existing surface touched

- Reused components: `useCheckoutFocusManager` (`hooks/page-hooks/checkout/use-checkout-focus-manager.ts`),
  `usePosCheckoutUiStore.requestProductSearchFocus()` (`stores/page-stores/checkout/checkout-ui.store.ts`),
  `ProductSearchInput`'s existing `useEffect` trên `productSearchFocusSeq`.
- Adjacent features: F3 hotkey (`hooks/page-hooks/checkout/use-checkout-hotkeys.ts`) — không sửa, chỉ là consumer song song của cùng ref.
- Entry points: `CheckoutPage.tsx` (mount), `finalizeCheckoutAndPrint` trong
  `hooks/page-hooks/checkout/use-checkout-actions.ts` (điểm chốt giao dịch).
