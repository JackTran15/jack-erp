export * from './import-excel';

export enum CustomerStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  MERGED = 'MERGED',
}

export interface Customer {
  id: string;
  organizationId: string;
  branchId?: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  status: CustomerStatus;
  mergedIntoId?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface CreateCustomerDto {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface UpdateCustomerDto {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  status?: CustomerStatus;
}

export interface MergeCustomerDto {
  sourceCustomerIds: string[];
  targetCustomerId: string;
}
