import {
  EmployeeAddressType,
  type EmployeeAddressView,
  type EmployeeProfileView,
  type RoleSummary,
  type UserDetail,
} from "@erp/shared-interfaces";
import { joinFullName, userDisplayCode } from "../../lib/iam";
import { employmentStatusFromActive } from "./employee-status";
import {
  createDefaultAccessSchedule,
  createDefaultEmployeeAccess,
  normalizeEmployeeAccess,
} from "./employee-access";
import {
  AccessModeEnum,
  EmploymentStatusEnum,
  GenderEnum,
  MaritalStatusEnum,
  type AddressBlock,
  type EmployeeAccess,
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

function addressViewToBlock(a: EmployeeAddressView | undefined): AddressBlock {
  return {
    address: a?.address ?? "",
    country: a?.country ?? "Việt Nam",
    province: a?.province ?? "",
    district: a?.district ?? "",
    ward: a?.ward ?? "",
  };
}

function profileViewToAccess(profile: EmployeeProfileView): EmployeeAccess {
  const byDay = new Map(
    (profile.accessSchedule ?? []).map((s) => [s.weekday, s]),
  );
  const schedule = createDefaultAccessSchedule().map((day) => {
    const found = byDay.get(day.weekday);
    return found
      ? {
          weekday: day.weekday,
          enabled: found.enabled,
          startTime: found.startTime,
          endTime: found.endTime,
        }
      : day;
  });
  return {
    mode: profile.accessMode ?? AccessModeEnum.FREE,
    schedule,
  };
}

export function userDetailToEmployeeDraft(
  detail: UserDetail,
): EmployeeFormDraft {
  const profile = detail.profile ?? null;
  const permanent = profile?.addresses?.find(
    (a) => a.type === EmployeeAddressType.PERMANENT,
  );
  const current = profile?.addresses?.find(
    (a) => a.type === EmployeeAddressType.CURRENT,
  );
  const ec = profile?.emergencyContact ?? null;

  return {
    basic: {
      code: profile?.code ?? userDisplayCode(detail),
      email: detail.email,
      mobile: profile?.mobile ?? "",
      fullName: joinFullName(detail.firstName, detail.lastName),
      allowSoftwareAccess: detail.isActive,
      password: "",
      confirmPassword: "",
      idCardNumber: profile?.idCardNumber ?? "",
      idCardIssuePlace: profile?.idCardIssuePlace ?? "",
      idCardIssueDate: profile?.idCardIssueDate ?? undefined,
      maritalStatus: profile?.maritalStatus ?? MaritalStatusEnum.SINGLE,
      photoDataUrl: profile?.photoUrl ?? undefined,
      employmentStatus:
        profile?.employmentStatus ?? employmentStatusFromActive(detail.isActive),
      birthDate: profile?.birthDate ?? undefined,
      gender: profile?.gender ?? GenderEnum.MALE,
    },
    roleIds: [...detail.roleIds],
    branchIds: [...detail.branchIds],
    contact: {
      homePhone: profile?.homePhone ?? "",
      permanentAddress: addressViewToBlock(permanent),
      currentAddress: addressViewToBlock(current),
      emergency: {
        fullName: ec?.fullName ?? "",
        relationship: ec?.relationship ?? "",
        mobile: ec?.mobile ?? "",
        homePhone: ec?.homePhone ?? "",
        email: ec?.email ?? "",
        address: ec?.address ?? "",
      },
    },
    profile: {
      jobPositionId: profile?.jobPositionId ?? undefined,
      probationDate: profile?.probationDate ?? undefined,
      officialDate: profile?.officialDate ?? undefined,
      salary: profile?.salary ?? 0,
      deposit: profile?.deposit ?? 0,
      originalDocumentsNote: profile?.originalDocumentsNote ?? "",
    },
    access: profile ? profileViewToAccess(profile) : createDefaultEmployeeAccess(),
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
