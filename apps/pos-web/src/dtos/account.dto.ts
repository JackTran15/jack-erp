export interface AccountRow {
  id: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  parentAccountId?: string | null;
  isActive: boolean;
}

export interface ListAccountsParams {
  page?: number;
  pageSize?: number;
  filters?: Record<string, unknown>;
}
