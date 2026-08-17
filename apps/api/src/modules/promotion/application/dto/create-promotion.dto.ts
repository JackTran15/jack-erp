import {
  IsEnum,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ArrayNotEmpty,
  IsUUID,
  IsDateString,
  IsInt,
  IsNumber,
  IsBoolean,
  Min,
  Max,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PromotionProgramType,
  PromotionApplyTo,
  PromotionBirthdayMatch,
  PromotionInvoiceScope,
  PromotionDiscountMode,
  PromotionTierBasis,
  PromotionTierScope,
  PromotionTargetType,
  PromotionGiftMode,
  PromotionBuyGetPolicy,
  PromotionLineRole,
  PromotionConditionType,
  PromotionCalcBasis,
  PromotionGroupMatchMode,
} from '@erp/shared-interfaces';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class PromotionLineInputDto {
  @ApiProperty({ enum: PromotionLineRole })
  @IsEnum(PromotionLineRole)
  role: PromotionLineRole;

  @ApiProperty({ enum: PromotionTargetType })
  @IsEnum(PromotionTargetType)
  targetType: PromotionTargetType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ enum: PromotionDiscountMode })
  @IsOptional()
  @IsEnum(PromotionDiscountMode)
  discountMode?: PromotionDiscountMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  discountValue?: number;

  @ApiPropertyOptional({ description: '"Selling price <=" filter on the gift-item grid (FR-033)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxUnitPrice?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class PromotionTierInputDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  fromValue: number;

  @ApiPropertyOptional({ description: 'Omit for an unbounded (infinite) upper tier' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  toValue?: number;

  @ApiProperty({ enum: PromotionDiscountMode })
  @IsEnum(PromotionDiscountMode)
  discountMode: PromotionDiscountMode;

  @ApiProperty()
  @IsNumber()
  discountValue: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class PromotionGroupInputDto {
  @ApiProperty({ description: '0 for the implicit single group of every non-TIERED_DISCOUNT type' })
  @IsInt()
  @Min(0)
  ordinal: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ type: [PromotionLineInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromotionLineInputDto)
  lines?: PromotionLineInputDto[];

  @ApiPropertyOptional({ type: [PromotionTierInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromotionTierInputDto)
  tiers?: PromotionTierInputDto[];
}

export class PromotionConditionInputDto {
  @ApiProperty({ enum: PromotionConditionType })
  @IsEnum(PromotionConditionType)
  type: PromotionConditionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @ApiPropertyOptional({ enum: PromotionCalcBasis })
  @IsOptional()
  @IsEnum(PromotionCalcBasis)
  calcBasis?: PromotionCalcBasis;

  @ApiPropertyOptional({ enum: PromotionGroupMatchMode })
  @IsOptional()
  @IsEnum(PromotionGroupMatchMode)
  groupMatchMode?: PromotionGroupMatchMode;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  multiplyGift?: boolean;
}

export class CreatePromotionV2Dto {
  @ApiProperty({ enum: PromotionProgramType, description: 'Immutable after creation (FR-006) — change type by duplicating instead' })
  @IsEnum(PromotionProgramType)
  type: PromotionProgramType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: PromotionApplyTo })
  @IsEnum(PromotionApplyTo)
  applyTo: PromotionApplyTo;

  @ApiPropertyOptional({ enum: PromotionBirthdayMatch })
  @IsOptional()
  @IsEnum(PromotionBirthdayMatch)
  birthdayMatch?: PromotionBirthdayMatch;

  @ApiPropertyOptional({ description: 'Only when birthdayMatch = RANGE' })
  @IsOptional()
  @IsInt()
  @Min(0)
  birthdayBeforeDays?: number;

  @ApiPropertyOptional({ description: 'Only when birthdayMatch = RANGE' })
  @IsOptional()
  @IsInt()
  @Min(0)
  birthdayAfterDays?: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Only when applyTo = CARD_TIER' })
  @IsOptional()
  @IsUUID()
  cardTierId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Only when applyTo = CUSTOMER_GROUP' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  customerGroupIds?: string[];

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Omit for no start bound' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Omit for no end bound' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ type: [Number], description: 'ISO day-of-week (1=Monday..7=Sunday); empty = every day' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  daysOfWeek?: number[];

  @ApiPropertyOptional({ example: '18:00' })
  @IsOptional()
  @Matches(TIME_PATTERN)
  startTime?: string;

  @ApiPropertyOptional({ example: '21:00', description: 'endTime < startTime is an overnight window (FR-022), not an error' })
  @IsOptional()
  @Matches(TIME_PATTERN)
  endTime?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  autoApply?: boolean;

  @ApiPropertyOptional({ default: 100, description: 'Lower runs first when programs contend for the same resource (BR-001)' })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ type: [String], description: 'promotion_branches — empty = whole chain (BR-005)' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  branchIds?: string[];

  @ApiPropertyOptional({ enum: PromotionInvoiceScope, description: 'INVOICE_DISCOUNT only' })
  @IsOptional()
  @IsEnum(PromotionInvoiceScope)
  invoiceScope?: PromotionInvoiceScope;

  @ApiPropertyOptional({ default: false, description: 'INVOICE_DISCOUNT only' })
  @IsOptional()
  @IsBoolean()
  accruePoints?: boolean;

  @ApiPropertyOptional({ enum: PromotionDiscountMode, description: 'INVOICE_DISCOUNT only' })
  @IsOptional()
  @IsEnum(PromotionDiscountMode)
  discountMode?: PromotionDiscountMode;

  @ApiPropertyOptional({ description: 'INVOICE_DISCOUNT only' })
  @IsOptional()
  @IsNumber()
  discountValue?: number;

  @ApiPropertyOptional({ description: 'TIERED_DISCOUNT + tierBasis=INVOICE_VALUE only' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number;

  @ApiPropertyOptional({ enum: PromotionTierBasis, description: 'TIERED_DISCOUNT only' })
  @IsOptional()
  @IsEnum(PromotionTierBasis)
  tierBasis?: PromotionTierBasis;

  @ApiPropertyOptional({ enum: PromotionTierScope, description: 'TIERED_DISCOUNT only' })
  @IsOptional()
  @IsEnum(PromotionTierScope)
  tierScope?: PromotionTierScope;

  @ApiPropertyOptional({ enum: PromotionTargetType, description: 'Default grid target for TIERED_DISCOUNT/BUY_M_GET_N' })
  @IsOptional()
  @IsEnum(PromotionTargetType)
  targetType?: PromotionTargetType;

  @ApiPropertyOptional({ enum: PromotionGiftMode, description: 'GIFT_ITEM only' })
  @IsOptional()
  @IsEnum(PromotionGiftMode)
  giftMode?: PromotionGiftMode;

  @ApiPropertyOptional({ enum: PromotionBuyGetPolicy, description: 'BUY_M_GET_N only' })
  @IsOptional()
  @IsEnum(PromotionBuyGetPolicy)
  buyGetPolicy?: PromotionBuyGetPolicy;

  @ApiPropertyOptional({ description: 'BUY_M_GET_N only — the "m" in "buy m get n"' })
  @IsOptional()
  @IsInt()
  @Min(1)
  buyQuantity?: number;

  @ApiPropertyOptional({ description: 'BUY_M_GET_N only — the "n" in "buy m get n"' })
  @IsOptional()
  @IsInt()
  @Min(1)
  giftQuantity?: number;

  // Every strategy reads groups[0]; an empty array used to be stored happily
  // and then threw a TypeError on every price calculation (QA #8).
  @ApiProperty({ type: [PromotionGroupInputDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PromotionGroupInputDto)
  groups: PromotionGroupInputDto[];

  @ApiPropertyOptional({ type: PromotionConditionInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PromotionConditionInputDto)
  condition?: PromotionConditionInputDto;
}
