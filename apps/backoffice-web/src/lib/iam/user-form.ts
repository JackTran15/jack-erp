import type {
  CreateUserRequest,
  UpdateUserRequest,
  UserDetail,
  EmployeeProfilePayload,
  EmployeeAddressPayload,
} from "@erp/shared-interfaces";
import { EmployeeAddressType } from "@erp/shared-interfaces";
import type {
  AddressBlock,
  EmployeeFormDraft,
} from "../../pages/employees/employee.types";
import { splitFullName } from "./display";

/** PATCH profile + optional role/branch/password side effects (see useUpdateUser). */
export interface UserUpdatePayload extends UpdateUserRequest {
  roleIds?: string[];
  branchIds?: string[];
  newTemporaryPassword?: string;
}

const blank = (v: string | undefined): string | undefined =>
  v && v.trim() ? v.trim() : undefined;

function addressToPayload(
  type: EmployeeAddressType,
  a: AddressBlock,
): EmployeeAddressPayload {
  return {
    type,
    address: blank(a.address),
    country: blank(a.country),
    province: blank(a.province),
    district: blank(a.district),
    ward: blank(a.ward),
  };
}

/** Maps the full employee form draft into the HR profile payload accepted by /admin/users. */
export function draftToEmployeeProfilePayload(
  draft: EmployeeFormDraft,
): EmployeeProfilePayload {
  const { basic, contact, profile, access } = draft;
  return {
    code: basic.code.trim(),
    mobile: blank(basic.mobile),
    homePhone: blank(contact.homePhone),
    idCardNumber: blank(basic.idCardNumber),
    idCardIssuePlace: blank(basic.idCardIssuePlace),
    idCardIssueDate: blank(basic.idCardIssueDate),
    birthDate: blank(basic.birthDate),
    gender: basic.gender,
    maritalStatus: basic.maritalStatus,
    employmentStatus: basic.employmentStatus,
    photoUrl: blank(basic.photoDataUrl),
    jobPositionId: blank(profile.jobPositionId),
    probationDate: blank(profile.probationDate),
    officialDate: blank(profile.officialDate),
    salary: profile.salary,
    deposit: profile.deposit,
    originalDocumentsNote: blank(profile.originalDocumentsNote),
    accessMode: access.mode,
    addresses: [
      addressToPayload(EmployeeAddressType.PERMANENT, contact.permanentAddress),
      addressToPayload(EmployeeAddressType.CURRENT, contact.currentAddress),
    ],
    emergencyContact: {
      fullName: blank(contact.emergency.fullName),
      relationship: blank(contact.emergency.relationship),
      mobile: blank(contact.emergency.mobile),
      homePhone: blank(contact.emergency.homePhone),
      email: blank(contact.emergency.email),
      address: blank(contact.emergency.address),
    },
    accessSchedule: access.schedule.map((d) => ({
      weekday: d.weekday,
      enabled: d.enabled,
      startTime: d.startTime,
      endTime: d.endTime,
    })),
  };
}

export function draftToCreateUserRequest(
  draft: EmployeeFormDraft,
): CreateUserRequest {
  const { firstName, lastName } = splitFullName(draft.basic.fullName);
  return {
    email: draft.basic.email.trim(),
    firstName,
    lastName,
    isActive: draft.basic.allowSoftwareAccess,
    temporaryPassword: draft.basic.password,
    roleIds: draft.roleIds.length > 0 ? draft.roleIds : undefined,
    branchIds: (draft.branchIds?.length ?? 0) > 0 ? draft.branchIds : undefined,
    profile: draftToEmployeeProfilePayload(draft),
  };
}

export function draftToUserUpdatePayload(
  draft: EmployeeFormDraft,
  previous?: Pick<UserDetail, "roleIds" | "branchIds" | "isActive">,
): UserUpdatePayload {
  const { firstName, lastName } = splitFullName(draft.basic.fullName);
  const payload: UserUpdatePayload = { firstName, lastName };

  const isActive = draft.basic.allowSoftwareAccess;
  if (previous === undefined || previous.isActive !== isActive) {
    payload.isActive = isActive;
  }

  const prevRoleIds = previous?.roleIds ?? [];
  const roleChanged =
    draft.roleIds.length !== prevRoleIds.length ||
    draft.roleIds.some((id) => !prevRoleIds.includes(id));
  if (roleChanged) {
    payload.roleIds = draft.roleIds;
  }

  const prevBranchIds = previous?.branchIds ?? [];
  const branchIds = draft.branchIds ?? [];
  const branchChanged =
    branchIds.length !== prevBranchIds.length ||
    branchIds.some((id) => !prevBranchIds.includes(id));
  if (branchChanged) {
    payload.branchIds = branchIds;
  }

  if (draft.basic.changePassword && draft.basic.password.trim()) {
    payload.newTemporaryPassword = draft.basic.password.trim();
  }

  // Always upsert the HR profile so the contact / profile / access tabs persist.
  payload.profile = draftToEmployeeProfilePayload(draft);

  return payload;
}
