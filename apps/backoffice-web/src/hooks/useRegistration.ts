import { useCallback } from "react";
import { http } from "../lib/http";

export enum RegistrationStatus {
  PENDING_APPROVAL = "PENDING_APPROVAL",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  RESUBMITTED = "RESUBMITTED",
}

export enum RegistrationType {
  ORGANIZATION = "ORGANIZATION",
  BRANCH = "BRANCH",
}

export interface RegistrationRequestRecord {
  id: string;
  type: RegistrationType;
  requestData: Record<string, unknown>;
  status: RegistrationStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface PaginatedRegistrations {
  data: RegistrationRequestRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SubmitOrgRegistrationData {
  organizationName: string;
  contactEmail: string;
  contactPhone?: string;
  ownerName: string;
  ownerEmail: string;
}

export interface SubmitBranchRegistrationData {
  branchName: string;
  address?: string;
  phone?: string;
  email?: string;
  parentBranchId?: string;
}

export interface RegistrationFilters {
  type?: "org" | "branch";
  status?: RegistrationStatus;
  page?: number;
  pageSize?: number;
}

function buildQuery(filters: RegistrationFilters): string {
  const qs = new URLSearchParams();
  qs.set("page", String(filters.page ?? 1));
  qs.set("pageSize", String(filters.pageSize ?? 20));
  if (filters.status) qs.set("status", filters.status);
  return qs.toString();
}

export function useRegistration() {
  const submitOrgRegistration = useCallback(
    (data: SubmitOrgRegistrationData) =>
      http.post<RegistrationRequestRecord>(
        "/organizations/registration-requests",
        data,
      ),
    [],
  );

  const submitBranchRegistration = useCallback(
    (data: SubmitBranchRegistrationData) =>
      http.post<RegistrationRequestRecord>(
        "/branches/registration-requests",
        data,
      ),
    [],
  );

  const listRegistrations = useCallback(
    async (filters: RegistrationFilters = {}) => {
      const q = buildQuery(filters);

      if (filters.type === "org") {
        return http.get<PaginatedRegistrations>(
          `/organizations/registration-requests?${q}`,
        );
      }
      if (filters.type === "branch") {
        return http.get<PaginatedRegistrations>(
          `/branches/registration-requests?${q}`,
        );
      }

      const [orgs, branches] = await Promise.all([
        http.get<PaginatedRegistrations>(
          `/organizations/registration-requests?${q}`,
        ),
        http.get<PaginatedRegistrations>(
          `/branches/registration-requests?${q}`,
        ),
      ]);

      return {
        data: [...orgs.data, ...branches.data].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
        total: orgs.total + branches.total,
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 20,
      } satisfies PaginatedRegistrations;
    },
    [],
  );

  const getRegistration = useCallback(
    async (
      id: string,
      type: RegistrationType,
    ): Promise<RegistrationRequestRecord> => {
      const prefix =
        type === RegistrationType.ORGANIZATION ? "organizations" : "branches";
      const list = await http.get<PaginatedRegistrations>(
        `/${prefix}/registration-requests?page=1&pageSize=100`,
      );
      const found = list.data.find((r) => r.id === id);
      if (!found) throw new Error("Registration request not found");
      return found;
    },
    [],
  );

  const approveRegistration = useCallback(
    (id: string, type: RegistrationType) => {
      const prefix =
        type === RegistrationType.ORGANIZATION ? "organizations" : "branches";
      return http.post<RegistrationRequestRecord>(
        `/${prefix}/registration-requests/${id}/approve`,
      );
    },
    [],
  );

  const rejectRegistration = useCallback(
    (id: string, reason: string, type: RegistrationType) => {
      const prefix =
        type === RegistrationType.ORGANIZATION ? "organizations" : "branches";
      return http.post<RegistrationRequestRecord>(
        `/${prefix}/registration-requests/${id}/reject`,
        { reason },
      );
    },
    [],
  );

  return {
    submitOrgRegistration,
    submitBranchRegistration,
    listRegistrations,
    getRegistration,
    approveRegistration,
    rejectRegistration,
  };
}
