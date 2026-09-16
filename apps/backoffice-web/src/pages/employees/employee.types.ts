import type { RoleSummary } from "@erp/shared-interfaces";
import {
  EmployeeGender as GenderEnum,
  EmploymentStatus as EmploymentStatusEnum,
  MaritalStatus as MaritalStatusEnum,
  EmployeeAccessMode as AccessModeEnum,
  Weekday as WeekdayEnum,
} from "@erp/shared-interfaces";
import type { InitialMediaItem } from "../../lib/media/useMediaUpload";

// Re-export the IAM/HR enums under the names the employee UI components already use,
// so the form draft stays in sync with the API contract (CreateUserRequest.profile).
export {
  GenderEnum,
  EmploymentStatusEnum,
  MaritalStatusEnum,
  AccessModeEnum,
  WeekdayEnum,
};

export interface AccessScheduleDay {
  weekday: WeekdayEnum;
  enabled: boolean;
  startTime: string;
  endTime: string;
}

export interface EmployeeAccess {
  mode: AccessModeEnum;
  schedule: AccessScheduleDay[];
}

/** Role row in employee UI (from IAM RoleSummary). */
export type EmployeeRolePick = Pick<RoleSummary, "id" | "name" | "description">;

export interface AddressBlock {
  address: string;
  country: string;
  province: string;
  district: string;
  ward: string;
}

export interface ContactSummary {
  mobile: string;
  homePhone: string;
  email: string;
  address: string;
}

export interface EmergencyContactSummary {
  fullName: string;
  relationship: string;
  mobile: string;
  homePhone: string;
  email: string;
  address: string;
}

export interface EmployeeProfile {
  jobPositionId?: string;
  probationDate?: string;
  officialDate?: string;
  salary: number;
  deposit: number;
  originalDocumentsNote: string;
}

export type EmployeeFormMode = "create" | "edit";

/**
 * Form state for the employee modal.
 * IAM fields map to CreateUserRequest / UpdateUserRequest; HR tabs are UI-only (readonly).
 */
export interface EmployeeFormDraft {
  basic: {
    code: string;
    email: string;
    mobile: string;
    fullName: string;
    allowSoftwareAccess: boolean;
    /** Only used when editing: show the password change form. */
    changePassword: boolean;
    password: string;
    confirmPassword: string;
    idCardNumber: string;
    idCardIssuePlace: string;
    maritalStatus: MaritalStatusEnum;
    /** Existing profile photo as loaded from the server; undefined when there is none. Feeds useMediaUpload's `initial` seed, never sent to the API directly. */
    currentPhoto?: InitialMediaItem;
    /**
     * Pending photo change: a new upload's media id, `null` to remove the
     * current photo, `undefined` to leave it untouched. Must stay `undefined`
     * unless the user explicitly picks or removes a photo this session — see
     * the delete trap noted in draftToEmployeeProfilePayload.
     */
    photoMediaId?: string | null;
    employmentStatus: EmploymentStatusEnum;
    idCardIssueDate?: string;
    birthDate?: string;
    gender: GenderEnum;
  };
  roleIds: string[];
  branchIds?: string[];
  contact: {
    homePhone: string;
    permanentAddress: AddressBlock;
    currentAddress: AddressBlock;
    emergency: EmergencyContactSummary;
  };
  profile: EmployeeProfile;
  access: EmployeeAccess;
}

export enum EmployeeRoleCategoryEnum {
  SALES = "SALES",
  MANAGEMENT = "MANAGEMENT",
}

export interface MockRole {
  id: string;
  name: string;
  description: string;
  quickPick?: boolean;
  category?: EmployeeRoleCategoryEnum;
}

export interface MockJobPosition {
  id: string;
  name: string;
}
