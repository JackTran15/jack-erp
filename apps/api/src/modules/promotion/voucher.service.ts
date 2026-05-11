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
import { VoucherEntity } from './voucher.entity';
import { CreateVoucherDto } from './dto/create-voucher.dto';

@Injectable()
export class VoucherService {
  private readonly logger = new Logger(VoucherService.name);

  constructor(
    @InjectRepository(VoucherEntity)
    private readonly repo: Repository<VoucherEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateVoucherDto, actor: ActorContext): Promise<VoucherEntity> {
    const existing = await this.repo.findOne({
      where: { code: dto.code, organizationId: actor.organizationId },
    });
    if (existing) {
      throw new ConflictException(`Voucher code "${dto.code}" already exists in this organization`);
    }

    const entity = this.repo.create({
      ...dto,
      validFrom: new Date(dto.validFrom),
      validTo: new Date(dto.validTo),
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      isUsed: false,
      isActive: true,
    });

    const saved = await this.repo.save(entity);
    this.logger.log(`Created voucher "${dto.code}" (org=${actor.organizationId})`);
    return saved;
  }

  async findAll(actor: ActorContext): Promise<VoucherEntity[]> {
    return this.repo.find({
      where: { organizationId: actor.organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, actor: ActorContext): Promise<VoucherEntity> {
    const entity = await this.repo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!entity) {
      throw new NotFoundException(`Voucher with id "${id}" not found`);
    }
    return entity;
  }

  async findByCode(code: string, actor: ActorContext): Promise<VoucherEntity> {
    const entity = await this.repo.findOne({
      where: { code, organizationId: actor.organizationId },
    });
    if (!entity) {
      throw new NotFoundException(`Voucher "${code}" not found`);
    }
    return entity;
  }

  async update(
    id: string,
    dto: Partial<CreateVoucherDto>,
    actor: ActorContext,
  ): Promise<VoucherEntity> {
    const entity = await this.findOne(id, actor);

    if (dto.validFrom !== undefined) (entity as any).validFrom = new Date(dto.validFrom);
    if (dto.validTo !== undefined) (entity as any).validTo = new Date(dto.validTo);
    if (dto.faceValue !== undefined) entity.faceValue = dto.faceValue;
    if (dto.customerId !== undefined) entity.customerId = dto.customerId;

    return this.repo.save(entity);
  }

  async deactivate(id: string, actor: ActorContext): Promise<VoucherEntity> {
    const entity = await this.findOne(id, actor);
    entity.isActive = false;
    return this.repo.save(entity);
  }

  async validate(
    code: string,
    customerId: string | undefined,
    actor: ActorContext,
  ): Promise<VoucherEntity> {
    const entity = await this.findByCode(code, actor);
    const now = new Date();

    if (!entity.isActive) {
      throw new BadRequestException(`Voucher "${code}" is not active`);
    }
    if (entity.isUsed) {
      throw new BadRequestException(`Voucher "${code}" has already been used`);
    }
    if (now < entity.validFrom) {
      throw new BadRequestException(`Voucher "${code}" is not yet valid`);
    }
    if (now > entity.validTo) {
      throw new BadRequestException(`Voucher "${code}" has expired`);
    }
    if (entity.customerId && entity.customerId !== customerId) {
      throw new BadRequestException(`Voucher "${code}" is not valid for this customer`);
    }

    return entity;
  }

  async markUsed(id: string, invoiceId: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(VoucherEntity) : this.repo;
    const result = await repo.update(
      { id, isUsed: false, isActive: true },
      { isUsed: true, redeemedInvoiceId: invoiceId },
    );
    if (result.affected === 0) {
      throw new ConflictException(`Voucher ${id} is already used or inactive`);
    }
  }

  async unmarkUsed(id: string, invoiceId: string, manager?: EntityManager): Promise<void> {
    const qb = manager
      ? manager.createQueryBuilder().update(VoucherEntity)
      : this.repo.createQueryBuilder().update(VoucherEntity);
    await qb
      .set({ isUsed: false, redeemedInvoiceId: () => 'NULL' })
      .where('id = :id AND redeemed_invoice_id = :invoiceId', { id, invoiceId })
      .execute();
  }
}
