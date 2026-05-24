import { useCallback, useId, useRef, useState, type RefObject } from "react";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { CustomerForm } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerForm/CustomerForm";
import type { CustomerDialogMode } from "@erp/pos/types/customer.type";
import type {
  CustomerFormValues,
  CustomerSelectOption,
} from "@erp/pos/interfaces/customer-dialog.interface";
import type { CustomerRow } from "@erp/pos/interfaces/customer.interface";

export interface CustomerCreateDialogProps {
  open: boolean;
  onClose: () => void;

  /** Defaults to `"create"` so legacy callers keep working unchanged. */
  mode?: CustomerDialogMode;
  /**
   * Initial seed. In `edit` mode, `customer.id` drives the internal
   * `useCustomer(id)` fetch that populates the rest of the form, so the
   * caller only needs to pass what it already has (typically `id` + `name` +
   * `phone` + `email` from the search row). In `create` mode this is used
   * to override name/phone/email defaults if desired.
   */
  customer?: CustomerFormValues;
  /** Used in `create` mode to seed name OR phone (depending on shape). */
  defaultQuery?: string;
  /** Auto-generated customer code shown read-only when creating. */
  defaultCustomerCode?: string;

  // Lookup data — caller supplies whatever it has; sensible fallbacks below.
  // Customer groups are fetched internally via `useCustomerGroups()` and so
  // are intentionally NOT exposed as a prop here.
  provinces?: CustomerSelectOption[];
  districts?: CustomerSelectOption[];
  wards?: CustomerSelectOption[];
  cardTiers?: CustomerSelectOption[];
  accountManagers?: CustomerSelectOption[];

  /** Called after a successful create or update. Preferred for new code. */
  onSubmitted?: (customer: CustomerRow, mode: CustomerDialogMode) => void;
  /**
   * LEGACY alias for `onSubmitted`. Fires for **both** create and update so
   * existing call sites (e.g. `CheckoutPage.tsx`) keep working unchanged.
   */
  onCreated?: (customer: CustomerRow) => void;

  /** "+ Nhóm khách hàng" sub-flow trigger. Omit to hide the button. */
  onAddCustomerGroup?: () => void;

  /**
   * Ref tới element nhận focus sau khi dialog đóng — forwarded to
   * `PosDialog.returnFocusTo`. Dùng cho hotkey flow (cancel/ESC → quay về ô
   * search KH, tạo thành công → focus ô nhập tiền).
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

/**
 * Dialog shell around `CustomerForm` for the "Thêm khách hàng" /
 * "Chỉnh sửa khách hàng" flows. All form state, mutation calls, and the
 * "+ Nhóm khách hàng" sub-dialog live inside `CustomerForm`; this wrapper
 * only supplies the modal chrome and forwards the submit button via
 * `PosDialog.Footer`'s `saveFormId`.
 */
export function CustomerCreateDialog({
  open,
  onClose,
  mode = "create",
  customer,
  defaultQuery,
  defaultCustomerCode,
  provinces,
  districts,
  wards,
  cardTiers,
  accountManagers,
  onSubmitted,
  onCreated,
  onAddCustomerGroup,
  returnFocusTo,
}: CustomerCreateDialogProps) {
  const formId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = mode === "edit";
  const titleText = isEdit ? "Chỉnh sửa khách hàng" : "Thêm khách hàng";
  const submitText = isEdit ? "Cập nhật" : "Đồng ý";

  const handleSubmitted = useCallback(
    (c: CustomerRow, m: CustomerDialogMode) => {
      onSubmitted?.(c, m);
      onCreated?.(c);
    },
    [onSubmitted, onCreated],
  );

  return (
    <PosDialog
      open={open}
      onClose={onClose}
      width={880}
      contentClassName="shadow-[0_20px_48px_rgba(0,0,0,0.16)]"
      returnFocusTo={returnFocusTo}
      initialFocusRef={nameInputRef}
    >
      <PosDialog.Header title={titleText} />
      <PosDialog.Body>
        {open ? (
          <CustomerForm
            mode={mode}
            formId={formId}
            customer={customer}
            defaultQuery={defaultQuery}
            defaultCustomerCode={defaultCustomerCode}
            provinces={provinces}
            districts={districts}
            wards={wards}
            cardTiers={cardTiers}
            accountManagers={accountManagers}
            onSubmitted={handleSubmitted}
            onAddCustomerGroup={onAddCustomerGroup}
            nameInputRef={nameInputRef}
            onSubmittingChange={setSubmitting}
          />
        ) : null}
      </PosDialog.Body>
      <PosDialog.Footer
        saveFormId={formId}
        saveLabel={submitting ? "Đang lưu…" : submitText}
        saveDisabled={submitting}
        cancelLabel="Hủy bỏ"
        onCancel={onClose}
      />
    </PosDialog>
  );
}
