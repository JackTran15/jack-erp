import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { MembershipCardEntity, MembershipTier } from '../membership-card.entity';
import { PointHistoryEntity, PointType } from '../point-history.entity';
import { IssueMembershipCardDto } from '../dto/issue-membership-card.dto';
import { AdjustPointsDto } from '../dto/adjust-points.dto';

@Injectable()
export class MembershipCardService {
  constructor(
    @InjectRepository(MembershipCardEntity)
    private readonly cardRepo: Repository<MembershipCardEntity>,
    @InjectRepository(PointHistoryEntity)
    private readonly historyRepo: Repository<PointHistoryEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async issueCard(
    customerId: string,
    dto: IssueMembershipCardDto,
    actor: ActorContext,
  ): Promise<MembershipCardEntity> {
    const existing = await this.cardRepo.findOne({
      where: { customerId, organizationId: actor.organizationId, isActive: true },
    });
    if (existing) {
      throw new ConflictException('An active membership card already exists for this customer');
    }

    const cardNumber = `MC${actor.organizationId.slice(0, 2).toUpperCase()}${String(Date.now()).slice(-6)}`;

    const card = this.cardRepo.create({
      organizationId: actor.organizationId,
      branchId: undefined,
      customerId,
      cardNumber,
      tier: dto.tier ?? MembershipTier.NONE,
      points: 0,
      issuedAt: new Date(dto.issuedAt),
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      lomasCardNumber: dto.lomasCardNumber,
      lomasTier: dto.lomasTier,
      isActive: true,
      createdBy: actor.userId,
    });

    return this.cardRepo.save(card);
  }

  async getCard(customerId: string, actor: ActorContext): Promise<MembershipCardEntity> {
    const card = await this.cardRepo.findOne({
      where: { customerId, organizationId: actor.organizationId },
    });
    if (!card) {
      throw new NotFoundException(`Membership card not found for customer ${customerId}`);
    }
    return card;
  }

  async updateCard(
    customerId: string,
    dto: Partial<IssueMembershipCardDto>,
    actor: ActorContext,
  ): Promise<MembershipCardEntity> {
    const card = await this.getCard(customerId, actor);

    if (dto.tier !== undefined) card.tier = dto.tier;
    if (dto.expiresAt !== undefined) card.expiresAt = new Date(dto.expiresAt);
    if (dto.lomasCardNumber !== undefined) card.lomasCardNumber = dto.lomasCardNumber;
    if (dto.lomasTier !== undefined) card.lomasTier = dto.lomasTier;

    return this.cardRepo.save(card);
  }

  async adjustPoints(
    cardId: string,
    dto: AdjustPointsDto,
    actor: ActorContext,
  ): Promise<MembershipCardEntity> {
    const card = await this.cardRepo.findOne({
      where: { id: cardId, organizationId: actor.organizationId },
    });
    if (!card) {
      throw new NotFoundException(`Membership card ${cardId} not found`);
    }

    if (dto.type === PointType.REDEEM && dto.delta >= 0) {
      throw new BadRequestException('Redeem delta must be negative');
    }

    const resultingPoints = card.points + dto.delta;
    if (resultingPoints < 0) {
      throw new BadRequestException(
        `Insufficient points: current=${card.points}, delta=${dto.delta}`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.increment(MembershipCardEntity, { id: cardId }, 'points', dto.delta);
      await manager.insert(PointHistoryEntity, {
        cardId,
        invoiceId: dto.invoiceId,
        type: dto.type,
        delta: dto.delta,
        note: dto.note,
        organizationId: actor.organizationId,
        createdBy: actor.userId,
      });
    });

    const updated = await this.cardRepo.findOne({ where: { id: cardId } });
    return updated!;
  }

  async awardPointsForInvoice(
    invoice: { id: string; customerId: string; subtotal: number },
    actor: ActorContext,
  ): Promise<void> {
    const card = await this.cardRepo.findOne({
      where: {
        customerId: invoice.customerId,
        organizationId: actor.organizationId,
        isActive: true,
      },
    });
    if (!card) return;

    const points = Math.floor(invoice.subtotal / 1000);
    if (points <= 0) return;

    await this.dataSource.transaction(async (manager) => {
      await manager.increment(MembershipCardEntity, { id: card.id }, 'points', points);
      await manager.insert(PointHistoryEntity, {
        cardId: card.id,
        invoiceId: invoice.id,
        type: PointType.EARN,
        delta: points,
        note: 'Tích điểm từ hóa đơn',
        organizationId: actor.organizationId,
        createdBy: actor.userId,
      });
    });
  }

  async getPointHistory(
    cardId: string,
    actor: ActorContext,
    page = 1,
    limit = 20,
  ): Promise<{ data: PointHistoryEntity[]; total: number; page: number; limit: number }> {
    const card = await this.cardRepo.findOne({
      where: { id: cardId, organizationId: actor.organizationId },
    });
    if (!card) {
      throw new NotFoundException(`Membership card ${cardId} not found`);
    }

    const [data, total] = await this.historyRepo.findAndCount({
      where: { cardId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }
}
