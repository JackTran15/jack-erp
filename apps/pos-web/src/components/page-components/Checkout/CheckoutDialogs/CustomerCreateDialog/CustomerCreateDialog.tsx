import { useCallback, useId, useRef, useState } from "react";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { CustomerForm } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerForm/CustomerForm";
import type {
  CustomerCreateDialogProps,
  CustomerDialogMode,
} from "@erp/pos/lib/page-libs/checkout/customerCreate.types";
import type { CustomerRow } from "@erp/pos/lib/common/customerApi";

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
