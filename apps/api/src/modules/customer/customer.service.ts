import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not } from 'typeorm';
import { v4 as uuid } from 'uuid';
import {
  CustomerStatus,
  DomainEventType,
  ScopingPolicy,
  DeletionPolicy,
  CrudEntityConfig,
} from '@erp/shared-interfaces';
import { BaseCrudService, CrudOperation } from '../crud/base-crud.service';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { EventPublisher } from '../events/event-publisher.service';
import { CustomerEntity } from './customer.entity';
import { MembershipCardEntity, MembershipTier } from './membership-card.entity';
import { CreateCustomerDto, UpdateCustomerDto } from './dto';

export const CUSTOMER_SERVICE_TOKEN = 'CustomerService';

@Injectable()
export class CustomerService extends BaseCrudService<
  CustomerEntity,
  CreateCustomerDto,
  UpdateCustomerDto
> {
  protected readonly entityConfig: CrudEntityConfig = CUSTOMER_ENTITY_CONFIG;

  constructor(
    @InjectRepository(CustomerEntity)
    protected readonly repository: Repository<CustomerEntity>,
    @InjectRepository(MembershipCardEntity)
    private readonly cardRepository: Repository<MembershipCardEntity>,
    protected readonly dataSource: DataSource,
    private readonly eventPublisher: EventPublisher,
  ) {
    super(dataSource);
  }

  // ---------------------------------------------------------------------------
  // Create with optional membership card (transactional)
  // ---------------------------------------------------------------------------

  override async create(dto: CreateCustomerDto, actor: ActorContext): Promise<CustomerEntity> {
    const { membershipCard, ...customerFields } = dto;

    await this.validateBusinessRules('create', customerFields as CreateCustomerDto, actor);
    const prepared = await this.beforeCreate(customerFields as CreateCustomerDto, actor);

    let saved: CustomerEntity;

    await this.dataSource.transaction(async (manager) => {
      const entity = manager.create(CustomerEntity, {
        ...prepared,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
      });
      saved = await manager.save(entity);

      if (membershipCard) {
        const duplicate = await manager.findOne(MembershipCardEntity, {
          where: { cardNumber: membershipCard.cardNumber, organizationId: actor.organizationId },
        });
        if (duplicate) {
          throw new ConflictException(
            `Membership card number "${membershipCard.cardNumber}" already exists in this organization`,
          );
        }

        const today = new Date().toISOString().slice(0, 10);
        const card = manager.create(MembershipCardEntity, {
          organizationId: actor.organizationId,
          customerId: saved.id,
          cardNumber: membershipCard.cardNumber,
          tier: membershipCard.tier ?? MembershipTier.NONE,
          points: 0,
          issuedAt: new Date(membershipCard.issuedAt ?? today),
          expiresAt: membershipCard.expiresAt ? new Date(membershipCard.expiresAt) : undefined,
          lomasCardNumber: membershipCard.lomasCardNumber,
          lomasTier: membershipCard.lomasTier,
          isActive: true,
          createdBy: actor.userId,
        });
        await manager.save(card);
      }
    });

    this.logger.log(`Created customer id=${saved!.id} (org=${actor.organizationId})`);
    await this.afterCreate(saved!, actor);
    return saved!;
  }

  // ---------------------------------------------------------------------------
  // Hook overrides
  // ---------------------------------------------------------------------------

  protected override async beforeCreate(
    payload: CreateCustomerDto,
    actor: ActorContext,
  ): Promise<CreateCustomerDto> {
    await this.checkDuplicates(payload.email, payload.phone, actor.organizationId);
    return payload;
  }

  protected override async beforeUpdate(
    id: string,
    payload: UpdateCustomerDto,
    actor: ActorContext,
  ): Promise<UpdateCustomerDto> {
    const existing = await this.repository.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (existing?.status === CustomerStatus.MERGED) {
      throw new BadRequestException(
        'Cannot modify a merged customer. Use the target customer instead.',
      );
    }

    if (payload.email !== undefined || payload.phone !== undefined) {
      await this.checkDuplicates(
        payload.email,
        payload.phone,
        actor.organizationId,
        id,
      );
    }

    return payload;
  }

  protected override async validateBusinessRules(
    operation: CrudOperation,
    payload: any,
    _actor: ActorContext,
  ): Promise<void> {
    if (operation === 'delete') {
      const id = payload.id;
      if (id) {
        const existing = await this.repository.findOne({ where: { id } });
        if (existing?.status === CustomerStatus.MERGED) {
          throw new BadRequestException(
            'Cannot modify a merged customer. Use the target customer instead.',
          );
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Merge
  // ---------------------------------------------------------------------------

  async merge(
    sourceId: string,
    targetId: string,
    actor: ActorContext,
  ): Promise<CustomerEntity> {
    if (sourceId === targetId) {
      throw new BadRequestException('Source and target customer cannot be the same');
    }

    const [source, target] = await Promise.all([
      this.getById(sourceId, actor),
      this.getById(targetId, actor),
    ]);

    if (source.organizationId !== target.organizationId) {
      throw new BadRequestException('Customers must belong to the same organization');
    }

    if (source.status === CustomerStatus.MERGED) {
      throw new BadRequestException('Source customer is already merged');
    }

    if (target.status === CustomerStatus.MERGED) {
      throw new BadRequestException('Cannot merge into an already-merged customer');
    }

    const snapshotBefore = { ...source };

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      source.status = CustomerStatus.MERGED;
      source.mergedIntoId = targetId;
      await runner.manager.save(source);

      // Placeholder: re-link sales references from source to target
      // await runner.query(
      //   `UPDATE sales SET customer_id = $1 WHERE customer_id = $2`,
      //   [targetId, sourceId],
      // );

      // Placeholder: re-link receivables from source to target
      // await runner.query(
      //   `UPDATE receivables SET customer_id = $1 WHERE customer_id = $2`,
      //   [targetId, sourceId],
      // );

      await runner.commitTransaction();
    } catch (err) {
      await runner.rollbackTransaction();
      throw err;
    } finally {
      await runner.release();
    }

    const snapshotAfter = { ...source };

    await this.eventPublisher.publish('erp.customer.merged', {
      eventId: uuid(),
      eventType: DomainEventType.CUSTOMER_MERGED,
      timestamp: new Date().toISOString(),
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      correlationId: uuid(),
      payload: {
        sourceCustomerId: sourceId,
        targetCustomerId: targetId,
        actorId: actor.userId,
        before: snapshotBefore,
        after: snapshotAfter,
      },
    });

    this.logger.log(
      `Merged customer ${sourceId} into ${targetId} (org=${actor.organizationId})`,
    );

    return source;
  }

  // ---------------------------------------------------------------------------
  // Merge-aware lookup
  // ---------------------------------------------------------------------------

  async findByIdWithMergeCheck(
    id: string,
    actor: ActorContext,
    followRedirect = false,
  ): Promise<CustomerEntity> {
    const customer = await this.getById(id, actor);

    if (
      followRedirect &&
      customer.status === CustomerStatus.MERGED &&
      customer.mergedIntoId
    ) {
      return this.getById(customer.mergedIntoId, actor);
    }

    return customer;
  }

  // ---------------------------------------------------------------------------
  // Duplicate detection
  // ---------------------------------------------------------------------------

  private async checkDuplicates(
    email: string | undefined,
    phone: string | undefined,
    organizationId: string,
    excludeId?: string,
  ): Promise<void> {
    if (email) {
      const where: any = { email, organizationId };
      if (excludeId) where.id = Not(excludeId);

      const existing = await this.repository.findOne({ where });
      if (existing) {
        throw new ConflictException(
          `A customer with email "${email}" already exists in this organization`,
        );
      }
    }

    if (phone) {
      const where: any = { phone, organizationId };
      if (excludeId) where.id = Not(excludeId);

      const existing = await this.repository.findOne({ where });
      if (existing) {
        throw new ConflictException(
          `A customer with phone "${phone}" already exists in this organization`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Entity config for the generic CRUD registry
// ---------------------------------------------------------------------------

const CUSTOMER_STATUS_FILTER_LABELS: Record<CustomerStatus, string> = {
  [CustomerStatus.ACTIVE]: 'Hoạt động',
  [CustomerStatus.INACTIVE]: 'Ngừng hoạt động',
  [CustomerStatus.MERGED]: 'Đã gộp',
};

export const CUSTOMER_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'customers',
  displayName: 'Khách hàng',
  apiResource: 'customers',
  idField: 'id',
  fields: [
    { key: 'name', label: 'Tên khách hàng', type: 'string', required: true },
    { key: 'email', label: 'Email', type: 'string' },
    { key: 'phone', label: 'Điện thoại', type: 'string' },
    { key: 'address', label: 'Địa chỉ', type: 'string' },
    {
      key: 'status',
      label: 'Trạng thái',
      type: 'enum',
      enumValues: Object.values(CustomerStatus),
    },
  ],
  searchableFields: ['name', 'email', 'phone'],
  filterDefinitions: [
    {
      key: 'status',
      label: 'Trạng thái',
      type: 'select',
      options: Object.values(CustomerStatus).map((s) => ({
        label: CUSTOMER_STATUS_FILTER_LABELS[s],
        value: s,
      })),
    },
    { key: 'branchId', label: 'Chi nhánh', type: 'text' },
  ],
  permissions: {
    create: 'customer.write',
    read: 'customer.read',
    update: 'customer.write',
    delete: 'customer.write',
  },
  scopingPolicy: ScopingPolicy.BRANCH,
  deletionPolicy: DeletionPolicy.SOFT,
};
