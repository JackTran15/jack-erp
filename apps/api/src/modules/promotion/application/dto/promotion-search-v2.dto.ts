import { IsInt, IsOptional, Matches, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DateRangeFilterDto, EnumFilterDto, StringFilterDto } from '../../../../common/filters/filter.dto';

/** "Đơn vị quản lý" filter value: chain-owned programs only. */
export const PROMOTION_OWNER_CHAIN = 'CHAIN';

/** `CHAIN` = chain-owned programs, a branch id = that branch's own programs (2026100301 AC-10). */
export class PromotionOwnerFilterDto {
  @ApiProperty({ description: "'CHAIN' or a branch id", example: PROMOTION_OWNER_CHAIN })
  @Matches(/^(CHAIN|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i, {
    message: "owner.value must be 'CHAIN' or a branch UUID",
  })
  value: string;
}

export class PromotionSearchV2Dto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50, description: 'FR-005: 50 rows/page by default' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({ type: StringFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  name?: StringFilterDto;

  @ApiPropertyOptional({ type: StringFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  description?: StringFilterDto;

  @ApiPropertyOptional({ type: EnumFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  type?: EnumFilterDto;

  @ApiPropertyOptional({ type: EnumFilterDto, description: 'Not applied by default — the "Tracking only" default is a FE-side chip (FR-004), not a hidden server filter' })
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  status?: EnumFilterDto;

  @ApiPropertyOptional({ type: EnumFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  applyTo?: EnumFilterDto;

  @ApiPropertyOptional({ type: DateRangeFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  startDate?: DateRangeFilterDto;

  @ApiPropertyOptional({ type: DateRangeFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  endDate?: DateRangeFilterDto;

  @ApiPropertyOptional({
    type: PromotionOwnerFilterDto,
    description: 'Đơn vị quản lý — honoured for promotion.chain.manage holders only; ignored for branch managers',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PromotionOwnerFilterDto)
  owner?: PromotionOwnerFilterDto;
}
