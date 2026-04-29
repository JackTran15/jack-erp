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

export async function searchCustomers(search: string): Promise<PaginatedCustomers> {
  const params = new URLSearchParams({
    page: "1",
    pageSize: "25",
    search: search.trim(),
  });
  return http.get<PaginatedCustomers>(`/customers?${params.toString()}`);
}

export type CreateCustomerBody = {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
};

export async function createCustomer(body: CreateCustomerBody): Promise<CustomerRow> {
  return http.post<CustomerRow>("/customers", body);
}
