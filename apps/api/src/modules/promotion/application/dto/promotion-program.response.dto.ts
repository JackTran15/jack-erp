import {
  PromotionProgramSummary,
  PromotionProgramDetail,
  PromotionGroupDto,
  PromotionLineDto,
  PromotionTierDto,
  PromotionConditionDto,
} from '@erp/shared-interfaces';
import { PromotionProgramEntity } from '../../infrastructure/entities';
import { PromotionProgram } from '../../domain/model/promotion-program';
import { PromotionLine } from '../../domain/model/promotion-line';
import { PromotionTier } from '../../domain/model/promotion-tier';
import { TimeOfDay } from '../../domain/model/value-objects/time-window';
import { toIsoDate } from '../date-format.util';

function formatWireTime(value?: TimeOfDay): string | undefined {
  if (!value) return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(value.hours)}:${pad(value.minutes)}`;
}

/** One row of POST /v2/promotions/search — no groups/lines/tiers, this is the list view. */
export function toSummary(entity: PromotionProgramEntity): PromotionProgramSummary {
  return {
    id: entity.id,
    code: entity.code,
    name: entity.name,
    description: entity.description ?? undefined,
    type: entity.type,
    status: entity.status,
    priority: entity.priority,
    applyTo: entity.applyTo,
    startDate: toIsoDate(entity.startDate),
    endDate: toIsoDate(entity.endDate),
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export interface ResolvedTarget {
  targetCode?: string;
  targetName?: string;
  unit?: string;
  sellingPrice?: number;
}

/** Looks up the display info for one line's polymorphic target — resolves to `undefined` fields, never throws, when the target no longer exists. */
export type TargetResolver = (line: PromotionLine) => ResolvedTarget;

function toLineDto(line: PromotionLine, resolveTarget: TargetResolver): PromotionLineDto {
  const resolved = resolveTarget(line);
  return {
    id: line.id,
    role: line.role,
    targetType: line.targetType,
    targetId: line.targetId,
    targetCode: resolved.targetCode,
    targetName: resolved.targetName,
    unit: resolved.unit,
    sellingPrice: resolved.sellingPrice,
    quantity: line.quantity,
    discountMode: line.discountMode,
    discountValue: line.discountValue,
    maxUnitPrice: line.maxUnitPrice,
    sortOrder: line.sortOrder,
  };
}

function toTierDto(tier: PromotionTier): PromotionTierDto {
  return {
    id: tier.id,
    fromValue: tier.fromValue,
    toValue: tier.toValue,
    discountMode: tier.discountMode,
    discountValue: tier.discountValue,
    sortOrder: tier.sortOrder,
  };
}

function toGroupDto(group: PromotionProgram['groups'][number], resolveTarget: TargetResolver): PromotionGroupDto {
  return {
    id: group.id,
    ordinal: group.ordinal,
    name: group.name,
    lines: group.lines.map((line) => toLineDto(line, resolveTarget)),
    tiers: group.tiers.map(toTierDto),
  };
}

function toConditionDto(condition: PromotionProgram['condition']): PromotionConditionDto | undefined {
  if (!condition) return undefined;
  return {
    type: condition.type,
    minAmount: condition.minAmount,
    calcBasis: condition.calcBasis,
    groupMatchMode: condition.groupMatchMode,
    multiplyGift: condition.multiplyGift,
  };
}

/** The full aggregate for GET /v2/promotions/:id — enough for the form to round-trip without another call. */
export function toDetail(program: PromotionProgram, resolveTarget: TargetResolver): PromotionProgramDetail {
  return {
    id: program.id!,
    code: program.code,
    name: program.name,
    description: program.description,
    type: program.type,
    status: program.status,
    priority: program.priority,
    applyTo: program.applyTo,
    birthdayMatch: program.birthdayMatch,
    birthdayBeforeDays: program.birthdayBeforeDays,
    birthdayAfterDays: program.birthdayAfterDays,
    cardTierId: program.cardTierId,
    customerGroupIds: program.customerGroupIds,
    startDate: toIsoDate(program.startDate),
    endDate: toIsoDate(program.endDate),
    daysOfWeek: program.daysOfWeek,
    startTime: formatWireTime(program.startTime),
    endTime: formatWireTime(program.endTime),
    autoApply: program.autoApply,
    branchIds: program.branchIds,
    invoiceScope: program.invoiceScope,
    accruePoints: program.accruePoints,
    discountMode: program.discountMode,
    discountValue: program.discountValue,
    maxDiscountAmount: program.maxDiscountAmount,
    tierBasis: program.tierBasis,
    tierScope: program.tierScope,
    targetType: program.targetType,
    giftMode: program.giftMode,
    buyGetPolicy: program.buyGetPolicy,
    buyQuantity: program.buyQuantity,
    giftQuantity: program.giftQuantity,
    groups: program.groups.map((group) => toGroupDto(group, resolveTarget)),
    condition: toConditionDto(program.condition),
    createdBy: program.createdBy,
    createdAt: program.createdAt!.toISOString(),
    updatedAt: program.updatedAt!.toISOString(),
  };
}
