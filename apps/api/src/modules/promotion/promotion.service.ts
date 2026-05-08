import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { PromotionEntity } from './promotion.entity';
import { CreatePromotionDto } from './dto/create-promotion.dto';

@Injectable()
export class PromotionService {
  private readonly logger = new Logger(PromotionService.name);

  constructor(
    @InjectRepository(PromotionEntity)
    private readonly repo: Repository<PromotionEntity>,
  ) {}

  async create(dto: CreatePromotionDto, actor: ActorContext): Promise<PromotionEntity> {
    const entity = this.repo.create({
      ...dto,
      validFrom: new Date(dto.validFrom),
      validTo: new Date(dto.validTo),
      applicableBranchIds: dto.applicableBranchIds ?? [],
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      isActive: true,
    });

    const saved = await this.repo.save(entity);
    this.logger.log(`Created promotion "${dto.name}" (org=${actor.organizationId})`);
    return saved;
  }

  async findAll(actor: ActorContext, branchId?: string): Promise<PromotionEntity[]> {
    const all = await this.repo.find({
      where: { organizationId: actor.organizationId, isActive: true },
      order: { createdAt: 'DESC' },
    });

    if (!branchId) return all;

    return all.filter(
      (p) =>
        !p.applicableBranchIds?.length ||
        p.applicableBranchIds.includes(branchId),
    );
  }

  async findOne(id: string, actor: ActorContext): Promise<PromotionEntity> {
    const entity = await this.repo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!entity) {
      throw new NotFoundException(`Promotion with id "${id}" not found`);
    }
    return entity;
  }

  async findByName(name: string, orgId: string): Promise<PromotionEntity> {
    const entity = await this.repo.findOne({
      where: { name, organizationId: orgId, isActive: true },
    });
    if (!entity) {
      throw new NotFoundException(`Promotion "${name}" not found or inactive`);
    }
    return entity;
  }

  async update(
    id: string,
    dto: Partial<CreatePromotionDto>,
    actor: ActorContext,
  ): Promise<PromotionEntity> {
    const entity = await this.findOne(id, actor);

    if (dto.name !== undefined) entity.name = dto.name;
    if (dto.type !== undefined) entity.type = dto.type;
    if (dto.conditions !== undefined) entity.conditions = dto.conditions;
    if (dto.benefits !== undefined) entity.benefits = dto.benefits;
    if (dto.validFrom !== undefined) (entity as any).validFrom = new Date(dto.validFrom);
    if (dto.validTo !== undefined) (entity as any).validTo = new Date(dto.validTo);
    if (dto.applicableBranchIds !== undefined) entity.applicableBranchIds = dto.applicableBranchIds;

    return this.repo.save(entity);
  }

  async deactivate(id: string, actor: ActorContext): Promise<PromotionEntity> {
    const entity = await this.findOne(id, actor);
    entity.isActive = false;
    return this.repo.save(entity);
  }

  async findActive(actor: ActorContext, branchId?: string): Promise<PromotionEntity[]> {
    const now = new Date();
    const all = await this.repo.find({
      where: { organizationId: actor.organizationId, isActive: true },
    });

    return all.filter((p) => {
      const withinTime = p.validFrom <= now && p.validTo >= now;
      const withinBranch =
        !branchId ||
        !p.applicableBranchIds?.length ||
        p.applicableBranchIds.includes(branchId);
      return withinTime && withinBranch;
    });
  }
}
