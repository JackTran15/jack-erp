import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { BaseCrudService } from '../../crud/base-crud.service';
import { JobPositionEntity } from './job-position.entity';

export const JOB_POSITION_SERVICE_TOKEN = 'JobPositionCrudService';

@Injectable()
export class JobPositionCrudService extends BaseCrudService<
  JobPositionEntity,
  Record<string, any>,
  Record<string, any>
> {
  protected readonly entityConfig: CrudEntityConfig = JOB_POSITION_ENTITY_CONFIG;

  constructor(
    @InjectRepository(JobPositionEntity)
    protected readonly repository: Repository<JobPositionEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }
}

export const JOB_POSITION_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'job-positions',
  displayName: 'Vị trí công việc',
  apiResource: 'admin/entities/job-positions',
  idField: 'id',
  fields: [
    { key: 'name', label: 'Tên vị trí', type: 'string', required: true },
    { key: 'code', label: 'Mã', type: 'string' },
    { key: 'description', label: 'Mô tả', type: 'string' },
    { key: 'isActive', label: 'Đang hoạt động', type: 'boolean' },
    { key: 'createdAt', label: 'Ngày tạo', type: 'date', readOnly: true },
  ],
  searchableFields: ['name', 'code'],
  filterDefinitions: [
    {
      key: 'isActive',
      label: 'Đang hoạt động',
      type: 'select',
      options: [
        { label: 'Có', value: 'true' },
        { label: 'Không', value: 'false' },
      ],
    },
  ],
  permissions: {
    create: 'iam.user.write',
    read: 'iam.user.read',
    update: 'iam.user.write',
    delete: 'iam.user.write',
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.SOFT,
};
