import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { AppDialog } from "@erp/pos/components/AppDialog";
import {
  useCreateCustomer,
  useCustomer,
  useUpdateCustomer,
} from "@erp/pos/hooks/useCustomer";
import { useCustomerGroups } from "@erp/pos/hooks/useCustomerGroups";
import {
  generateCustomerCode,
  type CustomerDetail,
  type CustomerGroupRow,
} from "@erp/pos/lib/customerApi";
import { useDialogReset } from "../../hooks/useDialogReset";
import { CustomerGroupCreateDialog } from "./CustomerGroupCreateDialog";
import {
  buildCreateBody,
  buildUpdateBody,
  DEFAULT_PROVINCES,
  EMPTY_VALUES,
  seedFromQuery,
  userFacingError,
} from "./customerFormUtils";
import { BasicInfoSection } from "./sections/BasicInfoSection";
import { MembershipSection } from "./sections/MembershipSection";
import { CompanySection } from "./sections/CompanySection";
import type {
  CustomerCreateDialogProps,
  CustomerFormValues,
  CustomerSelectOption,
} from "./types";

/** Map BE customer record into the form's flat `CustomerFormValues` shape. */
function detailToFormValues(c: CustomerDetail): Partial<CustomerFormValues> {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    phone: c.phone ?? null,
    email: c.email ?? null,
    cccd: c.nationalId ?? null,
    birthday: c.birthDate ?? null,
    gender: c.gender ?? null,
    addressLine: c.address ?? null,
    customerGroup: c.groupId ?? null,
    accountManager: c.assignedStaffId ?? null,
    note: c.note ?? null,
    companyName: c.companyName ?? null,
    taxCode: c.taxCode ?? null,
  };
}

export function CustomerCreateDialog(props: CustomerCreateDialogProps) {
  const {
    open,
    onClose,
    mode = "create",
    customer,
    defaultQuery = "",
    defaultCustomerCode,
    provinces = DEFAULT_PROVINCES,
    districts = [],
    wards = [],
    cardTiers = [],
    accountManagers = [],
    onSubmitted,
    onCreated,
    onAddCustomerGroup,
  } = props;

  const formId = useId();
  const codeId = useId();
  const nameId = useId();
  const phoneId = useId();
  const emailId = useId();
  const cccdId = useId();
  const birthdayId = useId();
  const cardCodeId = useId();
  const cardTierId = useId();
  const groupId = useId();
  const managerId = useId();
  const noteId = useId();
  const companyId = useId();
  const taxCodeId = useId();

  const isEdit = mode === "edit";
  const titleText = isEdit ? "Chỉnh sửa khách hàng" : "Thêm khách hàng";
  const submitText = isEdit ? "Cập nhật" : "Đồng ý";

  // Edit mode pulls the customer record itself — keeps the page free of any
  // detail-fetching plumbing. The query stays disabled in create mode.
  const editingId = isEdit && open ? customer?.id : undefined;
  const { data: customerRaw } = useCustomer(editingId);

  // Customer-group lookup is also internal so the page doesn't have to thread
  // it through. The hook caches across consumers, so the membership row's
  // dropdown stays in sync with the create-group sub-dialog.
  const { data: customerGroupsData } = useCustomerGroups();
  const customerGroupsFromQuery = useMemo<CustomerSelectOption[]>(
    () =>
      (customerGroupsData ?? []).map((g) => ({ value: g.id, label: g.name })),
    [customerGroupsData],
  );

  // Mutations own the pending / error state + cache invalidation. The dialog
  // just reads `isPending` for the button and `error` for the banner.
  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer();
  const submitting = createMutation.isPending || updateMutation.isPending;
  const submitError = isEdit ? updateMutation.error : createMutation.error;

  // ---- Local form state ----------------------------------------------------
  const [values, setValues] = useState<CustomerFormValues>(EMPTY_VALUES);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  /** Auto-generated code persisted across renders within a single open. */
  const generatedCodeRef = useRef<string>("");
  /**
   * Tracks the customer id we've already applied via the fetch effect so we
   * don't clobber the user's in-progress edits when the query refetches.
   * Reset on every dialog open.
   */
  const appliedDetailIdRef = useRef<string | null>(null);

  // ---- Inline "Thêm nhóm khách hàng" sub-dialog ---------------------------
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  /** Groups created from this dialog session (merged into the select list). */
  const [extraGroups, setExtraGroups] = useState<CustomerSelectOption[]>([]);

  const mergedCustomerGroups = useMemo<CustomerSelectOption[]>(() => {
    if (extraGroups.length === 0) return customerGroupsFromQuery;
    const seen = new Set(customerGroupsFromQuery.map((g) => g.value));
    return [
      ...customerGroupsFromQuery,
      ...extraGroups.filter((g) => !seen.has(g.value)),
    ];
  }, [customerGroupsFromQuery, extraGroups]);

  // Reset form on each open transition — different reset path per mode.
  const handleOpenReset = useCallback(() => {
    setTouched({});
    setExtraGroups([]);
    setGroupDialogOpen(false);
    appliedDetailIdRef.current = null;
    // Drop any error / state held over from the previous open.
    createMutation.reset();
    updateMutation.reset();

    if (isEdit) {
      // Start from whatever seed the caller provided (often just name/phone).
      // The fetch effect below will fill in the rest once the query resolves.
      setValues({ ...EMPTY_VALUES, ...(customer ?? {}) });
    } else {
      const seed = seedFromQuery(defaultQuery);
      const code =
        defaultCustomerCode ??
        customer?.code ??
        (generatedCodeRef.current || generateCustomerCode());
      generatedCodeRef.current = code;
      setValues({
        ...EMPTY_VALUES,
        code,
        name: customer?.name ?? seed.name,
        phone: customer?.phone ?? seed.phone,
        email: customer?.email ?? "",
      });
    }
    // The two mutation `reset` fns are stable across re-renders (TanStack
    // Query binds them to the MutationObserver), so they're intentionally
    // omitted from the dep array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, customer, defaultQuery, defaultCustomerCode]);
  useDialogReset(open, handleOpenReset);

  // Once-per-open merge of the fetched detail into the form. Guarded by a ref
  // so cache refetches don't overwrite user edits later in the session.
  useEffect(() => {
    if (!isEdit || !open || !customerRaw) return;
    if (appliedDetailIdRef.current === customerRaw.id) return;
    appliedDetailIdRef.current = customerRaw.id;
    const detail = detailToFormValues(customerRaw);
    setValues((prev) => ({ ...prev, ...detail }));
  }, [customerRaw, isEdit, open]);

  // ---- Validation ----------------------------------------------------------
  const errors = useMemo(() => {
    const out: Partial<Record<keyof CustomerFormValues, string>> = {};
    if (!values.name.trim()) out.name = "Tên khách hàng không được bỏ trống";
    if (!isEdit && !(values.code ?? "").trim())
      out.code = "Mã khách hàng không được bỏ trống";
    return out;
  }, [values, isEdit]);

  const showNameError = Boolean(errors.name) && touched.name;
  const showCodeError = Boolean(errors.code) && touched.code;

  // ---- Submission ----------------------------------------------------------
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched((t) => ({ ...t, name: true, code: true }));
    if (errors.name || errors.code) return;

    try {
      const editedId = isEdit ? customer?.id : undefined;
      const result =
        isEdit && editedId
          ? await updateMutation.mutateAsync({
              id: editedId,
              body: buildUpdateBody(values),
            })
          : await createMutation.mutateAsync(buildCreateBody(values));
      onSubmitted?.(result, mode);
      onCreated?.(result);
    } catch {
      // Mutation error is surfaced via `submitError` below — nothing else
      // to do here. `mutateAsync` rejects so we don't fire the success
      // callbacks above, which is the desired behaviour.
    }
  };

  const setField = useCallback(
    <K extends keyof CustomerFormValues>(
      key: K,
      value: CustomerFormValues[K],
    ) => {
      setValues((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleTouchName = useCallback(
    () => setTouched((t) => ({ ...t, name: true })),
    [],
  );

  // If the host overrides `onAddCustomerGroup`, defer to it; otherwise open
  // the inline sub-dialog and auto-select the newly created group.
  const handleAddCustomerGroup = useCallback(() => {
    if (onAddCustomerGroup) {
      onAddCustomerGroup();
      return;
    }
    setGroupDialogOpen(true);
  }, [onAddCustomerGroup]);

  const handleGroupCreated = useCallback((group: CustomerGroupRow) => {
    const option: CustomerSelectOption = { value: group.id, label: group.name };
    setExtraGroups((prev) =>
      prev.some((g) => g.value === option.value) ? prev : [...prev, option],
    );
    setValues((prev) => ({ ...prev, customerGroup: group.id }));
  }, []);

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      width={880}
      contentClassName="shadow-[0_20px_48px_rgba(0,0,0,0.16)]"
    >
      <AppDialog.Header title={titleText} />
      <AppDialog.Body>
        <form
          id={formId}
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-1 flex-col overflow-y-auto"
        >
          <div className="flex-1 space-y-3 pb-4">
            {submitError ? (
              <div
                role="alert"
                className="mx-6 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700"
              >
                {userFacingError(submitError)}
              </div>
            ) : null}

            <BasicInfoSection
              values={values}
              ids={{
                code: codeId,
                name: nameId,
                phone: phoneId,
                email: emailId,
                cccd: cccdId,
                birthday: birthdayId,
              }}
              provinces={provinces}
              districts={districts}
              wards={wards}
              onChange={setField}
              showCodeError={showCodeError}
              showNameError={showNameError}
              codeError={errors.code}
              nameError={errors.name}
              onTouchName={handleTouchName}
            />

            <MembershipSection
              values={values}
              ids={{
                cardCode: cardCodeId,
                cardTier: cardTierId,
                group: groupId,
                manager: managerId,
                note: noteId,
              }}
              cardTiers={cardTiers}
              customerGroups={mergedCustomerGroups}
              accountManagers={accountManagers}
              onChange={setField}
              onAddCustomerGroup={handleAddCustomerGroup}
            />

            <CompanySection
              values={values}
              ids={{ company: companyId, taxCode: taxCodeId }}
              onChange={setField}
            />
          </div>
        </form>
      </AppDialog.Body>
      <AppDialog.Footer
        saveFormId={formId}
        saveLabel={submitting ? "Đang lưu…" : submitText}
        saveDisabled={submitting}
        cancelLabel="Hủy bỏ"
        onCancel={onClose}
      />

      <CustomerGroupCreateDialog
        open={groupDialogOpen}
        onClose={() => setGroupDialogOpen(false)}
        parentGroups={mergedCustomerGroups}
        onCreated={handleGroupCreated}
      />
    </AppDialog>
  );
}
