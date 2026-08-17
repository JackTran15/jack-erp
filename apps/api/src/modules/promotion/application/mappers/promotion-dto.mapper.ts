import { randomUUID } from 'crypto';
import { PromotionStatus } from '@erp/shared-interfaces';
import { PromotionProgramProps } from '../../domain/model/promotion-program';
import { PromotionGroup } from '../../domain/model/promotion-group';
import { PromotionLine } from '../../domain/model/promotion-line';
import { PromotionTier } from '../../domain/model/promotion-tier';
import { PromotionCondition } from '../../domain/model/promotion-condition';
import { TimeWindow } from '../../domain/model/value-objects/time-window';
import {
  CreatePromotionV2Dto,
  PromotionGroupInputDto,
  PromotionLineInputDto,
  PromotionTierInputDto,
  PromotionConditionInputDto,
} from '../dto/create-promotion.dto';

function toLine(input: PromotionLineInputDto): PromotionLine {
  return {
    id: randomUUID(),
    role: input.role,
    targetType: input.targetType,
    targetId: input.targetId,
    quantity: input.quantity,
    discountMode: input.discountMode,
    discountValue: input.discountValue,
    maxUnitPrice: input.maxUnitPrice,
    sortOrder: input.sortOrder ?? 0,
  };
}

function toTier(input: PromotionTierInputDto): PromotionTier {
  return {
    id: randomUUID(),
    fromValue: input.fromValue,
    toValue: input.toValue,
    discountMode: input.discountMode,
    discountValue: input.discountValue,
    sortOrder: input.sortOrder ?? 0,
  };
}

function toGroup(input: PromotionGroupInputDto): PromotionGroup {
  return {
    id: randomUUID(),
    ordinal: input.ordinal,
    name: input.name,
    lines: (input.lines ?? []).map(toLine),
    tiers: (input.tiers ?? []).map(toTier),
  };
}

function toCondition(input?: PromotionConditionInputDto): PromotionCondition | undefined {
  if (!input) return undefined;
  return {
    type: input.type,
    minAmount: input.minAmount,
    calcBasis: input.calcBasis,
    groupMatchMode: input.groupMatchMode,
    multiplyGift: input.multiplyGift ?? false,
  };
}

export interface DtoToPropsContext {
  /** Set only when re-validating an existing aggregate (update); undefined generates identity for a brand-new one. */
  id?: string;
  organizationId: string;
  code: string;
  /** Preserved from the existing row on update — only ChangePromotionStatusCommand may change this. */
  status: PromotionStatus;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Converts the wire DTO into aggregate-construction props, assigning a fresh
 * id to every new group/line/tier — the DTO carries none, since these rows
 * do not exist yet (see TKT-KM-06's mapper: the domain aggregate must already
 * be fully identified by the time it reaches the repository).
 */
export function dtoToProgramProps(dto: CreatePromotionV2Dto, context: DtoToPropsContext): PromotionProgramProps {
  return {
    id: context.id,
    organizationId: context.organizationId,
    code: context.code,
    name: dto.name,
    description: dto.description,
    type: dto.type,
    status: context.status,
    priority: dto.priority ?? 100,
    applyTo: dto.applyTo,
    birthdayMatch: dto.birthdayMatch,
    birthdayBeforeDays: dto.birthdayBeforeDays,
    birthdayAfterDays: dto.birthdayAfterDays,
    cardTierId: dto.cardTierId,
    customerGroupIds: dto.customerGroupIds ?? [],
    startDate: dto.startDate ? new Date(dto.startDate) : undefined,
    endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    daysOfWeek: dto.daysOfWeek ?? [],
    startTime: TimeWindow.parse(dto.startTime),
    endTime: TimeWindow.parse(dto.endTime),
    autoApply: dto.autoApply ?? true,
    branchIds: dto.branchIds ?? [],
    invoiceScope: dto.invoiceScope,
    accruePoints: dto.accruePoints ?? false,
    discountMode: dto.discountMode,
    discountValue: dto.discountValue,
    maxDiscountAmount: dto.maxDiscountAmount,
    tierBasis: dto.tierBasis,
    tierScope: dto.tierScope,
    targetType: dto.targetType,
    giftMode: dto.giftMode,
    buyGetPolicy: dto.buyGetPolicy,
    buyQuantity: dto.buyQuantity,
    giftQuantity: dto.giftQuantity,
    groups: dto.groups.map(toGroup),
    condition: toCondition(dto.condition),
    createdBy: context.createdBy,
    createdAt: context.createdAt,
    updatedAt: context.updatedAt,
  };
}
