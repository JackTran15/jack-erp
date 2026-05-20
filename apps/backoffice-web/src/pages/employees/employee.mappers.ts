import type { RoleSummary, UserDetail } from "@erp/shared-interfaces";
import { joinFullName, userDisplayCode } from "../../lib/iam";
import { employmentStatusFromActive } from "./employee-status";
import {
  createDefaultEmployeeAccess,
  normalizeEmployeeAccess,
} from "./employee-access";
import {
  EmploymentStatusEnum,
  GenderEnum,
  MaritalStatusEnum,
  type AddressBlock,
  type EmployeeFormDraft,
  type EmployeeRolePick,
} from "./employee.types";

const emptyAddress = (): AddressBlock => ({
  address: "",
  country: "Việt Nam",
  province: "",
  district: "",
  ward: "",
});

export function createEmptyDraft(): EmployeeFormDraft {
  return {
    basic: {
      code: "",
      email: "",
      mobile: "",
      fullName: "",
      allowSoftwareAccess: true,
      password: "",
      confirmPassword: "",
      idCardNumber: "",
      idCardIssuePlace: "",
      maritalStatus: MaritalStatusEnum.SINGLE,
      employmentStatus: EmploymentStatusEnum.OFFICIAL,
      gender: GenderEnum.MALE,
    },
    roleIds: [],
    branchIds: [],
    contact: {
      homePhone: "",
      permanentAddress: emptyAddress(),
      currentAddress: emptyAddress(),
      emergency: {
        fullName: "",
        relationship: "",
        mobile: "",
        homePhone: "",
        email: "",
        address: "",
      },
    },
    profile: {
      salary: 0,
      deposit: 0,
      originalDocumentsNote: "",
    },
    access: createDefaultEmployeeAccess(),
  };
}

export function userDetailToEmployeeDraft(
  detail: UserDetail,
): EmployeeFormDraft {
  return {
    basic: {
      code: userDisplayCode(detail),
      email: detail.email,
      mobile: "",
      fullName: joinFullName(detail.firstName, detail.lastName),
      allowSoftwareAccess: detail.isActive,
      password: "",
      confirmPassword: "",
      idCardNumber: "",
      idCardIssuePlace: "",
      maritalStatus: MaritalStatusEnum.SINGLE,
      employmentStatus: employmentStatusFromActive(detail.isActive),
      gender: GenderEnum.MALE,
    },
    roleIds: [...detail.roleIds],
    branchIds: [...detail.branchIds],
    contact: {
      homePhone: "",
      permanentAddress: emptyAddress(),
      currentAddress: emptyAddress(),
      emergency: {
        fullName: "",
        relationship: "",
        mobile: "",
        homePhone: "",
        email: "",
        address: "",
      },
    },
    profile: {
      salary: 0,
      deposit: 0,
      originalDocumentsNote: "",
    },
    access: createDefaultEmployeeAccess(),
  };
}

export function resolveUserRoles(
  roleIds: string[],
  roles: RoleSummary[],
): EmployeeRolePick[] {
  const byId = new Map(roles.map((r) => [r.id, r]));
  return roleIds
    .map((id) => byId.get(id))
    .filter((r): r is RoleSummary => Boolean(r))
    .map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
    }));
}

export {
  formatIamDate as formatEmployeeDate,
  formatIamDateTime as formatEmployeeDateTime,
} from "../../lib/iam";

const GENDER_LABELS: Record<GenderEnum, string> = {
  [GenderEnum.MALE]: "Nam",
  [GenderEnum.FEMALE]: "Nữ",
};

const EMPLOYMENT_LABELS: Record<EmploymentStatusEnum, string> = {
  [EmploymentStatusEnum.OFFICIAL]: "Đang hoạt động",
  [EmploymentStatusEnum.PROBATION]: "Đang hoạt động",
  [EmploymentStatusEnum.RESIGNED]: "Ngừng hoạt động",
};

export function formatGender(gender: GenderEnum): string {
  return GENDER_LABELS[gender];
}

export function formatEmploymentStatus(status: EmploymentStatusEnum): string {
  return EMPLOYMENT_LABELS[status];
}

export { formatAccountStatus } from "../../lib/iam";

export const GENDER_FILTER_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: GenderEnum.MALE, label: GENDER_LABELS[GenderEnum.MALE] },
  { value: GenderEnum.FEMALE, label: GENDER_LABELS[GenderEnum.FEMALE] },
];

export const EMPLOYMENT_FILTER_OPTIONS = [
  { value: "", label: "Tất cả" },
  {
    value: EmploymentStatusEnum.OFFICIAL,
    label: "Đang hoạt động",
  },
  {
    value: EmploymentStatusEnum.RESIGNED,
    label: "Ngừng hoạt động",
  },
];

// Re-export for HR form tabs that still normalize access blocks
export { normalizeEmployeeAccess };
