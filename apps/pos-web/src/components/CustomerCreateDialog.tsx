import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "@erp/ui";
import { AppDialog } from "./AppDialog";
import { useDialogReset } from "../features/checkout/hooks/useDialogReset";
import {
  createCustomer,
  phoneDigitsOnly,
  updateCustomer,
  type CreateCustomerBody,
  type CustomerRow,
} from "../lib/customerApi";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CustomerDialogMode = "create" | "edit";

export type CustomerGender = "MALE" | "FEMALE" | "UNSPECIFIED";

/**
 * Extended customer record accepted by the dialog. The fields beyond `id`,
 * `name`, `phone`, `email` are display-only — the backend currently only
 * persists the narrow `CreateCustomerBody`. They live here so callers that
 * already have richer data can pre-fill the form.
 */
export interface CustomerFormValues {
  id?: string;
  /** Auto-generated public code (e.g. "KH000018"). Read-only in the form. */
  code?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  cccd?: string | null;
  /** ISO date or "yyyy-MM-dd" string; rendered with `<input type="date">`. */
  birthday?: string | null;
  gender?: CustomerGender | null;
  province?: string | null;
  district?: string | null;
  ward?: string | null;
  /** "Số nhà, tên đường" — the freeform first line of the address. */
  addressLine?: string | null;
  cardCode?: string | null;
  cardTier?: string | null;
  customerGroup?: string | null;
  accountManager?: string | null;
  note?: string | null;
  companyName?: string | null;
  taxCode?: string | null;
}

export interface CustomerSelectOption {
  value: string;
  label: string;
}

/** Argument shape passed to a custom `onSubmit` override. */
export interface CustomerSubmitInput {
  mode: CustomerDialogMode;
  customerId?: string;
  /** Subset that maps to `CreateCustomerBody`. */
  body: CreateCustomerBody;
  /** Full form payload — extras may be ignored by the backend. */
  values: CustomerFormValues;
}

export interface CustomerCreateDialogProps {
  open: boolean;
  onClose: () => void;

  /** Defaults to `"create"` so legacy callers keep working unchanged. */
  mode?: CustomerDialogMode;
  /** Pre-fill values; required when `mode === "edit"` (provides id). */
  customer?: CustomerFormValues;
  /** Used in `create` mode to seed name OR phone (depending on shape). */
  defaultQuery?: string;
  /** Auto-generated customer code shown read-only when creating. */
  defaultCustomerCode?: string;

  // Lookup data — caller supplies whatever it has; sensible fallbacks below.
  provinces?: CustomerSelectOption[];
  districts?: CustomerSelectOption[];
  wards?: CustomerSelectOption[];
  cardTiers?: CustomerSelectOption[];
  customerGroups?: CustomerSelectOption[];
  accountManagers?: CustomerSelectOption[];

  /** Called after a successful create or update. Preferred for new code. */
  onSubmitted?: (customer: CustomerRow, mode: CustomerDialogMode) => void;
  /**
   * LEGACY alias for `onSubmitted`. Fires for **both** create and update so
   * existing call sites (e.g. `CheckoutPage.tsx`) keep working unchanged.
   */
  onCreated?: (customer: CustomerRow) => void;

  /** DI seam — replace the actual API call (e.g. for tests / custom flows). */
  onSubmit?: (input: CustomerSubmitInput) => Promise<CustomerRow>;
  /** "+ Nhóm khách hàng" sub-flow trigger. Omit to hide the button. */
  onAddCustomerGroup?: () => void;

  /**
   * Khi true, trả focus về element đang active lúc dialog mở sau khi đóng.
   * Forward xuống `AppDialog`. Xem `AppDialog.returnFocusOnClose` để biết
   * chi tiết.
   */
  returnFocusOnClose?: boolean;
  /**
   * Ref tới element nhận focus sau khi dialog đóng. Forward xuống `AppDialog`.
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

// ---------------------------------------------------------------------------
// Defaults / helpers
// ---------------------------------------------------------------------------

const DEFAULT_PROVINCES: CustomerSelectOption[] = [
  { value: "HN", label: "Hà Nội" },
  { value: "HP", label: "Hải Phòng" },
  { value: "HD", label: "Hải Dương" },
  { value: "HY", label: "Hưng Yên" },
  { value: "HNM", label: "Hà Nam" },
  { value: "ND", label: "Nam Định" },
];

const EMPTY_VALUES: CustomerFormValues = {
  name: "",
  gender: "MALE",
};

function userFacingError(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    if (m.startsWith("HTTP 403"))
      return "Không có quyền thao tác khách hàng (customer.write).";
    if (m.startsWith("HTTP 401")) return "Phiên hết hạn. Đăng nhập lại.";
    if (m.startsWith("HTTP 404"))
      return "Không tìm thấy khách hàng cần cập nhật.";
    return m.replace(/^HTTP \d+: /, "").slice(0, 400) || "Đã xảy ra lỗi.";
  }
  return "Lỗi không xác định.";
}

function generateCustomerCode(): string {
  const seq = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  return `KH${seq}`;
}

function joinAddress(
  values: Pick<CustomerFormValues, "addressLine" | "ward" | "district" | "province">,
): string | undefined {
  const parts = [
    values.addressLine?.trim(),
    values.ward?.trim(),
    values.district?.trim(),
    values.province?.trim(),
  ].filter((p): p is string => Boolean(p && p.length > 0));
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function buildCreateBody(values: CustomerFormValues): CreateCustomerBody {
  return {
    name: values.name.trim(),
    phone: values.phone?.trim() || undefined,
    email: values.email?.trim() || undefined,
    address: joinAddress(values),
  };
}

/** Seed name/phone from a freeform query when entering create mode. */
function seedFromQuery(query: string): { name: string; phone: string } {
  const seed = query.trim();
  const digits = phoneDigitsOnly(seed);
  const isPhoneLike = digits.length >= 6 && digits.length >= seed.length - 1;
  return {
    name: isPhoneLike ? "" : seed,
    phone: isPhoneLike ? seed : "",
  };
}

// ---------------------------------------------------------------------------
// Form atoms (local — could be extracted later if reused outside the dialog)
// ---------------------------------------------------------------------------

function SectionBanner({ children }: { children: ReactNode }) {
  return (
    <div className="my-2 rounded-sm bg-[#EEF2F6] px-4 py-2 text-[15px] font-semibold text-gray-900">
      {children}
    </div>
  );
}

interface FieldRowProps {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  /** Set to true to align the label to the top (e.g. multi-row controls). */
  alignTop?: boolean;
  /** Extra classes — typically grid-span hints, e.g. `md:col-span-2`. */
  className?: string;
}

function FieldRow({
  label,
  htmlFor,
  required,
  error,
  children,
  alignTop,
  className,
}: FieldRowProps) {
  return (
    <div
      className={cn(
        "flex gap-4 px-1",
        alignTop ? "items-start" : "items-center",
        className,
      )}
    >
      <label
        htmlFor={htmlFor}
        className={cn(
          "w-[140px] shrink-0 text-[14px] text-gray-700",
          alignTop && "pt-2",
        )}
      >
        {label}
        {required ? (
          <span className="ml-0.5 text-[#E53E3E]">*</span>
        ) : null}
      </label>
      <div className="min-w-0 flex-1">
        {children}
        {error ? (
          <p
            className="mt-1 text-[12px] text-[#E53E3E]"
            role="alert"
            aria-live="polite"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface UnderlineInputProps {
  id?: string;
  type?: "text" | "tel" | "email" | "date";
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  invalid?: boolean;
  trailing?: ReactNode;
  readOnly?: boolean;
  inputMode?: "text" | "tel" | "email" | "numeric" | "search";
  autoComplete?: string;
  ariaLabel?: string;
}

function UnderlineInput({
  id,
  type = "text",
  value,
  onChange,
  onBlur,
  placeholder,
  invalid,
  trailing,
  readOnly,
  inputMode,
  autoComplete,
  ariaLabel,
}: UnderlineInputProps) {
  return (
    <div
      className={cn(
        "flex h-8 items-center gap-2 border-b transition-colors",
        invalid
          ? "border-[#F87171]"
          : "border-[#D1D5DB] focus-within:border-[#5B5FE9]",
      )}
    >
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        readOnly={readOnly}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-[14px] text-gray-900",
          "placeholder:italic placeholder:text-gray-400 focus:outline-none",
          readOnly && "cursor-default text-gray-700",
        )}
      />
      {trailing}
    </div>
  );
}

interface UnderlineSelectProps {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: CustomerSelectOption[];
  placeholder?: string;
  trailing?: ReactNode;
  invalid?: boolean;
  ariaLabel?: string;
}

function UnderlineSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "",
  trailing,
  invalid,
  ariaLabel,
}: UnderlineSelectProps) {
  return (
    <div
      className={cn(
        "flex h-8 items-center gap-2 border-b transition-colors",
        invalid
          ? "border-[#F87171]"
          : "border-[#D1D5DB] focus-within:border-[#5B5FE9]",
      )}
    >
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-[14px] focus:outline-none",
          value ? "text-gray-900" : "italic text-gray-400",
        )}
      >
        <option value="" disabled hidden>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {trailing}
    </div>
  );
}

interface RadioGroupProps {
  name: string;
  value: CustomerGender;
  onChange: (next: CustomerGender) => void;
}

const GENDER_OPTIONS: Array<{ value: CustomerGender; label: string }> = [
  { value: "MALE", label: "Nam" },
  { value: "FEMALE", label: "Nữ" },
  { value: "UNSPECIFIED", label: "Không xác định" },
];

function GenderRadioGroup({ name, value, onChange }: RadioGroupProps) {
  return (
    <div role="radiogroup" className="flex h-8 items-center gap-6">
      {GENDER_OPTIONS.map((opt) => {
        const selected = opt.value === value;
        return (
          <label
            key={opt.value}
            className="inline-flex cursor-pointer items-center gap-2 text-[14px] text-gray-900"
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={selected}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded-full border",
                selected ? "border-[#5B5FE9]" : "border-gray-300",
              )}
            >
              {selected ? (
                <span className="h-2 w-2 rounded-full bg-[#5B5FE9]" />
              ) : null}
            </span>
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trailing icons
// ---------------------------------------------------------------------------

function CalendarIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="text-gray-500"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="text-gray-500"
    >
      <path d="M3 7V5a2 2 0 0 1 2-2h2M21 7V5a2 2 0 0 0-2-2h-2M3 17v2a2 2 0 0 0 2 2h2M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M3 12h18" />
    </svg>
  );
}

function PlusCircleSolidIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="text-[#22C55E]"
    >
      <circle cx="12" cy="12" r="9" fill="white" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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
    customerGroups = [],
    accountManagers = [],
    onSubmitted,
    onCreated,
    onSubmit,
    onAddCustomerGroup,
    returnFocusOnClose,
    returnFocusTo,
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

  // ---- Local form state ----------------------------------------------------
  const [values, setValues] = useState<CustomerFormValues>(EMPTY_VALUES);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /** Auto-generated code persisted across renders within a single open. */
  const generatedCodeRef = useRef<string>("");

  // Reset form on each open transition — different reset path per mode.
  const handleOpenReset = useCallback(() => {
    setError("");
    setLoading(false);
    setTouched({});

    if (isEdit && customer) {
      setValues({
        ...EMPTY_VALUES,
        ...customer,
      });
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
  }, [isEdit, customer, defaultQuery, defaultCustomerCode]);
  useDialogReset(open, handleOpenReset);

  // ---- Validation ----------------------------------------------------------
  const errors = useMemo(() => {
    const out: Partial<Record<keyof CustomerFormValues, string>> = {};
    if (!values.name.trim())
      out.name = "Tên khách hàng không được bỏ trống";
    return out;
  }, [values]);

  const showNameError = Boolean(errors.name) && touched.name;

  // ---- Submission ----------------------------------------------------------
  const performSubmit = async (
    input: CustomerSubmitInput,
  ): Promise<CustomerRow> => {
    if (onSubmit) return onSubmit(input);
    return input.mode === "edit" && input.customerId
      ? updateCustomer(input.customerId, input.body)
      : createCustomer(input.body);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched((t) => ({ ...t, name: true }));
    if (errors.name) return;
    setError("");
    setLoading(true);
    try {
      const body = buildCreateBody(values);
      const result = await performSubmit({
        mode,
        customerId: isEdit ? customer?.id : undefined,
        body,
        values,
      });
      onSubmitted?.(result, mode);
      onCreated?.(result);
    } catch (err) {
      setError(userFacingError(err));
    } finally {
      setLoading(false);
    }
  };

  // ---- Helpers to update single fields ------------------------------------
  const setField = <K extends keyof CustomerFormValues>(
    key: K,
    value: CustomerFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  // ---- Render --------------------------------------------------------------
  return (
    <AppDialog
      open={open}
      onClose={onClose}
      width={880}
      contentClassName="shadow-[0_20px_48px_rgba(0,0,0,0.16)]"
      returnFocusOnClose={returnFocusOnClose}
      returnFocusTo={returnFocusTo}
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
            {error ? (
              <div
                role="alert"
                className="mx-6 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700"
              >
                {error}
              </div>
            ) : null}

              {/* ============= Section 1: Thông tin cơ bản ============= */}
              <SectionBanner>Thông tin cơ bản</SectionBanner>

              <div className="grid grid-cols-1 gap-y-5 gap-x-8 md:grid-cols-2">
                <FieldRow label="Mã khách hàng" htmlFor={codeId} required>
                  <UnderlineInput
                    id={codeId}
                    value={values.code ?? ""}
                    onChange={(v) => setField("code", v)}
                    readOnly
                  />
                </FieldRow>

                <FieldRow
                  label="Khách hàng"
                  htmlFor={nameId}
                  required
                  error={showNameError ? errors.name : undefined}
                >
                  <UnderlineInput
                    id={nameId}
                    value={values.name}
                    onChange={(v) => setField("name", v)}
                    onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                    placeholder="Tên khách hàng"
                    invalid={showNameError}
                    autoComplete="name"
                  />
                </FieldRow>

                <FieldRow label="Số điện thoại" htmlFor={phoneId}>
                  <UnderlineInput
                    id={phoneId}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={values.phone ?? ""}
                    onChange={(v) => setField("phone", v)}
                    placeholder="Số điện thoại"
                  />
                </FieldRow>

                <FieldRow label="Email" htmlFor={emailId}>
                  <UnderlineInput
                    id={emailId}
                    type="email"
                    autoComplete="email"
                    value={values.email ?? ""}
                    onChange={(v) => setField("email", v)}
                  />
                </FieldRow>

                <FieldRow label="CCCD" htmlFor={cccdId}>
                  <UnderlineInput
                    id={cccdId}
                    value={values.cccd ?? ""}
                    onChange={(v) => setField("cccd", v)}
                    placeholder="Số căn cước công dân"
                  />
                </FieldRow>

                <FieldRow label="Ngày sinh" htmlFor={birthdayId}>
                  <UnderlineInput
                    id={birthdayId}
                    type="date"
                    value={values.birthday ?? ""}
                    onChange={(v) => setField("birthday", v)}
                    trailing={<CalendarIcon />}
                  />
                </FieldRow>

                <FieldRow label="Giới tính">
                  <GenderRadioGroup
                    name="gender"
                    value={values.gender ?? "UNSPECIFIED"}
                    onChange={(v) => setField("gender", v)}
                  />
                </FieldRow>

                <FieldRow label="Địa chỉ" alignTop className="md:col-span-2">
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <UnderlineSelect
                        value={values.province ?? ""}
                        onChange={(v) => setField("province", v)}
                        options={provinces}
                        placeholder="Tỉnh/Thành phố"
                        ariaLabel="Tỉnh/Thành phố"
                      />
                      <UnderlineSelect
                        value={values.district ?? ""}
                        onChange={(v) => setField("district", v)}
                        options={districts}
                        placeholder="Quận/huyện"
                        ariaLabel="Quận/huyện"
                      />
                      <UnderlineSelect
                        value={values.ward ?? ""}
                        onChange={(v) => setField("ward", v)}
                        options={wards}
                        placeholder="Xã/phường"
                        ariaLabel="Xã/phường"
                      />
                    </div>
                    <UnderlineInput
                      value={values.addressLine ?? ""}
                      onChange={(v) => setField("addressLine", v)}
                      placeholder="Số nhà, tên đường"
                      ariaLabel="Số nhà, tên đường"
                    />
                  </div>
                </FieldRow>
              </div>

              {/* ============= Section 2: Thẻ thành viên ============= */}
              <SectionBanner>Thông tin thẻ thành viên</SectionBanner>

              <div className="grid grid-cols-1 gap-y-5 gap-x-8 md:grid-cols-2">
                <FieldRow label="Mã thẻ thành viên" htmlFor={cardCodeId}>
                  <UnderlineInput
                    id={cardCodeId}
                    value={values.cardCode ?? ""}
                    onChange={(v) => setField("cardCode", v)}
                    trailing={
                      <button
                        type="button"
                        aria-label="Quét mã thẻ thành viên"
                        className="rounded p-0.5 text-gray-500 hover:text-gray-700"
                      >
                        <ScanIcon />
                      </button>
                    }
                  />
                </FieldRow>

                <FieldRow label="Hạng thẻ" htmlFor={cardTierId}>
                  <UnderlineSelect
                    id={cardTierId}
                    value={values.cardTier ?? ""}
                    onChange={(v) => setField("cardTier", v)}
                    options={cardTiers}
                  />
                </FieldRow>

                <FieldRow label="Nhóm khách hàng" htmlFor={groupId}>
                  <UnderlineSelect
                    id={groupId}
                    value={values.customerGroup ?? ""}
                    onChange={(v) => setField("customerGroup", v)}
                    options={customerGroups}
                    trailing={
                      onAddCustomerGroup ? (
                        <button
                          type="button"
                          aria-label="Thêm nhóm khách hàng mới"
                          onClick={onAddCustomerGroup}
                          className="rounded p-0.5 hover:scale-110"
                        >
                          <PlusCircleSolidIcon />
                        </button>
                      ) : undefined
                    }
                  />
                </FieldRow>

                <FieldRow label="Nhân viên phụ trách" htmlFor={managerId}>
                  <UnderlineSelect
                    id={managerId}
                    value={values.accountManager ?? ""}
                    onChange={(v) => setField("accountManager", v)}
                    options={accountManagers}
                  />
                </FieldRow>

                <FieldRow label="Ghi chú" htmlFor={noteId}>
                  <UnderlineInput
                    id={noteId}
                    value={values.note ?? ""}
                    onChange={(v) => setField("note", v)}
                  />
                </FieldRow>
              </div>

              {/* ============= Section 3: Công ty ============= */}
              <SectionBanner>Thông tin công ty</SectionBanner>

              <div className="grid grid-cols-1 gap-y-5 gap-x-8 pb-6 md:grid-cols-2">
                <FieldRow label="Công ty" htmlFor={companyId}>
                  <UnderlineInput
                    id={companyId}
                    value={values.companyName ?? ""}
                    onChange={(v) => setField("companyName", v)}
                  />
                </FieldRow>

                <FieldRow label="Mã số thuế" htmlFor={taxCodeId}>
                  <UnderlineInput
                    id={taxCodeId}
                    value={values.taxCode ?? ""}
                    onChange={(v) => setField("taxCode", v)}
                  />
                </FieldRow>
              </div>
          </div>
        </form>
      </AppDialog.Body>
      <AppDialog.Footer
        saveFormId={formId}
        saveLabel={loading ? "Đang lưu…" : submitText}
        saveDisabled={loading}
        cancelLabel="Hủy bỏ"
        onCancel={onClose}
      />
    </AppDialog>
  );
}
