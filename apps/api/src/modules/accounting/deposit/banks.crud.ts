import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  ScopingPolicy,
  DeletionPolicy,
  CrudEntityConfig,
} from '@erp/shared-interfaces';
import { BaseCrudService } from '../../crud/base-crud.service';
import { BankEntity } from './bank.entity';
import { CreateBankDto, UpdateBankDto } from './dto/bank.dto';

export const BANK_SERVICE_TOKEN = 'BankService';

@Injectable()
export class BanksCrudService extends BaseCrudService<
  BankEntity,
  CreateBankDto,
  UpdateBankDto
> {
  protected readonly entityConfig: CrudEntityConfig = BANK_ENTITY_CONFIG;

  constructor(
    @InjectRepository(BankEntity)
    protected readonly repository: Repository<BankEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }
}

export const BANK_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'banks',
  displayName: 'Ngân hàng',
  apiResource: 'banks',
  idField: 'id',
  fields: [
    { key: 'code', label: 'Mã', type: 'string', required: true },
    { key: 'name', label: 'Tên ngân hàng', type: 'string', required: true },
    { key: 'shortName', label: 'Tên viết tắt', type: 'string' },
    { key: 'isActive', label: 'Hoạt động', type: 'boolean' },
  ],
  searchableFields: ['code', 'name', 'shortName'],
  filterDefinitions: [{ key: 'isActive', label: 'Hoạt động', type: 'boolean' }],
  permissions: {
    create: 'accounting.bank.create',
    read: 'accounting.bank.read',
    update: 'accounting.bank.update',
    delete: 'accounting.bank.delete',
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.SOFT,
};
