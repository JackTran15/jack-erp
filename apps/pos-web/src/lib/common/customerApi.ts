import { http } from "./http";

/** Chuẩn hóa số điện thoại: chỉ giữ chữ số. */
export function phoneDigitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** So khớp lỏng hai số (0xxxx / +84 / khoảng trắng). */
export function phoneNumbersMatch(
  a: string | null | undefined,
  b: string,
): boolean {
  const da = phoneDigitsOnly(a ?? "");
  const db = phoneDigitsOnly(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const tailA = da.length >= 9 ? da.slice(-9) : da;
  const tailB = db.length >= 9 ? db.slice(-9) : db;
  return tailA === tailB && tailA.length >= 9;
}

/** Bản ghi khách từ GET /customers (camelCase). */
export type CustomerRow = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
};

export type PaginatedCustomers = {
  data: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
};

export function formatCustomerDisplay(c: Pick<CustomerRow, "name">): string {
  return c.name?.trim() || "Khách";
}

export async function searchCustomers(
  search: string,
): Promise<PaginatedCustomers> {
  const params = new URLSearchParams({
    page: "1",
    pageSize: "25",
    search: search.trim(),
  });
  return http.get<PaginatedCustomers>(`/customers?${params.toString()}`);
}

export enum CustomerGenderEnum {
  MALE = "male",
  FEMALE = "female",
  UNSPECIFIED = "unspecified",
}

export enum MembershipTierEnum {
  NONE = "none",
  SILVER = "silver",
  GOLD = "gold",
  DIAMOND = "diamond",
}

export type CreateMembershipCardInlineBody = {
  cardNumber: string;
  tier?: MembershipTierEnum;
};

export type CreateCustomerBody = {
  code: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  birthDate?: string;
  gender?: CustomerGenderEnum;
  nationalId?: string;
  groupId?: string;
  assignedStaffId?: string;
  note?: string;
  companyName?: string;
  taxCode?: string;
  membershipCard?: CreateMembershipCardInlineBody;
};

export async function createCustomer(
  body: CreateCustomerBody,
): Promise<CustomerRow> {
  return http.post<CustomerRow>("/customers", body);
}

/**
 * Full customer record returned by `GET /customers/:id`.
 *
 * Mirrors `CustomerEntity` on the API. Optional / nullable fields stay that
 * way here — callers should treat missing values as "Chưa có thông tin".
 */
export type CustomerDetail = {
  id: string;
  code: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  birthDate?: string | null;
  gender?: CustomerGenderEnum | null;
  nationalId?: string | null;
  groupId?: string | null;
  assignedStaffId?: string | null;
  note?: string | null;
  companyName?: string | null;
  taxCode?: string | null;
  status?: string | null;
  mergedIntoId?: string | null;
  organizationId?: string;
  branchId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function getCustomer(id: string): Promise<CustomerDetail> {
  return http.get<CustomerDetail>(`/customers/${encodeURIComponent(id)}`);
}

// TODO: extend once BE `UpdateCustomerDto` accepts the richer fields
// (gender, birthDate, nationalId, groupId, assignedStaffId, note,
// companyName, taxCode, membershipCard).
/**
 * Body for `PATCH /customers/:id`. Mirrors `UpdateCustomerDto` on the API,
 * which is a partial of `CreateCustomerDto` (minus the `membershipCard` inline
 * create — cards live behind their own endpoints).
 */
export type UpdateCustomerBody = {
  code?: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  birthDate?: string;
  gender?: CustomerGenderEnum;
  nationalId?: string;
  groupId?: string;
  assignedStaffId?: string;
  note?: string;
  companyName?: string;
  taxCode?: string;
};

export async function updateCustomer(
  id: string,
  body: UpdateCustomerBody,
): Promise<CustomerRow> {
  return http.patch<CustomerRow>(`/customers/${encodeURIComponent(id)}`, body);
}

/** Generate a client-side customer code in the shape `KH######`. */
export function generateCustomerCode(): string {
  const seq = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  return `KH${seq}`;
}

// -----------------------------------------------------------------------------
// Customer groups
// -----------------------------------------------------------------------------

export type CustomerGroupRow = {
  id: string;
  name: string;
  description?: string | null;
};

export type CreateCustomerGroupBody = {
  name: string;
  description?: string;
};

export async function listCustomerGroups(): Promise<CustomerGroupRow[]> {
  return http.get<CustomerGroupRow[]>("/customers/groups");
}

export async function createCustomerGroup(
  body: CreateCustomerGroupBody,
): Promise<CustomerGroupRow> {
  return http.post<CustomerGroupRow>("/customers/groups", body);
}
