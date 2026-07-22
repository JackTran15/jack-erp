import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import {
  AccountType,
  ScopingPolicy,
  DeletionPolicy,
  CrudEntityConfig,
  PaginatedResponse,
} from '@erp/shared-interfaces';
import { BaseCrudService, CrudOperation } from '../../crud/base-crud.service';
import { PaginationQueryDto } from '../../crud/dto/pagination-query.dto';
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

  /**
   * Inline the parent account's human label so the admin grid shows a name
   * instead of a raw UUID. One batched lookup per page, never per row.
   */
  override async list(
    query: PaginationQueryDto,
    filters: Record<string, any>,
    actor: ActorContext,
  ): Promise<PaginatedResponse<AccountEntity>> {
    const page = await super.list(query, filters, actor);
    const parentIds = [
      ...new Set(
        page.data
          .map((r) => r.parentAccountId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (parentIds.length === 0) return page;

    const parents = await this.repository.find({
      where: { id: In(parentIds), organizationId: actor.organizationId },
    });
    const parentById = new Map(parents.map((p) => [p.id, p]));

    const data = page.data.map((row) => {
      const parent = row.parentAccountId
        ? parentById.get(row.parentAccountId)
        : undefined;
      return {
        ...row,
        parentAccountName: parent ? `${parent.code} - ${parent.name}` : '—',
      };
    }) as AccountEntity[];

    return { ...page, data };
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

/** Display labels for {@link AccountType} on the admin grid and form. */
const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  [AccountType.ASSET]: 'Tài sản',
  [AccountType.LIABILITY]: 'Nợ phải trả',
  [AccountType.EQUITY]: 'Vốn chủ sở hữu',
  [AccountType.REVENUE]: 'Doanh thu',
  [AccountType.EXPENSE]: 'Chi phí',
};

export const ACCOUNT_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'accounts',
  displayName: 'Tài khoản kế toán',
  apiResource: 'accounts',
  idField: 'id',
  fields: [
    { key: 'code', label: 'Mã', type: 'string', required: true },
    { key: 'name', label: 'Tên tài khoản', type: 'string', required: true },
    {
      key: 'type',
      label: 'Loại',
      type: 'enum',
      required: true,
      enumValues: Object.values(AccountType),
      enumLabels: ACCOUNT_TYPE_LABELS,
    },
    // Display-only label inlined by `list()`; the raw FK below is the form picker.
    {
      key: 'parentAccountName',
      label: 'Tài khoản cha',
      type: 'string',
      readOnly: true,
    },
    {
      key: 'parentAccountId',
      label: 'Tài khoản cha',
      type: 'relation',
      relationEntity: 'accounts',
      hideInList: true,
    },
    { key: 'isActive', label: 'Hoạt động', type: 'boolean' },
  ],
  searchableFields: ['code', 'name'],
  filterDefinitions: [
    {
      key: 'type',
      label: 'Loại',
      type: 'select',
      options: Object.values(AccountType).map((t) => ({
        label: ACCOUNT_TYPE_LABELS[t],
        value: t,
      })),
    },
    {
      key: 'isActive',
      label: 'Hoạt động',
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
