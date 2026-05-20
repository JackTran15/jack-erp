import { useCallback, useId, useMemo, useState, type FormEvent } from "react";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { PosFormItem } from "@erp/pos/components/common/PosFormItem/PosFormItem";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { PosTextInput } from "@erp/pos/components/common/PosTextInput/PosTextInput";
import { useCreateCustomerGroup } from "@erp/pos/hooks/react-query/use-query-customer-group";
import { type CustomerGroupRow } from "@erp/pos/interfaces/customer-group.interface";
import { useDialogReset } from "@erp/pos/hooks/common/use-dialog-reset";
import { userFacingError } from "@erp/pos/lib/page-libs/checkout/customerFormUtils";
import type { CustomerSelectOption } from "@erp/pos/interfaces/customer-dialog.interface";

const LABEL_CLASS = "w-[110px] shrink-0 text-sm text-gray-700";

interface FormState {
  name: string;
  parentGroupId: string;
  description: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  parentGroupId: "",
  description: "",
};

export interface CustomerGroupCreateDialogProps {
  open: boolean;
  onClose: () => void;
  /** Optional list of existing groups for the "Thuộc nhóm" picker. */
  parentGroups?: CustomerSelectOption[];
  /**
   * Called after a successful create. Lets the host append the new group to
   * its select options and auto-select it.
   */
  onCreated?: (group: CustomerGroupRow) => void;
}

/**
 * Modal sub-flow opened from the "+ Nhóm khách hàng" affordance inside
 * `CustomerCreateDialog`. Mirrors the visual layout used elsewhere in the
 * customer dialogs (horizontal label + underline control).
 *
 * The "Thuộc nhóm" (parent group) field is rendered for visual parity with the
 * current spec but is not yet persisted — the backend's `CreateCustomerGroupDto`
 * only accepts `name` + `description`. Treat the field as a placeholder for the
 * future hierarchical-group rollout.
 */
export function CustomerGroupCreateDialog({
  open,
  onClose,
  parentGroups = [],
  onCreated,
}: CustomerGroupCreateDialogProps) {
  const formId = useId();
  const nameId = useId();
  const parentId = useId();
  const descriptionId = useId();

  const createGroup = useCreateCustomerGroup();
  const submitting = createGroup.isPending;
  const submitError = createGroup.error;

  const [values, setValues] = useState<FormState>(EMPTY_FORM);
  const [touched, setTouched] = useState<{ name?: boolean }>({});

  const handleOpenReset = useCallback(() => {
    setValues(EMPTY_FORM);
    setTouched({});
    createGroup.reset();
    // `createGroup.reset` is stable across renders (TanStack Query binds it
    // to the MutationObserver), so it's intentionally omitted from the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useDialogReset(open, handleOpenReset);

  const nameError = useMemo(
    () => (values.name.trim() ? "" : "Tên nhóm không được bỏ trống"),
    [values.name],
  );
  const showNameError = Boolean(nameError) && touched.name;

  const setField = useCallback(
    <K extends keyof FormState>(key: K, next: FormState[K]) => {
      setValues((prev) => ({ ...prev, [key]: next }));
    },
    [],
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched((t) => ({ ...t, name: true }));
    if (nameError) return;
    try {
      const created = await createGroup.mutateAsync({
        name: values.name.trim(),
        description: values.description.trim() || undefined,
      });
      onCreated?.(created);
      onClose();
    } catch {
      // Surfaced through `submitError` below; nothing else to do here.
    }
  };

  return (
    <PosDialog open={open} onClose={onClose} width={520}>
      <PosDialog.Header title="Thêm nhóm khách hàng" />
      <PosDialog.Body>
        <form
          id={formId}
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          {submitError ? (
            <div
              role="alert"
              className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700"
            >
              {userFacingError(submitError)}
            </div>
          ) : null}

          <PosFormItem
            label="Tên nhóm"
            htmlFor={nameId}
            layout="horizontal"
            required
            labelClassName={LABEL_CLASS}
            error={showNameError ? nameError : undefined}
          >
            <PosTextInput
              id={nameId}
              variant="underline"
              value={values.name}
              onChange={(v) => setField("name", v)}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              invalid={showNameError}
              autoComplete="off"
            />
          </PosFormItem>

          <PosFormItem
            label="Thuộc nhóm"
            htmlFor={parentId}
            layout="horizontal"
            labelClassName={LABEL_CLASS}
          >
            <PosSelect
              id={parentId}
              variant="underline"
              value={
                parentGroups.find((o) => o.value === values.parentGroupId) ??
                null
              }
              onChange={(item) => setField("parentGroupId", item.value)}
              items={parentGroups}
              itemKey={(o) => o.value}
              renderItem={(o) => o.label}
              placeholder=""
              ariaLabel="Thuộc nhóm"
            />
          </PosFormItem>

          <PosFormItem
            label="Diễn giải"
            htmlFor={descriptionId}
            layout="horizontal"
            labelClassName={LABEL_CLASS}
          >
            <PosTextInput
              id={descriptionId}
              variant="underline"
              value={values.description}
              onChange={(v) => setField("description", v)}
              placeholder="Nhập nội dung..."
              autoComplete="off"
            />
          </PosFormItem>
        </form>
      </PosDialog.Body>
      <PosDialog.Footer
        saveFormId={formId}
        saveLabel={submitting ? "Đang lưu…" : "Đồng ý"}
        saveDisabled={submitting}
        cancelLabel="Hủy bỏ"
        onCancel={onClose}
      />
    </PosDialog>
  );
}
