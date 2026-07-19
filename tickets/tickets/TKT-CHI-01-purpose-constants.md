# TKT-CHI-01 Constants — Mục đích chi (tiền gửi)

## Epic

[EPIC-19072026 Phiếu chi tiền gửi — Hợp nhất theo Mục đích chi (MISA parity)](../epics/EPIC-19072026-deposit-payment-purpose-unification.md)

## Summary

Thêm hằng số cho radio cấp 1 "Mục đích chi" (Khác/Trả nợ) — dành riêng cho **tiền gửi**, đặt cạnh (không sửa) bộ hằng số tương tự bên tiền mặt trong cùng file.

**Sửa lại so với thiết kế ban đầu**: "Hình thức chi" (dropdown cấp 2, hiện khi chọn "Khác") **không cần enum mới** — dùng thẳng `BankPaymentPurpose` đã có sẵn `CASH_TRANSFER`/`INTER_BRANCH_OUT`, chỉ đổi nhãn + bật lại `INTER_BRANCH_OUT` (đang `disabled: true`). Lý do: radio phẳng hiện tại còn 4 giá trị khác (Mua hàng/Chi phí/Hoàn tiền/Phí ngân hàng) phải giữ nguyên chức năng (đã xác nhận với user) — dựng riêng 1 enum 3 giá trị sẽ vô tình bỏ rơi 4 giá trị đó.

## Deliverables

- `apps/backoffice-web/src/pages/treasury/documents/_shared/voucher-dialog.constants.ts` — thêm mới, **không sửa** bất kỳ export hiện có (`PaymentPurposeRadio`, `PaymentOtherSubOption`, `PAYMENT_PURPOSE_OPTIONS`, `emptyFormLine`, v.v. giữ nguyên 100%, phục vụ Phiếu chi tiền mặt):
  ```ts
  export enum DepositPaymentPurposeRadio {
    OTHER_GROUP = "OTHER_GROUP",
    DEBT_GROUP = "DEBT_GROUP",
  }

  export const DEPOSIT_PAYMENT_PURPOSE_RADIO_OPTIONS = [
    { value: DepositPaymentPurposeRadio.OTHER_GROUP, label: "Khác" },
    { value: DepositPaymentPurposeRadio.DEBT_GROUP, label: "Trả nợ" },
  ];
  ```

## Acceptance Criteria

- [ ] Không export nào của cash (`PaymentPurposeRadio`, `PaymentOtherSubOption`, `subOptionToApiPurpose`, …) bị đổi tên/xoá/sửa signature.
- [ ] Không thêm enum "sub-option" riêng cho tiền gửi — CHI-02 dùng thẳng `BankPaymentPurpose`.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Không tạo file `index.ts` mới.

## Tech Approach

Thuần thêm export, không logic. Không cần test riêng (constants tĩnh) — được phủ gián tiếp qua CHI-02.

## Dependencies

- Depends on: —
- Blocks: [TKT-CHI-02](./TKT-CHI-02-dialog-restructure.md)
