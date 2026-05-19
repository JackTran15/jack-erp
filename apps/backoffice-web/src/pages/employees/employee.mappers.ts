import { MOCK_ROLES } from "./employees.mock";
import {
  createDefaultEmployeeAccess,
  normalizeEmployeeAccess,
} from "./employee-access";
import {
  EmploymentStatusEnum,
  GenderEnum,
  MaritalStatusEnum,
  type AddressBlock,
  type Employee,
  type EmployeeFormDraft,
} from "./employee.types";

const emptyAddress = (): AddressBlock => ({
  address: "",
  country: "Việt Nam",
  province: "",
  district: "",
  ward: "",
});

export function createEmptyDraft(suggestedCode: string): EmployeeFormDraft {
  return {
    basic: {
      code: suggestedCode,
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

export function suggestNextEmployeeCode(employees: Employee[]): string {
  let max = 0;
  for (const e of employees) {
    const m = e.code.match(/(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `NV${String(max + 1).padStart(6, "0")}`;
}

export function employeeToDraft(employee: Employee): EmployeeFormDraft {
  return {
    basic: {
      code: employee.code,
      email: employee.email ?? employee.contact.email,
      mobile: employee.phone,
      fullName: employee.fullName,
      allowSoftwareAccess: employee.allowSoftwareAccess,
      password: "",
      confirmPassword: "",
      idCardNumber: employee.basicExtra?.idCardNumber ?? "",
      idCardIssuePlace: employee.basicExtra?.idCardIssuePlace ?? "",
      maritalStatus:
        employee.basicExtra?.maritalStatus ?? MaritalStatusEnum.SINGLE,
      photoDataUrl: employee.basicExtra?.photoDataUrl,
      employmentStatus: employee.employmentStatus,
      idCardIssueDate: employee.basicExtra?.idCardIssueDate,
      birthDate: employee.birthDate,
      gender: employee.gender,
    },
    roleIds: employee.roles.map((r) => r.id),
    contact: {
      homePhone:
        employee.contactDetail?.homePhone ?? employee.contact.homePhone,
      permanentAddress: employee.contactDetail?.permanentAddress ?? {
        ...emptyAddress(),
        address: employee.contact.address,
      },
      currentAddress: employee.contactDetail?.currentAddress ?? emptyAddress(),
      emergency: { ...employee.emergencyContact },
    },
    profile: { ...employee.profile },
    access: normalizeEmployeeAccess(employee.access),
  };
}

export function draftToEmployee(
  draft: EmployeeFormDraft,
  existingId?: string,
): Employee {
  const roles = MOCK_ROLES.filter((r) => draft.roleIds.includes(r.id)).map(
    (r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
    }),
  );

  const permanent = draft.contact.permanentAddress;
  const addressLine = [
    permanent.address,
    permanent.ward,
    permanent.district,
    permanent.province,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    id: existingId ?? `emp-${crypto.randomUUID()}`,
    code: draft.basic.code.trim(),
    fullName: draft.basic.fullName.trim(),
    gender: draft.basic.gender,
    birthDate: draft.basic.birthDate,
    phone: draft.basic.mobile.trim(),
    email: draft.basic.email.trim() || undefined,
    employmentStatus: draft.basic.employmentStatus,
    allowSoftwareAccess: draft.basic.allowSoftwareAccess,
    roles,
    contact: {
      mobile: draft.basic.mobile.trim(),
      homePhone: draft.contact.homePhone.trim(),
      email: draft.basic.email.trim(),
      address: addressLine,
    },
    emergencyContact: { ...draft.contact.emergency },
    profile: { ...draft.profile },
    access: normalizeEmployeeAccess(draft.access),
    basicExtra: {
      idCardNumber: draft.basic.idCardNumber || undefined,
      idCardIssuePlace: draft.basic.idCardIssuePlace || undefined,
      idCardIssueDate: draft.basic.idCardIssueDate,
      maritalStatus: draft.basic.maritalStatus,
      photoDataUrl: draft.basic.photoDataUrl,
    },
    contactDetail: {
      homePhone: draft.contact.homePhone,
      permanentAddress: { ...draft.contact.permanentAddress },
      currentAddress: { ...draft.contact.currentAddress },
    },
  };
}

export function formatEmployeeDate(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN").format(d);
}

const GENDER_LABELS: Record<GenderEnum, string> = {
  [GenderEnum.MALE]: "Nam",
  [GenderEnum.FEMALE]: "Nữ",
};

const EMPLOYMENT_LABELS: Record<EmploymentStatusEnum, string> = {
  [EmploymentStatusEnum.OFFICIAL]: "Chính thức",
  [EmploymentStatusEnum.PROBATION]: "Thử việc",
  [EmploymentStatusEnum.RESIGNED]: "Đã nghỉ việc",
};

export function formatGender(gender: GenderEnum): string {
  return GENDER_LABELS[gender];
}

export function formatEmploymentStatus(status: EmploymentStatusEnum): string {
  return EMPLOYMENT_LABELS[status];
}

export const GENDER_FILTER_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: GenderEnum.MALE, label: GENDER_LABELS[GenderEnum.MALE] },
  { value: GenderEnum.FEMALE, label: GENDER_LABELS[GenderEnum.FEMALE] },
];

export const EMPLOYMENT_FILTER_OPTIONS = [
  { value: "", label: "Tất cả" },
  {
    value: EmploymentStatusEnum.OFFICIAL,
    label: EMPLOYMENT_LABELS[EmploymentStatusEnum.OFFICIAL],
  },
  {
    value: EmploymentStatusEnum.PROBATION,
    label: EMPLOYMENT_LABELS[EmploymentStatusEnum.PROBATION],
  },
  {
    value: EmploymentStatusEnum.RESIGNED,
    label: EMPLOYMENT_LABELS[EmploymentStatusEnum.RESIGNED],
  },
];
