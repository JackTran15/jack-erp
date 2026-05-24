import type { CustomerGenderEnum } from "@erp/pos/types/customer.type";

/** Bản ghi khách từ GET /customers (camelCase). */
export interface CustomerRow {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
}

/**
 * Full customer record returned by `GET /customers/:id`.
 *
 * Mirrors `CustomerEntity` on the API. Optional / nullable fields stay that
 * way here — callers should treat missing values as "Chưa có thông tin".
 */
export interface CustomerDetail {
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
}
