import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { PaginationQuery, PaginatedResponse } from '@erp/shared-interfaces';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { OrganizationEntity, OrganizationStatus } from './organization.entity';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto';
import { CoaSeederService } from '../accounting/seeders/coa-seeder.service';
import { CashVoucherCategorySeederService } from '../accounting/cash-vouchers/cash-voucher-categories/cash-voucher-category.seeder';

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    private readonly coaSeederService: CoaSeederService,
    private readonly cashVoucherCategorySeederService: CashVoucherCategorySeederService,
  ) {}

  async create(
    dto: CreateOrganizationDto,
    actor: ActorContext,
  ): Promise<OrganizationEntity> {
    const existing = await this.orgRepo.findOne({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Organization "${dto.name}" already exists`);
    }

    const id = randomUUID();
    const org = this.orgRepo.create({
      ...dto,
      id,
      organizationId: id,
      createdBy: actor.userId,
      status: OrganizationStatus.ACTIVE,
    });

    const saved = await this.orgRepo.save(org);

    try {
      await this.coaSeederService.seedForOrganization(saved.id, actor.userId);
    } catch (err) {
      this.logger.error(
        `Failed to seed COA for new organization ${saved.id}: ${err instanceof Error ? err.message : err}`,
      );
    }

    try {
      await this.cashVoucherCategorySeederService.seedForOrganization(
        saved.id,
        actor.userId,
      );
    } catch (err) {
      this.logger.error(
        `Failed to seed cash voucher categories for new organization ${saved.id}: ${err instanceof Error ? err.message : err}`,
      );
    }

    this.logger.log(`Organization created: ${saved.id} by ${actor.userId}`);
    return saved;
  }

  async findById(
    id: string,
    actor: ActorContext,
  ): Promise<OrganizationEntity> {
    const org = await this.orgRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!org) {
      throw new NotFoundException(`Organization ${id} not found`);
    }
    return org;
  }

  async list(
    query: PaginationQuery,
    actor: ActorContext,
  ): Promise<PaginatedResponse<OrganizationEntity>> {
    const [data, total] = await this.orgRepo.findAndCount({
      where: { organizationId: actor.organizationId },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      order: query.sortBy
        ? { [query.sortBy]: query.sortOrder ?? 'asc' }
        : { createdAt: 'DESC' },
    });

    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async update(
    id: string,
    dto: UpdateOrganizationDto,
    actor: ActorContext,
  ): Promise<OrganizationEntity> {
    const org = await this.findById(id, actor);
    Object.assign(org, dto);
    return this.orgRepo.save(org);
  }

  async setMainBranch(
    orgId: string,
    branchId: string,
  ): Promise<void> {
    await this.orgRepo.update(orgId, { mainBranchId: branchId });
  }
}
