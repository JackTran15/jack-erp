import { PromotionProgram, PromotionProgramProps } from '../../domain/model/promotion-program';
import { PromotionGroup } from '../../domain/model/promotion-group';
import { PromotionLine } from '../../domain/model/promotion-line';
import { PromotionTier } from '../../domain/model/promotion-tier';
import { PromotionCondition } from '../../domain/model/promotion-condition';
import { TimeOfDay, TimeWindow } from '../../domain/model/value-objects/time-window';
import {
  PromotionProgramEntity,
  PromotionGroupEntity,
  PromotionLineEntity,
  PromotionTierEntity,
  PromotionConditionEntity,
  PromotionBranchEntity,
  PromotionCustomerGroupEntity,
} from '../../infrastructure/entities';

/** Everything a repository needs to load in order to build one PromotionProgram aggregate. */
export interface PromotionProgramRow {
  program: PromotionProgramEntity;
  groups: PromotionGroupEntity[];
  lines: PromotionLineEntity[];
  tiers: PromotionTierEntity[];
  condition?: PromotionConditionEntity;
  branchIds: string[];
  customerGroupIds: string[];
}

/** Everything a repository needs to persist one PromotionProgram aggregate. */
export interface PromotionPersistenceBundle {
  program: PromotionProgramEntity;
  groups: PromotionGroupEntity[];
  lines: PromotionLineEntity[];
  tiers: PromotionTierEntity[];
  condition?: PromotionConditionEntity;
  branches: PromotionBranchEntity[];
  customerGroups: PromotionCustomerGroupEntity[];
}

function toDomainNumber(value?: string | null): number | undefined {
  return value === undefined || value === null ? undefined : Number(value);
}

/**
 * `type: 'date'` columns come back from a real TypeORM/pg round-trip as a
 * plain `'YYYY-MM-DD'` string despite the entity's `Date` type annotation —
 * only in-memory fixtures (never touching Postgres) hand this a real Date.
 * Parsed via local components (not `new Date(str)`, which is UTC-midnight)
 * so `DateWindow`'s local-getter day comparison isn't off by one.
 */
function toDomainDate(value?: Date | string | null): Date | undefined {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toDbNumeric(value?: number): string | undefined {
  return value === undefined ? undefined : String(value);
}

function formatTimeOfDay(value?: TimeOfDay): string | undefined {
  if (!value) return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(value.hours)}:${pad(value.minutes)}:00`;
}

function toDomainLine(entity: PromotionLineEntity): PromotionLine {
  return {
    id: entity.id,
    role: entity.role,
    targetType: entity.targetType,
    targetId: entity.targetId,
    quantity: toDomainNumber(entity.quantity),
    discountMode: entity.discountMode,
    discountValue: toDomainNumber(entity.discountValue),
    maxUnitPrice: toDomainNumber(entity.maxUnitPrice),
    sortOrder: entity.sortOrder,
  };
}

function toDomainTier(entity: PromotionTierEntity): PromotionTier {
  return {
    id: entity.id,
    fromValue: Number(entity.fromValue),
    toValue: toDomainNumber(entity.toValue),
    discountMode: entity.discountMode,
    discountValue: Number(entity.discountValue),
    sortOrder: entity.sortOrder,
  };
}

function toDomainCondition(entity: PromotionConditionEntity): PromotionCondition {
  return {
    type: entity.type,
    minAmount: toDomainNumber(entity.minAmount),
    calcBasis: entity.calcBasis,
    groupMatchMode: entity.groupMatchMode,
    multiplyGift: entity.multiplyGift,
  };
}

export function toDomain(row: PromotionProgramRow): PromotionProgram {
  const groups: PromotionGroup[] = [...row.groups]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((group) => ({
      id: group.id,
      ordinal: group.ordinal,
      name: group.name,
      lines: row.lines
        .filter((line) => line.groupId === group.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(toDomainLine),
      tiers: row.tiers
        .filter((tier) => tier.groupId === group.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(toDomainTier),
    }));

  const props: PromotionProgramProps = {
    id: row.program.id,
    organizationId: row.program.organizationId,
    code: row.program.code,
    name: row.program.name,
    description: row.program.description,
    type: row.program.type,
    status: row.program.status,
    priority: row.program.priority,
    applyTo: row.program.applyTo,
    birthdayMatch: row.program.birthdayMatch,
    birthdayBeforeDays: row.program.birthdayBeforeDays,
    birthdayAfterDays: row.program.birthdayAfterDays,
    cardTierId: row.program.cardTierId,
    customerGroupIds: row.customerGroupIds,
    startDate: toDomainDate(row.program.startDate),
    endDate: toDomainDate(row.program.endDate),
    daysOfWeek: row.program.daysOfWeek,
    startTime: TimeWindow.parse(row.program.startTime),
    endTime: TimeWindow.parse(row.program.endTime),
    autoApply: row.program.autoApply,
    branchIds: row.branchIds,
    invoiceScope: row.program.invoiceScope,
    discountMode: row.program.discountMode,
    discountValue: toDomainNumber(row.program.discountValue),
    maxDiscountAmount: toDomainNumber(row.program.maxDiscountAmount),
    tierBasis: row.program.tierBasis,
    tierScope: row.program.tierScope,
    targetType: row.program.targetType,
    giftMode: row.program.giftMode,
    buyGetPolicy: row.program.buyGetPolicy,
    buyQuantity: row.program.buyQuantity,
    giftQuantity: row.program.giftQuantity,
    groups,
    condition: row.condition ? toDomainCondition(row.condition) : undefined,
    createdBy: row.program.createdBy,
    createdAt: row.program.createdAt,
    updatedAt: row.program.updatedAt,
  };

  return PromotionProgram.create(props);
}

/**
 * `aggregate.id` must already be set — the application layer assigns an id
 * (crypto.randomUUID()) to a brand-new aggregate and every group/line/tier
 * within it before calling PromotionProgram.create(), so the domain object is
 * always fully identified by the time it reaches this layer.
 *
 * The `branch_id` column every row inherits from BaseEntity (the creator's
 * branch) is deliberately left unset: it is not part of the domain model
 * (PromotionRepositoryPort.save() carries no actor/branch context) and is not
 * the promotion's applicable scope anyway — that is `promotion_branches` /
 * `aggregate.branchIds`. CTKM are managed centrally, not from a branch
 * context, so `NULL` ("org-wide record", per BaseEntity's own doc comment)
 * is the correct value here, not a placeholder.
 */
export function toPersistence(aggregate: PromotionProgram): PromotionPersistenceBundle {
  if (!aggregate.id) {
    throw new Error('Cannot persist a PromotionProgram with no id assigned');
  }
  const programId = aggregate.id;

  const program = new PromotionProgramEntity();
  program.id = programId;
  program.organizationId = aggregate.organizationId;
  program.createdBy = aggregate.createdBy;
  // Propagated verbatim (undefined for a not-yet-persisted aggregate, so the
  // DB default/@CreateDateColumn applies on insert). @UpdateDateColumn always
  // overwrites updatedAt on a real save regardless of this value, so setting
  // it here only matters for round-trip fidelity in the mapper's own tests.
  program.createdAt = aggregate.createdAt as Date;
  program.updatedAt = aggregate.updatedAt as Date;
  program.code = aggregate.code;
  program.name = aggregate.name;
  program.description = aggregate.description;
  program.type = aggregate.type;
  program.status = aggregate.status;
  program.priority = aggregate.priority;
  program.applyTo = aggregate.applyTo;
  program.birthdayMatch = aggregate.birthdayMatch;
  program.birthdayBeforeDays = aggregate.birthdayBeforeDays;
  program.birthdayAfterDays = aggregate.birthdayAfterDays;
  program.cardTierId = aggregate.cardTierId;
  program.startDate = aggregate.startDate;
  program.endDate = aggregate.endDate;
  program.daysOfWeek = aggregate.daysOfWeek;
  program.startTime = formatTimeOfDay(aggregate.startTime);
  program.endTime = formatTimeOfDay(aggregate.endTime);
  program.autoApply = aggregate.autoApply;
  program.invoiceScope = aggregate.invoiceScope;
  program.discountMode = aggregate.discountMode;
  program.discountValue = toDbNumeric(aggregate.discountValue);
  program.maxDiscountAmount = toDbNumeric(aggregate.maxDiscountAmount);
  program.tierBasis = aggregate.tierBasis;
  program.tierScope = aggregate.tierScope;
  program.targetType = aggregate.targetType;
  program.giftMode = aggregate.giftMode;
  program.buyGetPolicy = aggregate.buyGetPolicy;
  program.buyQuantity = aggregate.buyQuantity;
  program.giftQuantity = aggregate.giftQuantity;

  const groups: PromotionGroupEntity[] = [];
  const lines: PromotionLineEntity[] = [];
  const tiers: PromotionTierEntity[] = [];

  for (const group of aggregate.groups) {
    const groupEntity = new PromotionGroupEntity();
    groupEntity.id = group.id;
    groupEntity.organizationId = aggregate.organizationId;
    groupEntity.createdBy = aggregate.createdBy;
    groupEntity.programId = programId;
    groupEntity.ordinal = group.ordinal;
    groupEntity.name = group.name;
    groups.push(groupEntity);

    for (const line of group.lines) {
      const lineEntity = new PromotionLineEntity();
      lineEntity.id = line.id;
      lineEntity.organizationId = aggregate.organizationId;
      lineEntity.createdBy = aggregate.createdBy;
      lineEntity.programId = programId;
      lineEntity.groupId = group.id;
      lineEntity.role = line.role;
      lineEntity.targetType = line.targetType;
      lineEntity.targetId = line.targetId;
      lineEntity.quantity = toDbNumeric(line.quantity);
      lineEntity.discountMode = line.discountMode;
      lineEntity.discountValue = toDbNumeric(line.discountValue);
      lineEntity.maxUnitPrice = toDbNumeric(line.maxUnitPrice);
      lineEntity.sortOrder = line.sortOrder;
      lines.push(lineEntity);
    }

    for (const tier of group.tiers) {
      const tierEntity = new PromotionTierEntity();
      tierEntity.id = tier.id;
      tierEntity.organizationId = aggregate.organizationId;
      tierEntity.createdBy = aggregate.createdBy;
      tierEntity.programId = programId;
      tierEntity.groupId = group.id;
      tierEntity.fromValue = toDbNumeric(tier.fromValue)!;
      tierEntity.toValue = toDbNumeric(tier.toValue);
      tierEntity.discountMode = tier.discountMode;
      tierEntity.discountValue = toDbNumeric(tier.discountValue)!;
      tierEntity.sortOrder = tier.sortOrder;
      tiers.push(tierEntity);
    }
  }

  let condition: PromotionConditionEntity | undefined;
  if (aggregate.condition) {
    condition = new PromotionConditionEntity();
    condition.organizationId = aggregate.organizationId;
    condition.createdBy = aggregate.createdBy;
    condition.programId = programId;
    condition.type = aggregate.condition.type;
    condition.minAmount = toDbNumeric(aggregate.condition.minAmount);
    condition.calcBasis = aggregate.condition.calcBasis;
    condition.groupMatchMode = aggregate.condition.groupMatchMode;
    condition.multiplyGift = aggregate.condition.multiplyGift;
  }

  const branches = aggregate.branchIds.map((targetBranchId) => {
    const entity = new PromotionBranchEntity();
    entity.programId = programId;
    entity.branchId = targetBranchId;
    entity.organizationId = aggregate.organizationId;
    return entity;
  });

  const customerGroups = aggregate.customerGroupIds.map((customerGroupId) => {
    const entity = new PromotionCustomerGroupEntity();
    entity.programId = programId;
    entity.customerGroupId = customerGroupId;
    entity.organizationId = aggregate.organizationId;
    return entity;
  });

  return { program, groups, lines, tiers, condition, branches, customerGroups };
}
