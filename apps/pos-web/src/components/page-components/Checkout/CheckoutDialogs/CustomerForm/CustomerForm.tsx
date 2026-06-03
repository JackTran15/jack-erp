import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type Ref,
} from "react";
import {
  useCreateCustomer,
  useCustomer,
  useUpdateCustomer,
} from "@erp/pos/hooks/react-query/use-query-customer";
import { useCustomerGroups } from "@erp/pos/hooks/react-query/use-query-customer-group";
import { generateCustomerCode } from "@erp/pos/lib/common/customerUtils";
import type { CustomerDetail } from "@erp/pos/interfaces/customer.interface";
import type { CustomerGroupRow } from "@erp/pos/interfaces/customer-group.interface";
import { CustomerGroupCreateDialog } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerCreateDialog/CustomerGroupCreateDialog/CustomerGroupCreateDialog";
import {
  buildCreateBody,
  buildUpdateBody,
  DEFAULT_PROVINCES,
  EMPTY_VALUES,
  seedFromQuery,
  userFacingError,
} from "@erp/pos/lib/page-libs/checkout/customerFormUtils";
import { BasicInfoSection } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerCreateDialog/BasicInfoSection/BasicInfoSection";
import { MembershipSection } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerCreateDialog/MembershipSection/MembershipSection";
import { CompanySection } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerCreateDialog/CompanySection/CompanySection";
import type { CustomerDialogMode } from "@erp/pos/types/customer.type";
import type {
  CustomerFormValues,
  CustomerSelectOption,
} from "@erp/pos/interfaces/customer-dialog.interface";
import type { CustomerRow } from "@erp/pos/interfaces/customer.interface";

/**
 * Props for the shell-less `CustomerForm`. The form renders 3 sections plus a
 * sub-dialog for creating customer groups; the parent supplies the dialog
 * shell and footer (the footer's primary button submits via `saveFormId`).
 */
export interface CustomerFormProps {
  mode: CustomerDialogMode;
  /**
   * Stable form element id; the parent passes this to `PosDialog.Footer`'s
   * `saveFormId` so the primary button fires the native submit handler.
   */
  formId: string;
  customer?: CustomerFormValues;
  defaultQuery?: string;
  defaultCustomerCode?: string;

  provinces?: CustomerSelectOption[];
  districts?: CustomerSelectOption[];
  wards?: CustomerSelectOption[];
  cardTiers?: CustomerSelectOption[];
  accountManagers?: CustomerSelectOption[];

  onSubmitted?: (customer: CustomerRow, mode: CustomerDialogMode) => void;
  onAddCustomerGroup?: () => void;
  nameInputRef?: Ref<HTMLInputElement>;
  /** Mirrors the in-flight mutation state so the parent footer can disable its button. */
  onSubmittingChange?: (submitting: boolean) => void;
}

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

function buildInitialValues(
  mode: CustomerDialogMode,
  customer: CustomerFormValues | undefined,
  defaultQuery: string,
  defaultCustomerCode: string | undefined,
  fallbackCode: string,
): CustomerFormValues {
  if (mode === "create") {
    const seed = seedFromQuery(defaultQuery);
    const code = defaultCustomerCode ?? customer?.code ?? fallbackCode;
    return {
      ...EMPTY_VALUES,
      code,
      name: customer?.name ?? seed.name,
      phone: customer?.phone ?? seed.phone,
      email: customer?.email ?? "",
    };
  }
  return { ...EMPTY_VALUES, ...(customer ?? {}) };
}

/**
 * Shell-less customer form used by `CustomerCreateDialog`. Renders 3 grouped
 * sections (basic / membership / company) inside a single `<form id={formId}>`
 * so the host dialog footer can submit via `<button type="submit" form={formId}>`.
 * Supports `create` (POST /customers) and `edit` (PATCH /customers/:id, seeded
 * from `useCustomer(id)`).
 */
export function CustomerForm({
  mode,
  formId,
  customer,
  defaultQuery = "",
  defaultCustomerCode,
  provinces = DEFAULT_PROVINCES,
  districts = [],
  wards = [],
  cardTiers = [],
  accountManagers = [],
  onSubmitted,
  onAddCustomerGroup,
  nameInputRef,
  onSubmittingChange,
}: CustomerFormProps) {
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

  const generatedCodeRef = useRef<string>(
    defaultCustomerCode ?? customer?.code ?? generateCustomerCode(),
  );

  const editingId = isEdit ? customer?.id : undefined;
  const { data: customerRaw } = useCustomer(editingId);

  const { data: customerGroupsData } = useCustomerGroups();
  const customerGroupsFromQuery = useMemo<CustomerSelectOption[]>(
    () =>
      (customerGroupsData ?? []).map((g) => ({ value: g.id, label: g.name })),
    [customerGroupsData],
  );

  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer();
  const submitting = createMutation.isPending || updateMutation.isPending;
  const submitError = isEdit ? updateMutation.error : createMutation.error;

  useEffect(() => {
    onSubmittingChange?.(submitting);
  }, [submitting, onSubmittingChange]);

  const [values, setValues] = useState<CustomerFormValues>(() =>
    buildInitialValues(
      mode,
      customer,
      defaultQuery,
      defaultCustomerCode,
      generatedCodeRef.current,
    ),
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  /**
   * Tracks the customer id we've already merged so cache refetches don't
   * overwrite in-progress edits. Reset by remounting the component.
   */
  const appliedDetailIdRef = useRef<string | null>(null);

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [extraGroups, setExtraGroups] = useState<CustomerSelectOption[]>([]);
  const mergedCustomerGroups = useMemo<CustomerSelectOption[]>(() => {
    if (extraGroups.length === 0) return customerGroupsFromQuery;
    const seen = new Set(customerGroupsFromQuery.map((g) => g.value));
    return [
      ...customerGroupsFromQuery,
      ...extraGroups.filter((g) => !seen.has(g.value)),
    ];
  }, [customerGroupsFromQuery, extraGroups]);

  useEffect(() => {
    if (!isEdit || !customerRaw) return;
    if (appliedDetailIdRef.current === customerRaw.id) return;
    appliedDetailIdRef.current = customerRaw.id;
    const detail = detailToFormValues(customerRaw);
    setValues((prev) => ({ ...prev, ...detail }));
  }, [customerRaw, isEdit]);

  const errors = useMemo(() => {
    const out: Partial<Record<keyof CustomerFormValues, string>> = {};
    if (!values.name.trim()) out.name = "Tên khách hàng không được bỏ trống";
    if (!isEdit && !(values.code ?? "").trim())
      out.code = "Mã khách hàng không được bỏ trống";
    const phone = (values.phone ?? "").trim();
    if (!phone) out.phone = "Số điện thoại không được bỏ trống";
    else if (!/^0\d{9}$/.test(phone))
      out.phone = "Số điện thoại không hợp lệ";
    return out;
  }, [values, isEdit]);

  const showNameError = Boolean(errors.name) && touched.name;
  const showCodeError = Boolean(errors.code) && touched.code;
  const showPhoneError = Boolean(errors.phone) && touched.phone;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched((t) => ({ ...t, name: true, code: true, phone: true }));
    if (errors.name || errors.code || errors.phone) return;

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
    } catch {
      // Mutation error is surfaced via the inline banner above.
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

  const handleTouchPhone = useCallback(
    () => setTouched((t) => ({ ...t, phone: true })),
    [],
  );

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
    <>
      {submitError ? (
        <div
          role="alert"
          className="mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700"
        >
          {userFacingError(submitError)}
        </div>
      ) : null}

      <form
        id={formId}
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-1 flex-col"
      >
        <div className="flex-1 space-y-3 pb-4">
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
            showPhoneError={showPhoneError}
            codeError={errors.code}
            nameError={errors.name}
            phoneError={errors.phone}
            onTouchName={handleTouchName}
            onTouchPhone={handleTouchPhone}
            nameInputRef={nameInputRef}
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

      <CustomerGroupCreateDialog
        open={groupDialogOpen}
        onClose={() => setGroupDialogOpen(false)}
        parentGroups={mergedCustomerGroups}
        onCreated={handleGroupCreated}
      />
    </>
  );
}
