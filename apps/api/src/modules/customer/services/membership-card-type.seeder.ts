import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MembershipCardTypeEntity } from '../membership-card-type.entity';
import { MembershipTier } from '../membership-card.entity';

interface DefaultCardType {
  name: string;
  tier: MembershipTier;
  sortOrder: number;
}

export const DEFAULT_MEMBERSHIP_CARD_TYPES: DefaultCardType[] = [
  { tier: MembershipTier.SILVER, name: 'Thẻ Bạc', sortOrder: 1 },
  { tier: MembershipTier.GOLD, name: 'Thẻ Vàng', sortOrder: 2 },
  { tier: MembershipTier.DIAMOND, name: 'Thẻ Kim Cương', sortOrder: 3 },
];

@Injectable()
export class MembershipCardTypeSeederService {
  private readonly logger = new Logger(MembershipCardTypeSeederService.name);

  constructor(
    @InjectRepository(MembershipCardTypeEntity)
    private readonly repo: Repository<MembershipCardTypeEntity>,
  ) {}

  /**
   * Idempotently seeds default membership card types for an organization.
   * Upserts by (organizationId, tier) — safe to re-run.
   */
  async seedForOrganization(organizationId: string, actorId: string): Promise<number> {
    const existing = await this.repo.find({ where: { organizationId } });
    const existingTiers = new Set(existing.map((t) => t.tier));

    const toInsert = DEFAULT_MEMBERSHIP_CARD_TYPES.filter(
      (t) => !existingTiers.has(t.tier),
    );

    if (toInsert.length === 0) {
      this.logger.log(
        `Org ${organizationId} already has membership card types, skipping seed`,
      );
      return 0;
    }

    await this.repo.save(
      toInsert.map((t) =>
        this.repo.create({
          organizationId,
          tier: t.tier,
          name: t.name,
          sortOrder: t.sortOrder,
          isActive: true,
          createdBy: actorId,
        }),
      ),
    );

    this.logger.log(
      `Seeded ${toInsert.length} membership card types for organization ${organizationId}`,
    );
    return toInsert.length;
  }
}
