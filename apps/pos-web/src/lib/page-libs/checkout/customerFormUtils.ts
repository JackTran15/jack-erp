import {
  CustomerGenderEnum,
  MembershipTierEnum,
} from "@erp/pos/types/customer.type";
import {
  generateMembershipCardCode,
  phoneDigitsOnly,
} from "@erp/pos/lib/common/customerUtils";
import type {
  CreateCustomerBody,
  CreateMembershipCardInlineBody,
  UpdateCustomerBody,
} from "@erp/pos/dtos/customer.dto";
import type { CustomerFormValues, CustomerSelectOption } from "@erp/pos/interfaces/customer-dialog.interface";

export const DEFAULT_PROVINCES: CustomerSelectOption[] = [
  { value: "HN", label: "Hà Nội" },
  { value: "HP", label: "Hải Phòng" },
  { value: "HD", label: "Hải Dương" },
  { value: "HY", label: "Hưng Yên" },
  { value: "HNM", label: "Hà Nam" },
  { value: "ND", label: "Nam Định" },
];

export const EMPTY_VALUES: CustomerFormValues = {
  name: "",
  gender: CustomerGenderEnum.MALE,
};

export const GENDER_OPTIONS: ReadonlyArray<{
  value: CustomerGenderEnum;
  label: string;
}> = [
  { value: CustomerGenderEnum.MALE, label: "Nam" },
  { value: CustomerGenderEnum.FEMALE, label: "Nữ" },
  { value: CustomerGenderEnum.UNSPECIFIED, label: "Không xác định" },
];

function extractServerMessages(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      message?: unknown;
    };
    if (Array.isArray(parsed.message)) {
      const lines = parsed.message
        .filter((m): m is string => typeof m === "string")
        .map((m) => m.trim())
        .filter(Boolean);
      if (lines.length > 0) return lines.join("; ");
    }
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    /* fall through */
  }
  return null;
}

export function userFacingError(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    if (m.startsWith("HTTP 403"))
      return "Không có quyền thao tác khách hàng (customer.write).";
    if (m.startsWith("HTTP 401")) return "Phiên hết hạn. Đăng nhập lại.";
    if (m.startsWith("HTTP 404"))
      return "Không tìm thấy khách hàng cần cập nhật.";
    const serverMessages = extractServerMessages(m);
    if (serverMessages) return serverMessages.slice(0, 400);
    return m.replace(/^HTTP \d+: /, "").slice(0, 400) || "Đã xảy ra lỗi.";
  }
  return "Lỗi không xác định.";
}

function trimOrUndefined(raw: string | null | undefined): string | undefined {
  const t = raw?.trim();
  return t ? t : undefined;
}

function joinAddress(
  values: Pick<
    CustomerFormValues,
    "addressLine" | "ward" | "district" | "province"
  >,
): string | undefined {
  const parts = [
    values.addressLine?.trim(),
    values.ward?.trim(),
    values.district?.trim(),
    values.province?.trim(),
  ].filter((p): p is string => Boolean(p && p.length > 0));
  return parts.length > 0 ? parts.join(", ") : undefined;
}

const MEMBERSHIP_TIER_VALUES = new Set<string>(
  Object.values(MembershipTierEnum),
);

function parseMembershipTier(
  raw: string | null | undefined,
): MembershipTierEnum | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  return MEMBERSHIP_TIER_VALUES.has(v) ? (v as MembershipTierEnum) : undefined;
}

function buildMembershipCard(
  values: CustomerFormValues,
): CreateMembershipCardInlineBody {
  const cardNumber = values.cardCode?.trim() || generateMembershipCardCode();
  const tier =
    parseMembershipTier(values.cardTier) ?? MembershipTierEnum.SILVER;
  return { cardNumber, tier };
}

/**
 * Common optional-field payload shared between `CreateCustomerBody` and
 * `UpdateCustomerBody`. Both DTOs accept the same superset on the BE side
 * (update is a partial of create — minus the inline `membershipCard`).
 */
type CustomerWriteOptionalFields = Omit<UpdateCustomerBody, "code" | "name">;

/**
 * Copy every populated rich field from the form into a write body. Empty
 * strings are dropped, so a PATCH won't accidentally clobber a value the user
 * left untouched. Anything the user explicitly clears stays untouched until
 * the BE supports explicit nulls (TODO when the spec lands).
 */
function applyOptionalCustomerFields(
  body: CustomerWriteOptionalFields,
  values: CustomerFormValues,
): void {
  const email = trimOrUndefined(values.email);
  if (email) body.email = email;

  const phone = trimOrUndefined(values.phone);
  if (phone) body.phone = phone;

  const address = joinAddress(values);
  if (address) body.address = address;

  const birthDate = trimOrUndefined(values.birthday);
  if (birthDate) body.birthDate = birthDate;

  if (values.gender) body.gender = values.gender;

  const nationalId = trimOrUndefined(values.cccd);
  if (nationalId) body.nationalId = nationalId;

  const groupId = trimOrUndefined(values.customerGroup);
  if (groupId) body.groupId = groupId;

  const assignedStaffId = trimOrUndefined(values.accountManager);
  if (assignedStaffId) body.assignedStaffId = assignedStaffId;

  const note = trimOrUndefined(values.note);
  if (note) body.note = note;

  const companyName = trimOrUndefined(values.companyName);
  if (companyName) body.companyName = companyName;

  const taxCode = trimOrUndefined(values.taxCode);
  if (taxCode) body.taxCode = taxCode;
}

export function buildCreateBody(values: CustomerFormValues): CreateCustomerBody {
  const code = (values.code ?? "").trim();
  if (!code) {
    // Should be impossible because the field is read-only and seeded on open,
    // but guard so we never POST an invalid body.
    throw new Error("Mã khách hàng không được bỏ trống");
  }

  const body: CreateCustomerBody = {
    code,
    name: values.name.trim(),
  };

  applyOptionalCustomerFields(body, values);

  body.membershipCard = buildMembershipCard(values);

  return body;
}

export function buildUpdateBody(values: CustomerFormValues): UpdateCustomerBody {
  const body: UpdateCustomerBody = {
    name: values.name.trim(),
  };

  const code = trimOrUndefined(values.code);
  if (code) body.code = code;

  applyOptionalCustomerFields(body, values);

  return body;
}

/** Seed name/phone from a freeform query when entering create mode. */
export function seedFromQuery(query: string): { name: string; phone: string } {
  const seed = query.trim();
  const digits = phoneDigitsOnly(seed);
  const isPhoneLike = digits.length >= 6 && digits.length >= seed.length - 1;
  return {
    name: isPhoneLike ? "" : seed,
    phone: isPhoneLike ? seed : "",
  };
}
