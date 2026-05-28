import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ScopingPolicy, DeletionPolicy, CrudEntityConfig } from '@erp/shared-interfaces';
import { BaseCrudService } from '../../crud/base-crud.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { MembershipCardTypeEntity } from '../membership-card-type.entity';
import { MembershipTier } from '../membership-card.entity';
import { CreateMembershipCardTypeDto } from '../dto/create-membership-card-type.dto';
import { UpdateMembershipCardTypeDto } from '../dto/update-membership-card-type.dto';

export const MEMBERSHIP_CARD_TYPE_SERVICE_TOKEN = 'MembershipCardTypeService';

export const MEMBERSHIP_CARD_TYPE_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'membership-card-types',
  displayName: 'Loại thẻ thành viên',
  apiResource: 'membership-card-types',
  idField: 'id',
  fields: [
    { key: 'name', label: 'Tên loại thẻ', type: 'string', required: true },
    {
      key: 'tier',
      label: 'Hạng thẻ',
      type: 'enum',
      enumValues: Object.values(MembershipTier),
      required: true,
    },
    { key: 'description', label: 'Mô tả', type: 'string' },
    { key: 'sortOrder', label: 'Thứ tự sắp xếp', type: 'number' },
    { key: 'isActive', label: 'Đang hoạt động', type: 'boolean' },
  ],
  searchableFields: ['name'],
  filterDefinitions: [
    {
      key: 'isActive',
      label: 'Trạng thái',
      type: 'select',
      options: [
        { label: 'Đang hoạt động', value: 'true' },
        { label: 'Ngừng hoạt động', value: 'false' },
      ],
    },
  ],
  permissions: {
    create: 'customer.write',
    read: 'customer.read',
    update: 'customer.write',
    delete: 'customer.write',
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.SOFT,
};

@Injectable()
export class MembershipCardTypeService extends BaseCrudService<
  MembershipCardTypeEntity,
  CreateMembershipCardTypeDto,
  UpdateMembershipCardTypeDto
> {
  protected readonly entityConfig = MEMBERSHIP_CARD_TYPE_ENTITY_CONFIG;

  constructor(
    @InjectRepository(MembershipCardTypeEntity)
    protected readonly repository: Repository<MembershipCardTypeEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }

  async listActive(organizationId: string): Promise<MembershipCardTypeEntity[]> {
    return this.repository.find({
      where: { organizationId, isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async listActiveForActor(actor: ActorContext): Promise<MembershipCardTypeEntity[]> {
    return this.listActive(actor.organizationId);
  }
}
