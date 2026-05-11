import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { DiscountCodeEntity, DiscountType } from './discount-code.entity';
import { CreateDiscountCodeDto } from './dto/create-discount-code.dto';

@Injectable()
export class DiscountCodeService {
  private readonly logger = new Logger(DiscountCodeService.name);

  constructor(
    @InjectRepository(DiscountCodeEntity)
    private readonly repo: Repository<DiscountCodeEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateDiscountCodeDto, actor: ActorContext): Promise<DiscountCodeEntity> {
    const existing = await this.repo.findOne({
      where: { code: dto.code, organizationId: actor.organizationId },
    });
    if (existing) {
      throw new ConflictException(`Discount code "${dto.code}" already exists in this organization`);
    }

    const entity = this.repo.create({
      ...dto,
      validFrom: new Date(dto.validFrom),
      validTo: new Date(dto.validTo),
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      usedCount: 0,
      isActive: true,
    });

    const saved = await this.repo.save(entity);
    this.logger.log(`Created discount code "${dto.code}" (org=${actor.organizationId})`);
    return saved;
  }

  async findAll(actor: ActorContext): Promise<DiscountCodeEntity[]> {
    return this.repo.find({
      where: { organizationId: actor.organizationId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, actor: ActorContext): Promise<DiscountCodeEntity> {
    const entity = await this.repo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!entity) {
      throw new NotFoundException(`Discount code with id "${id}" not found`);
    }
    return entity;
  }

  async findByCode(code: string, actor: ActorContext): Promise<DiscountCodeEntity> {
    const entity = await this.repo.findOne({
      where: { code, organizationId: actor.organizationId },
    });
    if (!entity) {
      throw new NotFoundException(`Discount code "${code}" not found`);
    }
    return entity;
  }

  async update(
    id: string,
    dto: Partial<CreateDiscountCodeDto>,
    actor: ActorContext,
  ): Promise<DiscountCodeEntity> {
    const entity = await this.findOne(id, actor);

    if (dto.validFrom !== undefined) (entity as any).validFrom = new Date(dto.validFrom);
    if (dto.validTo !== undefined) (entity as any).validTo = new Date(dto.validTo);
    if (dto.discountType !== undefined) entity.discountType = dto.discountType;
    if (dto.discountValue !== undefined) entity.discountValue = dto.discountValue;
    if (dto.minOrderValue !== undefined) entity.minOrderValue = dto.minOrderValue;
    if (dto.maxUses !== undefined) entity.maxUses = dto.maxUses;

    return this.repo.save(entity);
  }

  async deactivate(id: string, actor: ActorContext): Promise<DiscountCodeEntity> {
    const entity = await this.findOne(id, actor);
    entity.isActive = false;
    return this.repo.save(entity);
  }

  async validate(
    code: string,
    orderValue: number,
    actor: ActorContext,
  ): Promise<DiscountCodeEntity> {
    const entity = await this.findByCode(code, actor);
    const now = new Date();

    if (!entity.isActive) {
      throw new BadRequestException(`Discount code "${code}" is not active`);
    }
    if (now < entity.validFrom) {
      throw new BadRequestException(`Discount code "${code}" is not yet valid`);
    }
    if (now > entity.validTo) {
      throw new BadRequestException(`Discount code "${code}" has expired`);
    }
    if (entity.maxUses !== undefined && entity.maxUses !== null && entity.usedCount >= entity.maxUses) {
      throw new BadRequestException(`Discount code "${code}" has reached its maximum uses`);
    }
    if (entity.minOrderValue && orderValue < entity.minOrderValue) {
      throw new BadRequestException(
        `Minimum order value of ${entity.minOrderValue} required for discount code "${code}"`,
      );
    }

    return entity;
  }

  async incrementUsedCount(id: string, manager?: EntityManager): Promise<void> {
    const qb = manager
      ? manager.createQueryBuilder().update(DiscountCodeEntity)
      : this.repo.createQueryBuilder().update(DiscountCodeEntity);
    const result = await qb
      .set({ usedCount: () => 'used_count + 1' })
      .where('id = :id AND (max_uses IS NULL OR used_count < max_uses)', { id })
      .execute();
    if (result.affected === 0) {
      throw new ConflictException(`Discount code ${id} has reached its usage limit`);
    }
  }

  async decrementUsedCount(id: string, manager?: EntityManager): Promise<void> {
    const qb = manager
      ? manager.createQueryBuilder().update(DiscountCodeEntity)
      : this.repo.createQueryBuilder().update(DiscountCodeEntity);
    await qb
      .set({ usedCount: () => 'GREATEST(used_count - 1, 0)' })
      .where('id = :id', { id })
      .execute();
  }
}
