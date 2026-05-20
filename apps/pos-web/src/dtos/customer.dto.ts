import type {
  CustomerGenderEnum,
  MembershipTierEnum,
} from "@erp/pos/types/customer.type";
import type { CustomerRow } from "@erp/pos/interfaces/customer.interface";

export interface PaginatedCustomers {
  data: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateMembershipCardInlineBody {
  cardNumber: string;
  tier?: MembershipTierEnum;
}

export interface CreateCustomerBody {
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
}

// TODO: extend once BE `UpdateCustomerDto` accepts the richer fields
// (gender, birthDate, nationalId, groupId, assignedStaffId, note,
// companyName, taxCode, membershipCard).
/**
 * Body for `PATCH /customers/:id`. Mirrors `UpdateCustomerDto` on the API,
 * which is a partial of `CreateCustomerDto` (minus the `membershipCard` inline
 * create — cards live behind their own endpoints).
 */
export interface UpdateCustomerBody {
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
}
