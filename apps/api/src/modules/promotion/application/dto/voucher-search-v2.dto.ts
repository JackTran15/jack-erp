import { IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CompareFilterDto, DateRangeFilterDto, EnumFilterDto, StringFilterDto } from '../../../../common/filters/filter.dto';

export class VoucherSearchV2Dto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
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
  issuer?: StringFilterDto;

  @ApiPropertyOptional({ type: StringFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  code?: StringFilterDto;

  @ApiPropertyOptional({ type: StringFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  description?: StringFilterDto;

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

  @ApiPropertyOptional({ type: EnumFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  status?: EnumFilterDto;

  @ApiPropertyOptional({ type: CompareFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  faceValue?: CompareFilterDto;
}
