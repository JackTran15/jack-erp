import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  AccountType,
  ScopingPolicy,
  DeletionPolicy,
  CrudEntityConfig,
} from '@erp/shared-interfaces';
import { BaseCrudService, CrudOperation } from '../../crud/base-crud.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { AccountEntity } from './account.entity';
import { CreateAccountDto, UpdateAccountDto } from './dto';

export const ACCOUNT_SERVICE_TOKEN = 'AccountService';

@Injectable()
export class CoaService extends BaseCrudService<
  AccountEntity,
  CreateAccountDto,
  UpdateAccountDto
> {
  protected readonly entityConfig: CrudEntityConfig = ACCOUNT_ENTITY_CONFIG;

  constructor(
    @InjectRepository(AccountEntity)
    protected readonly repository: Repository<AccountEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }

  protected override async beforeCreate(
    payload: CreateAccountDto,
    actor: ActorContext,
  ): Promise<CreateAccountDto> {
    if (payload.parentAccountId) {
      await this.validateParentExists(payload.parentAccountId, actor);
    }
    return payload;
  }

  protected override async beforeUpdate(
    id: string,
    payload: UpdateAccountDto,
    actor: ActorContext,
  ): Promise<UpdateAccountDto> {
    if (payload.parentAccountId) {
      if (payload.parentAccountId === id) {
        throw new BadRequestException('An account cannot be its own parent');
      }
      await this.validateParentExists(payload.parentAccountId, actor);
    }

    if (payload.isActive === false) {
      await this.guardDeactivation(id);
    }

    return payload;
  }

  /**
   * Check whether an account has any POSTED journal line references.
   * Used by the journal module to guard account deactivation.
   */
  async hasPostedReferences(accountId: string): Promise<boolean> {
    const result = await this.dataSource.query(
      `SELECT 1 FROM journal_lines WHERE account_id = $1 LIMIT 1`,
      [accountId],
    );
    return result.length > 0;
  }

  private async validateParentExists(
    parentAccountId: string,
    actor: ActorContext,
  ): Promise<void> {
    const parent = await this.repository.findOne({
      where: {
        id: parentAccountId,
        organizationId: actor.organizationId,
      },
    });
    if (!parent) {
      throw new BadRequestException(
        `Parent account ${parentAccountId} not found`,
      );
    }
  }

  private async guardDeactivation(accountId: string): Promise<void> {
    const hasRefs = await this.hasPostedReferences(accountId);
    if (hasRefs) {
      throw new BadRequestException(
        'Cannot deactivate an account with posted journal references',
      );
    }
  }
}

export const ACCOUNT_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'accounts',
  displayName: 'Account',
  apiResource: 'accounts',
  idField: 'id',
  fields: [
    { key: 'code', label: 'Code', type: 'string', required: true },
    { key: 'name', label: 'Name', type: 'string', required: true },
    {
      key: 'type',
      label: 'Type',
      type: 'enum',
      required: true,
      enumValues: Object.values(AccountType),
    },
    {
      key: 'parentAccountId',
      label: 'Parent Account',
      type: 'relation',
      relationEntity: 'accounts',
    },
    { key: 'isActive', label: 'Active', type: 'boolean' },
  ],
  searchableFields: ['code', 'name'],
  filterDefinitions: [
    {
      key: 'type',
      label: 'Type',
      type: 'select',
      options: Object.values(AccountType).map((t) => ({
        label: t,
        value: t,
      })),
    },
    {
      key: 'isActive',
      label: 'Active',
      type: 'boolean',
    },
  ],
  permissions: {
    create: 'accounting.journal.post',
    read: 'accounting.journal.post',
    update: 'accounting.journal.post',
    delete: 'accounting.journal.post',
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.DISABLED,
};
