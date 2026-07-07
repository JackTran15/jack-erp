export enum RegistrationStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  RESUBMITTED = 'RESUBMITTED',
}

export enum BranchStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  ARCHIVED = 'ARCHIVED',
}

export interface Organization {
  id: string;
  name: string;
  registrationStatus: RegistrationStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  /** Store code unique per organization — printed on barcode labels. */
  code?: string;
  address?: string;
  status: BranchStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface RegistrationRequest {
  organizationName: string;
  ownerEmail: string;
  ownerName: string;
  ownerPassword: string;
}
