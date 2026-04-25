import { useCallback } from "react";
import { erpApi, requireErpData } from "../lib/erp-api";

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

function listQuery(
  filters: RegistrationFilters,
): { page: number; pageSize: number; status?: RegistrationStatus } {
  return {
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 20,
    ...(filters.status ? { status: filters.status } : {}),
  };
}

export function useRegistration() {
  const submitOrgRegistration = useCallback(
    async (data: SubmitOrgRegistrationData) =>
      requireErpData(
        await erpApi.POST<RegistrationRequestRecord>(
          "/organizations/registration-requests",
          { body: data },
        ),
      ),
    [],
  );

  const submitBranchRegistration = useCallback(
    async (data: SubmitBranchRegistrationData) =>
      requireErpData(
        await erpApi.POST<RegistrationRequestRecord>(
          "/branches/registration-requests",
          { body: data },
        ),
      ),
    [],
  );

  const listRegistrations = useCallback(
    async (filters: RegistrationFilters = {}) => {
      const q = listQuery(filters);

      if (filters.type === "org") {
        return requireErpData(
          await erpApi.GET<PaginatedRegistrations>(
            "/organizations/registration-requests",
            { params: { query: q } },
          ),
        );
      }
      if (filters.type === "branch") {
        return requireErpData(
          await erpApi.GET<PaginatedRegistrations>(
            "/branches/registration-requests",
            { params: { query: q } },
          ),
        );
      }

      const [orgs, branches] = await Promise.all([
        requireErpData(
          await erpApi.GET<PaginatedRegistrations>(
            "/organizations/registration-requests",
            { params: { query: q } },
          ),
        ),
        requireErpData(
          await erpApi.GET<PaginatedRegistrations>(
            "/branches/registration-requests",
            { params: { query: q } },
          ),
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
      const listPath =
        type === RegistrationType.ORGANIZATION
          ? "/organizations/registration-requests"
          : "/branches/registration-requests";
      const list = await requireErpData(
        await erpApi.GET<PaginatedRegistrations>(listPath, {
          params: { query: { page: 1, pageSize: 100 } },
        }),
      );
      const found = list.data.find((r) => r.id === id);
      if (!found) throw new Error("Registration request not found");
      return found;
    },
    [],
  );

  const approveRegistration = useCallback(
    async (id: string, type: RegistrationType) => {
      if (type === RegistrationType.ORGANIZATION) {
        return requireErpData(
          await erpApi.POST<RegistrationRequestRecord>(
            "/organizations/registration-requests/{id}/approve",
            { params: { path: { id } } },
          ),
        );
      }
      return requireErpData(
        await erpApi.POST<RegistrationRequestRecord>(
          "/branches/registration-requests/{id}/approve",
          { params: { path: { id } } },
        ),
      );
    },
    [],
  );

  const rejectRegistration = useCallback(
    async (id: string, reason: string, type: RegistrationType) => {
      if (type === RegistrationType.ORGANIZATION) {
        return requireErpData(
          await erpApi.POST<RegistrationRequestRecord>(
            "/organizations/registration-requests/{id}/reject",
            { params: { path: { id } }, body: { reason } },
          ),
        );
      }
      return requireErpData(
        await erpApi.POST<RegistrationRequestRecord>(
          "/branches/registration-requests/{id}/reject",
          { params: { path: { id } }, body: { reason } },
        ),
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
