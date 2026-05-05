export interface Product {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  isActive: boolean;
  defaultProviderId?: string;
  autoMigrated: boolean;
  createdAt: string;
  updatedAt: string;
}
