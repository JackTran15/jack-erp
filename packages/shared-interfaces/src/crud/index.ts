export enum ScopingPolicy {
  ORGANIZATION = 'ORGANIZATION',
  BRANCH = 'BRANCH',
  MIXED = 'MIXED',
}

export enum DeletionPolicy {
  SOFT = 'SOFT',
  HARD = 'HARD',
  DISABLED = 'DISABLED',
}

export interface FieldDefinition {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'relation';
  /** Với `type: 'number'`: hiển thị/nhập theo nhóm hàng nghìn (tiền VND). */
  numberFormat?: 'default' | 'money';
  required?: boolean;
  /** When true, value is shown in tables but omitted from create/edit forms. */
  readOnly?: boolean;
  enumValues?: string[];
  relationEntity?: string;
}

export interface FilterDefinition {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date-range' | 'number-range' | 'boolean';
  options?: { label: string; value: string }[];
}

export interface CrudEntityConfig {
  entityKey: string;
  displayName: string;
  apiResource: string;
  idField: string;
  fields: FieldDefinition[];
  searchableFields: string[];
  filterDefinitions: FilterDefinition[];
  permissions: {
    create: string;
    read: string;
    update: string;
    delete: string;
  };
  scopingPolicy: ScopingPolicy;
  deletionPolicy: DeletionPolicy;
  cascadePolicy?: 'CASCADE' | 'RESTRICT' | 'SET_NULL';
  cascadeTargets?: string[];
}
