import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { PromotionRepositoryPort } from '../../domain/ports/promotion-repository.port';
import { PromotionProgram } from '../../domain/model/promotion-program';
import { toDomain, toPersistence } from '../../application/mappers/promotion.mapper';
import {
  PromotionProgramEntity,
  PromotionGroupEntity,
  PromotionLineEntity,
  PromotionTierEntity,
  PromotionConditionEntity,
  PromotionBranchEntity,
  PromotionCustomerGroupEntity,
} from '../entities';

@Injectable()
export class TypeormPromotionRepository implements PromotionRepositoryPort {
  constructor(
    @InjectRepository(PromotionProgramEntity)
    private readonly programRepo: Repository<PromotionProgramEntity>,
    @InjectRepository(PromotionGroupEntity)
    private readonly groupRepo: Repository<PromotionGroupEntity>,
    @InjectRepository(PromotionLineEntity)
    private readonly lineRepo: Repository<PromotionLineEntity>,
    @InjectRepository(PromotionTierEntity)
    private readonly tierRepo: Repository<PromotionTierEntity>,
    @InjectRepository(PromotionConditionEntity)
    private readonly conditionRepo: Repository<PromotionConditionEntity>,
    @InjectRepository(PromotionBranchEntity)
    private readonly branchRepo: Repository<PromotionBranchEntity>,
    @InjectRepository(PromotionCustomerGroupEntity)
    private readonly customerGroupRepo: Repository<PromotionCustomerGroupEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Loads the programmes the engine should *consider*, not the ones that
   * already qualify.
   *
   * Status, date window and branch scope are deliberately NOT filtered here.
   * `checkGenericEligibility` decides on all three and attaches a reason
   * (`STOPPED`, `DATE_WINDOW`, `BRANCH_SCOPE`) that the POS shows the cashier;
   * filtering them in SQL removed the row before it could ever carry a reason,
   * so a programme that was stopped or out of season simply vanished from the
   * dialog and nobody could tell the customer why.
   *
   * The ±1 year bound keeps this from dragging in years of history. It is
   * deliberately loose, not tight: a programme that ended yesterday — the case
   * a cashier actually hits — must still reach the reason stage.
   */
  async findActive(orgId: string, branchId: string, at: Date): Promise<PromotionProgram[]> {
    const from = new Date(at);
    from.setFullYear(from.getFullYear() - 1);
    const to = new Date(at);
    to.setFullYear(to.getFullYear() + 1);

    const programs = await this.programRepo
      .createQueryBuilder('p')
      .where('p.organizationId = :orgId', { orgId })
      .andWhere('p.deletedAt IS NULL')
      .andWhere('(p.endDate IS NULL OR p.endDate >= :from)', { from })
      .andWhere('(p.startDate IS NULL OR p.startDate <= :to)', { to })
      .getMany();

    return this.hydrate(programs);
  }

  async findById(orgId: string, id: string): Promise<PromotionProgram | null> {
    const program = await this.programRepo.findOne({ where: { id, organizationId: orgId } });
    if (!program) return null;
    const [aggregate] = await this.hydrate([program]);
    return aggregate ?? null;
  }

  async save(program: PromotionProgram): Promise<PromotionProgram> {
    const bundle = toPersistence(program);
    const programId = bundle.program.id;

    await this.dataSource.transaction(async (manager) => {
      await manager.save(PromotionProgramEntity, bundle.program);

      await manager.delete(PromotionGroupEntity, { programId });
      await manager.delete(PromotionLineEntity, { programId });
      await manager.delete(PromotionTierEntity, { programId });
      await manager.delete(PromotionConditionEntity, { programId });
      await manager.delete(PromotionBranchEntity, { programId });
      await manager.delete(PromotionCustomerGroupEntity, { programId });

      if (bundle.groups.length > 0) await manager.save(PromotionGroupEntity, bundle.groups);
      if (bundle.lines.length > 0) await manager.save(PromotionLineEntity, bundle.lines);
      if (bundle.tiers.length > 0) await manager.save(PromotionTierEntity, bundle.tiers);
      if (bundle.condition) await manager.save(PromotionConditionEntity, bundle.condition);
      if (bundle.branches.length > 0) await manager.save(PromotionBranchEntity, bundle.branches);
      if (bundle.customerGroups.length > 0) {
        await manager.save(PromotionCustomerGroupEntity, bundle.customerGroups);
      }
    });

    const saved = await this.findById(program.organizationId, programId);
    if (!saved) {
      throw new Error(`Failed to reload promotion program ${programId} after save`);
    }
    return saved;
  }

  async softDelete(orgId: string, id: string): Promise<void> {
    await this.programRepo.softDelete({ id, organizationId: orgId });
  }

  /**
   * Loads every child row for a batch of programs via 6 parallel `IN
   * (programIds)` queries — one per child table, not one per program — so
   * this stays O(1) round trips relative to the number of programs (the
   * actual N+1 concern) even though it is 6 statements rather than a single
   * one; the 6 tables can't be combined into one query without a
   * cross-join explosion between a group's lines and its tiers.
   */
  private async hydrate(programs: PromotionProgramEntity[]): Promise<PromotionProgram[]> {
    if (programs.length === 0) return [];
    const programIds = programs.map((program) => program.id);

    const [groups, lines, tiers, conditions, branches, customerGroups] = await Promise.all([
      this.groupRepo.find({ where: { programId: In(programIds) } }),
      this.lineRepo.find({ where: { programId: In(programIds) } }),
      this.tierRepo.find({ where: { programId: In(programIds) } }),
      this.conditionRepo.find({ where: { programId: In(programIds) } }),
      this.branchRepo.find({ where: { programId: In(programIds) } }),
      this.customerGroupRepo.find({ where: { programId: In(programIds) } }),
    ]);

    return programs.map((program) =>
      toDomain({
        program,
        groups: groups.filter((group) => group.programId === program.id),
        lines: lines.filter((line) => line.programId === program.id),
        tiers: tiers.filter((tier) => tier.programId === program.id),
        condition: conditions.find((condition) => condition.programId === program.id),
        branchIds: branches.filter((branch) => branch.programId === program.id).map((branch) => branch.branchId),
        customerGroupIds: customerGroups
          .filter((customerGroup) => customerGroup.programId === program.id)
          .map((customerGroup) => customerGroup.customerGroupId),
      }),
    );
  }
}
