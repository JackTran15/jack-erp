import type { BranchStatus } from "@erp/shared-interfaces";

export interface BranchRow {
  id: string;
  name: string;
  code?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  status: BranchStatus;
  isMainBranch: boolean;
}

/** The column shows Vietnamese; the wire keeps the English enum (CLAUDE.md). */
export const BRANCH_STATUS_VI: Record<string, string> = {
  ACTIVE: "Đang hoạt động",
  SUSPENDED: "Ngừng hoạt động",
  ARCHIVED: "Đã lưu trữ",
};
