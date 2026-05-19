export enum GenderEnum {
  MALE = "MALE",
  FEMALE = "FEMALE",
}

export enum EmploymentStatusEnum {
  OFFICIAL = "OFFICIAL",
  PROBATION = "PROBATION",
  RESIGNED = "RESIGNED",
}

export enum MaritalStatusEnum {
  SINGLE = "SINGLE",
  MARRIED = "MARRIED",
}

export enum AccessModeEnum {
  FREE = "FREE",
  SCHEDULED = "SCHEDULED",
}

export enum WeekdayEnum {
  MONDAY = "MONDAY",
  TUESDAY = "TUESDAY",
  WEDNESDAY = "WEDNESDAY",
  THURSDAY = "THURSDAY",
  FRIDAY = "FRIDAY",
  SATURDAY = "SATURDAY",
  SUNDAY = "SUNDAY",
}

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

export interface EmployeeRole {
  id: string;
  name: string;
  description: string;
}

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

export interface Employee {
  id: string;
  code: string;
  fullName: string;
  gender: GenderEnum;
  birthDate?: string;
  phone: string;
  email?: string;
  employmentStatus: EmploymentStatusEnum;
  allowSoftwareAccess: boolean;
  roles: EmployeeRole[];
  contact: ContactSummary;
  emergencyContact: EmergencyContactSummary;
  profile: EmployeeProfile;
  access: EmployeeAccess;
  basicExtra?: {
    idCardNumber?: string;
    idCardIssuePlace?: string;
    idCardIssueDate?: string;
    maritalStatus?: MaritalStatusEnum;
    photoDataUrl?: string;
  };
  contactDetail?: {
    homePhone: string;
    permanentAddress: AddressBlock;
    currentAddress: AddressBlock;
  };
}

export interface EmployeeFormDraft {
  basic: {
    code: string;
    email: string;
    mobile: string;
    fullName: string;
    allowSoftwareAccess: boolean;
    password: string;
    confirmPassword: string;
    idCardNumber: string;
    idCardIssuePlace: string;
    maritalStatus: MaritalStatusEnum;
    photoDataUrl?: string;
    employmentStatus: EmploymentStatusEnum;
    idCardIssueDate?: string;
    birthDate?: string;
    gender: GenderEnum;
  };
  roleIds: string[];
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
